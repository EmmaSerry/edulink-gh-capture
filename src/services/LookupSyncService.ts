/**
 * Pulls the reference/lookup data a school's registration and
 * assessment screens need down into the local cache, so those screens
 * have something to read from once the connection drops.
 *
 * Deliberately a full wholesale refresh (clear each cache table, then
 * bulk-reload it) rather than an incremental diff - correct and simple
 * at the scale of one school's data (dozens of classes/subjects,
 * hundreds of students), and it means there is only ever one code path
 * to trust, not a "first sync" path and a separate "delta sync" path
 * that could quietly drift apart over time.
 *
 * Called after every successful sign-in, and available as a manual
 * "Refresh data" action - a teacher about to head out to a school with
 * no signal should run this once, on the way out, while still online.
 */
import { rest } from "@/lib/supabaseClient";
import { captureDb } from "@/lib/offlineDb";
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
} from "@/types/database";

export const LookupSyncService = {
  async syncAll(): Promise<void> {
    const [academicYears, terms, levels, classes, subjects, learningAreas, skills, students] = await Promise.all([
      rest.select<AcademicYearRow>("academic_years"),
      rest.select<TermRow>("terms"),
      rest.select<LevelRow>("levels", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<ClassRow>("classes", { filters: { is_active: "eq.true" } }),
      rest.select<SubjectRow>("subjects", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<LearningAreaRow>("learning_areas", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<SkillRow>("skills", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<StudentRow>("students"),
    ]);

    const activeTerm = terms.find((t) => t.is_active) ?? null;
    let enrollments: EnrollmentRow[] = [];
    let scoreRecords: ScoreRecordRow[] = [];
    let skillRatings: SkillAssessmentRecordRow[] = [];
    if (activeTerm) {
      [enrollments, scoreRecords, skillRatings] = await Promise.all([
        rest.select<EnrollmentRow>("enrollments", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<ScoreRecordRow>("score_records", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<SkillAssessmentRecordRow>("skill_assessment_records", { filters: { term_id: `eq.${activeTerm.id}` } }),
      ]);
    }

    await captureDb.transaction(
      "rw",
      [
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
        captureDb.meta,
      ],
      async () => {
        await captureDb.academicYears.clear();
        await captureDb.academicYears.bulkAdd(academicYears);
        await captureDb.terms.clear();
        await captureDb.terms.bulkAdd(terms);
        await captureDb.levels.clear();
        await captureDb.levels.bulkAdd(levels);
        await captureDb.classes.clear();
        await captureDb.classes.bulkAdd(classes);
        await captureDb.subjects.clear();
        await captureDb.subjects.bulkAdd(subjects);
        await captureDb.learningAreas.clear();
        await captureDb.learningAreas.bulkAdd(learningAreas);
        await captureDb.skills.clear();
        await captureDb.skills.bulkAdd(skills);
        await captureDb.students.clear();
        await captureDb.students.bulkAdd(students);
        await captureDb.enrollments.clear();
        await captureDb.enrollments.bulkAdd(enrollments);
        await captureDb.scoreRecords.clear();
        await captureDb.scoreRecords.bulkAdd(scoreRecords);
        await captureDb.skillRatings.clear();
        await captureDb.skillRatings.bulkAdd(skillRatings);
        await captureDb.meta.put({ key: "lastLookupSyncAt", value: new Date().toISOString() });
      }
    );
  },
};
