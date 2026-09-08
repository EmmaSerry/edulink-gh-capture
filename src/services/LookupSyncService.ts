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
  SchoolRow,
  ReportRecordRow,
  FeeStructureRow,
  StudentFeeRow,
  FeePaymentRow,
} from "@/types/database";

export const LookupSyncService = {
  async syncAll(): Promise<void> {
    const [academicYears, terms, levels, classes, subjects, learningAreas, skills, students, schools] = await Promise.all([
      rest.select<AcademicYearRow>("academic_years"),
      rest.select<TermRow>("terms"),
      rest.select<LevelRow>("levels", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<ClassRow>("classes", { filters: { is_active: "eq.true" } }),
      rest.select<SubjectRow>("subjects", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<LearningAreaRow>("learning_areas", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<SkillRow>("skills", { filters: { is_active: "eq.true" }, order: "sort_order.asc" }),
      rest.select<StudentRow>("students"),
      // Just the caller's own school - RLS scopes this the same way it
      // scopes everything else fetched here. Needed so the offline
      // Remarks & attendance screen can prefill the headteacher's name
      // exactly like CloudReportRemarksEntry does.
      rest.select<SchoolRow>("schools"),
    ]);

    const activeTerm = terms.find((t) => t.is_active) ?? null;
    let enrollments: EnrollmentRow[] = [];
    let scoreRecords: ScoreRecordRow[] = [];
    let skillRatings: SkillAssessmentRecordRow[] = [];
    let reportRecords: ReportRecordRow[] = [];
    let feeStructures: FeeStructureRow[] = [];
    let studentFees: StudentFeeRow[] = [];
    if (activeTerm) {
      [enrollments, scoreRecords, skillRatings, reportRecords, feeStructures, studentFees] = await Promise.all([
        rest.select<EnrollmentRow>("enrollments", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<ScoreRecordRow>("score_records", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<SkillAssessmentRecordRow>("skill_assessment_records", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<ReportRecordRow>("report_records", { filters: { term_id: `eq.${activeTerm.id}` } }),
        // Fee structure setup and "generate this term's fees" stay
        // office/online-only - these two reads exist purely so a
        // bursar can record a payment against a fee already generated
        // online, with no signal. RLS returns an empty list here for
        // anyone who isn't a fee manager (bursar/school_admin/
        // district_admin/platform_admin) - not an error, just nothing
        // to cache, same as every other role-scoped table.
        rest.select<FeeStructureRow>("fee_structures", { filters: { term_id: `eq.${activeTerm.id}` } }),
        rest.select<StudentFeeRow>("student_fees", { filters: { term_id: `eq.${activeTerm.id}` } }),
      ]);
    }
    // Not term-scoped in the schema (fee_payments only carries a
    // student_fee_id) - fetched in full, same reasoning as `students`
    // above. RLS still limits this to the caller's own school.
    const feePayments = await rest.select<FeePaymentRow>("fee_payments");

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
        captureDb.schools,
        captureDb.reportRecords,
        captureDb.feeStructures,
        captureDb.studentFees,
        captureDb.feePayments,
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
        await captureDb.schools.clear();
        await captureDb.schools.bulkAdd(schools);
        await captureDb.reportRecords.clear();
        await captureDb.reportRecords.bulkAdd(reportRecords);
        await captureDb.feeStructures.clear();
        await captureDb.feeStructures.bulkAdd(feeStructures);
        await captureDb.studentFees.clear();
        await captureDb.studentFees.bulkAdd(studentFees);
        await captureDb.feePayments.clear();
        await captureDb.feePayments.bulkAdd(feePayments);
        await captureDb.meta.put({ key: "lastLookupSyncAt", value: new Date().toISOString() });
      }
    );
  },
};
