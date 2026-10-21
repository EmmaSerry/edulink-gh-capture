/**
 * Pulls the reference/lookup data a school's registration and
 * assessment screens need down into the local cache, so those screens
 * have something to read from once the connection drops.
 *
 * Deliberately a full wholesale refresh per table (clear it, then
 * bulk-reload it) rather than an incremental diff - correct and simple
 * at the scale of one school's data, and there is only one code path.
 *
 * Made resilient after "canceling statement due to statement timeout"
 * appeared on refresh:
 *   - tables are fetched in small groups, not all at once, so the
 *     database is never hit with a dozen heavy reads simultaneously;
 *   - every read is retried, and a big table that times out falls back
 *     to being read in pages;
 *   - a TEACHER's learners are fetched by id (from their own classes'
 *     enrollments) instead of scanning the whole students table;
 *   - if one table still cannot be read, its OLD cached copy is kept
 *     (never wiped), everything else is refreshed, and the error names
 *     the table - so a failed refresh can no longer leave the app empty.
 *
 * A TEACHER only gets their own class(es) cached and only those
 * classes' levels. Everyone else still gets every class.
 */
import { rest } from "@/lib/supabaseClient";
import { captureDb, getCachedProfile } from "@/lib/offlineDb";
import type {
  AcademicYearRow,
  TermRow,
  LevelRow,
  ClassRow,
  SubjectRow,
  LearningAreaRow,
  SkillRow,
  StudentRow,
  EnrollmentRow,
  ScoreRecordRow,
  SkillAssessmentRecordRow,
  SchoolRow,
  ReportRecordRow,
  FeeStructureRow,
  StudentFeeRow,
  FeePaymentRow,
} from "@/types/database";

type Query = { filters?: Record<string, string>; order?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 500;
const ID_CHUNK = 80;

/** One read, retried; big tables fall back to paging when a single read keeps failing. */
async function fetchTable<T>(table: string, query: Query = {}, pageable = false): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await rest.select<T>(table, query);
    } catch (e) {
      lastError = e;
      await sleep(700 * (attempt + 1));
    }
  }
  if (pageable) {
    try {
      const out: T[] = [];
      for (let offset = 0; ; offset += PAGE) {
        let page: T[] | null = null;
        let pageError: unknown;
        for (let attempt = 0; attempt < 3 && page === null; attempt++) {
          try {
            page = await rest.select<T>(table, {
              ...query,
              order: query.order ?? "id.asc",
              limit: PAGE,
              filters: { ...(query.filters ?? {}), offset: String(offset) },
            } as Query & { limit: number });
          } catch (e) {
            pageError = e;
            await sleep(700 * (attempt + 1));
          }
        }
        if (page === null) throw pageError;
        out.push(...page);
        if (page.length < PAGE) return out;
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Runs a list of named jobs a few at a time; collects failures instead of throwing. */
async function runGroup(
  jobs: Array<{ name: string; run: () => Promise<unknown> }>,
  failures: Map<string, string>
): Promise<void> {
  await Promise.all(
    jobs.map(async (j) => {
      try {
        await j.run();
      } catch (e) {
        failures.set(j.name, e instanceof Error ? e.message : String(e));
      }
    })
  );
}

export const LookupSyncService = {
  async syncAll(): Promise<void> {
    const failures = new Map<string, string>();
    const got: Record<string, unknown[]> = {};
    const grab = <T,>(name: string, fn: () => Promise<T[]>) => ({
      name,
      run: async () => {
        got[name] = await fn();
      },
    });

    // 1. Small lookup tables.
    await runGroup(
      [
        grab<AcademicYearRow>("academicYears", () => fetchTable("academic_years")),
        grab<TermRow>("terms", () => fetchTable("terms")),
        grab<LevelRow>("levels", () => fetchTable("levels", { filters: { is_active: "eq.true" }, order: "sort_order.asc" })),
        grab<ClassRow>("classes", () => fetchTable("classes", { filters: { is_active: "eq.true" } })),
        grab<SchoolRow>("schools", () => fetchTable("schools")),
      ],
      failures
    );
    await runGroup(
      [
        grab<SubjectRow>("subjects", () => fetchTable("subjects", { filters: { is_active: "eq.true" }, order: "sort_order.asc" })),
        grab<LearningAreaRow>("learningAreas", () =>
          fetchTable("learning_areas", { filters: { is_active: "eq.true" }, order: "sort_order.asc" })
        ),
        grab<SkillRow>("skills", () => fetchTable("skills", { filters: { is_active: "eq.true" }, order: "sort_order.asc" })),
      ],
      failures
    );

    // A teacher only works with the class(es) assigned to them.
    const me = await getCachedProfile();
    const isTeacher = me?.role === "teacher";
    let classes = (got.classes as ClassRow[] | undefined) ?? null;
    let levels = (got.levels as LevelRow[] | undefined) ?? null;
    if (isTeacher && classes && levels) {
      classes = classes.filter((c) => c.class_teacher_id === me!.id);
      const ownLevelIds = new Set(classes.map((c) => c.level_id));
      levels = levels.filter((l) => ownLevelIds.has(l.id));
      got.classes = classes;
      got.levels = levels;
    }
    const ownClassIds = isTeacher && classes ? classes.map((c) => c.id) : null;

    // 2. Term-scoped data.
    const terms = (got.terms as TermRow[] | undefined) ?? (await captureDb.terms.toArray());
    const activeTerm = terms.find((t) => t.is_active) ?? null;

    if (activeTerm) {
      const termFilter = { term_id: `eq.${activeTerm.id}` };
      const enrollFilter: Record<string, string> = { ...termFilter };
      if (ownClassIds) {
        // A teacher with no class assigned must get nothing, not everyone's enrollments.
        enrollFilter.class_id = `in.(${ownClassIds.length > 0 ? ownClassIds.join(",") : "00000000-0000-0000-0000-000000000000"})`;
      }

      // Enrollments first: a teacher's learner list is derived from them.
      await runGroup([grab<EnrollmentRow>("enrollments", () => fetchTable("enrollments", { filters: enrollFilter }, true))], failures);

      await runGroup(
        [
          grab<StudentRow>("students", async () => {
            const enrolled = got.enrollments as EnrollmentRow[] | undefined;
            if (ownClassIds && enrolled) {
              const ids = [...new Set(enrolled.map((e) => e.student_id))];
              const out: StudentRow[] = [];
              for (let i = 0; i < ids.length; i += ID_CHUNK) {
                const chunk = ids.slice(i, i + ID_CHUNK);
                out.push(...(await fetchTable<StudentRow>("students", { filters: { id: `in.(${chunk.join(",")})` } })));
              }
              return out;
            }
            return fetchTable<StudentRow>("students", {}, true);
          }),
          grab<ScoreRecordRow>("scoreRecords", () => fetchTable("score_records", { filters: termFilter }, true)),
        ],
        failures
      );
      await runGroup(
        [
          grab<SkillAssessmentRecordRow>("skillRatings", () => fetchTable("skill_assessment_records", { filters: termFilter }, true)),
          grab<ReportRecordRow>("reportRecords", () => fetchTable("report_records", { filters: termFilter }, true)),
          grab<FeeStructureRow>("feeStructures", () => fetchTable("fee_structures", { filters: termFilter })),
        ],
        failures
      );
      // Fee reads exist so a bursar can record a payment offline; RLS returns
      // an empty list for anyone who isn't a fee manager.
      await runGroup(
        [
          grab<StudentFeeRow>("studentFees", () => fetchTable("student_fees", { filters: termFilter }, true)),
          grab<FeePaymentRow>("feePayments", () => fetchTable("fee_payments", {}, true)),
        ],
        failures
      );
    }

    // Nothing at all came back (e.g. truly offline): leave the cache exactly as it was.
    if (Object.keys(got).length === 0) {
      throw new Error(`Could not refresh data: ${[...failures.values()][0] ?? "no connection"}`);
    }

    const dexieTables = [
      captureDb.academicYears,
      captureDb.terms,
      captureDb.levels,
      captureDb.classes,
      captureDb.subjects,
      captureDb.learningAreas,
      captureDb.skills,
      captureDb.students,
      captureDb.enrollments,
      captureDb.scoreRecords,
      captureDb.skillRatings,
      captureDb.schools,
      captureDb.reportRecords,
      captureDb.feeStructures,
      captureDb.studentFees,
      captureDb.feePayments,
      captureDb.meta,
    ];

    // Only tables that were read successfully are replaced; a failed table keeps its old cache.
    await captureDb.transaction("rw", dexieTables, async () => {
      if (got.academicYears) {
        await captureDb.academicYears.clear();
        await captureDb.academicYears.bulkAdd(got.academicYears as AcademicYearRow[]);
      }
      if (got.terms) {
        await captureDb.terms.clear();
        await captureDb.terms.bulkAdd(got.terms as TermRow[]);
      }
      if (got.levels) {
        await captureDb.levels.clear();
        await captureDb.levels.bulkAdd(got.levels as LevelRow[]);
      }
      if (got.classes) {
        await captureDb.classes.clear();
        await captureDb.classes.bulkAdd(got.classes as ClassRow[]);
      }
      if (got.subjects) {
        await captureDb.subjects.clear();
        await captureDb.subjects.bulkAdd(got.subjects as SubjectRow[]);
      }
      if (got.learningAreas) {
        await captureDb.learningAreas.clear();
        await captureDb.learningAreas.bulkAdd(got.learningAreas as LearningAreaRow[]);
      }
      if (got.skills) {
        await captureDb.skills.clear();
        await captureDb.skills.bulkAdd(got.skills as SkillRow[]);
      }
      if (got.students) {
        await captureDb.students.clear();
        await captureDb.students.bulkAdd(got.students as StudentRow[]);
      }
      if (got.enrollments) {
        await captureDb.enrollments.clear();
        await captureDb.enrollments.bulkAdd(got.enrollments as EnrollmentRow[]);
      }
      if (got.scoreRecords) {
        await captureDb.scoreRecords.clear();
        await captureDb.scoreRecords.bulkAdd(got.scoreRecords as ScoreRecordRow[]);
      }
      if (got.skillRatings) {
        await captureDb.skillRatings.clear();
        await captureDb.skillRatings.bulkAdd(got.skillRatings as SkillAssessmentRecordRow[]);
      }
      if (got.schools) {
        await captureDb.schools.clear();
        await captureDb.schools.bulkAdd(got.schools as SchoolRow[]);
      }
      if (got.reportRecords) {
        await captureDb.reportRecords.clear();
        await captureDb.reportRecords.bulkAdd(got.reportRecords as ReportRecordRow[]);
      }
      if (got.feeStructures) {
        await captureDb.feeStructures.clear();
        await captureDb.feeStructures.bulkAdd(got.feeStructures as FeeStructureRow[]);
      }
      if (got.studentFees) {
        await captureDb.studentFees.clear();
        await captureDb.studentFees.bulkAdd(got.studentFees as StudentFeeRow[]);
      }
      if (got.feePayments) {
        await captureDb.feePayments.clear();
        await captureDb.feePayments.bulkAdd(got.feePayments as FeePaymentRow[]);
      }
      if (failures.size === 0) {
        await captureDb.meta.put({ key: "lastLookupSyncAt", value: new Date().toISOString() });
      }
    });

    if (failures.size > 0) {
      const names = [...failures.keys()].join(", ");
      throw new Error(`Some data could not be refreshed yet (${names}). Your other data was updated - tap Refresh to try again.`);
    }
  },
};
