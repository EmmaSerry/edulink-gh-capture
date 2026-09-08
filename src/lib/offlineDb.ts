/**
 * Local database for the EduLink GH Capture app (IndexedDB via Dexie).
 *
 * This is NOT the offline single-school ACTRS database (that one owns
 * every table itself, forever, with no server). This one is a thin,
 * disposable CACHE + OUTBOX in front of the same Supabase project the
 * cloud dashboard talks to:
 *
 *  - The "cache" tables (levels, classes, subjects, learningAreas,
 *    skills, terms, academicYears, students, enrollments, scoreRecords,
 *    skillRatings, sessions) are a read-only mirror of server rows,
 *    refreshed wholesale by LookupSyncService whenever online. They
 *    exist purely so registration/assessment screens have something to
 *    read from (dropdown options, existing scores) while offline - they
 *    are never the source of truth and can be safely wiped and
 *    re-synced at any time.
 *  - The "outbox" table is the actual source of truth for anything
 *    captured while offline: one row per pending write (register a
 *    student, save a score, save a skill rating), queued in the order
 *    it was captured. SyncEngine drains this queue against the exact
 *    same Postgres RPCs the cloud app calls, the moment a connection is
 *    available - nothing is ever written straight to a cache table by
 *    the UI itself.
 *
 * Row primary keys throughout are the server's own UUID strings (never
 * re-keyed to a local auto-increment id) - see SyncEngine.ts for why
 * that one choice is what makes offline capture safe with no separate
 * "local id -> server id" reconciliation step.
 */
import Dexie, { type Table } from "dexie";
import type {
  AcademicYearRow,
  TermRow,
  LevelRow,
  ClassRow,
  SubjectRow,
  LearningAreaRow,
  SkillRow,
  SkillRating,
  StudentRow,
  EnrollmentRow,
  ScoreRecordRow,
  SkillAssessmentRecordRow,
  AssessmentSessionRow,
  UserProfileRow,
  SchoolRow,
  ReportRecordRow,
  FeeStructureRow,
  StudentFeeRow,
  FeePaymentRow,
  FeePaymentMethod,
} from "@/types/database";

export type OutboxActionType =
  | "REGISTER_STUDENT"
  | "UPSERT_SCORE"
  | "UPSERT_SKILL_RATING"
  | "UPSERT_REPORT_FIELDS"
  | "RECORD_PAYMENT";
export type OutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface RegisterStudentPayload {
  schoolId: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  dateOfBirth: string;
  academicYearId: string;
  termId: string;
  levelId: string;
  classId: string;
  guardianFullName: string;
  guardianRelationship: string;
  guardianPhone: string;
  /** A small JPEG data URL from PassportPhotoCropper, already
   *  cropped/compressed entirely on-device - stored as a plain string
   *  here (not a Blob) so it rides along in the outbox exactly like
   *  every other field, with no special IndexedDB handling needed. */
  photoDataUrl?: string | null;
}

/** Either `studentId` (a real, already-known server UUID) or
 *  `studentClientId` (the outbox clientId of a REGISTER_STUDENT entry
 *  captured moments earlier, not yet synced) must be set - never both
 *  unset. SyncEngine resolves `studentClientId` to a real id the moment
 *  that registration succeeds, whether that happens in this same sync
 *  pass or a later one. */
export interface UpsertScorePayload {
  studentId?: string;
  studentClientId?: string;
  termId: string;
  subjectId: string;
  classId: string;
  field: "sbaScore" | "examScore";
  value: number | null;
}

export interface UpsertSkillRatingPayload {
  studentId?: string;
  studentClientId?: string;
  termId: string;
  skillId: string;
  classId: string;
  rating: SkillRating | null;
  comment: string | null;
}

/** Attendance plus the free-text remarks fields, one row per
 *  student+term - the offline counterpart of CloudReportRecordService.
 *  upsertFields(). `changes` only ever carries the fields the Remarks &
 *  attendance screen actually edited (never a full row), same as the
 *  cloud app's upsert_report_fields() RPC expects. */
export interface UpsertReportFieldsPayload {
  studentId?: string;
  studentClientId?: string;
  termId: string;
  classId: string;
  changes: Partial<ReportRecordRow>;
}

/** A payment against an already-generated student_fees row (see
 *  StudentFeeRow) - no studentClientId dependency the way scores/
 *  ratings/report-fields have, because fee generation only happens
 *  online in the office, well before a student_fee_id can exist to
 *  record a payment against; a payment can only ever reference a
 *  student_fee_id that was already cached from the server. */
export interface RecordPaymentPayload {
  studentFeeId: string;
  amount: number;
  method: FeePaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

export type OutboxPayload =
  | RegisterStudentPayload
  | UpsertScorePayload
  | UpsertSkillRatingPayload
  | UpsertReportFieldsPayload
  | RecordPaymentPayload;

export interface OutboxEntry {
  clientId: string;
  type: OutboxActionType;
  payload: OutboxPayload;
  status: OutboxStatus;
  error: string | null;
  createdAt: string;
  syncedAt: string | null;
  /** Human-readable result once synced, e.g. a student's assigned code. */
  resultLabel: string | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** A cached get_or_create_assessment_session() result, keyed by
 *  class+term so it doesn't have to be re-resolved online every time. */
export interface CachedSession extends AssessmentSessionRow {
  cacheKey: string;
}

export class CaptureDatabase extends Dexie {
  meta!: Table<MetaEntry, string>;
  academicYears!: Table<AcademicYearRow, string>;
  terms!: Table<TermRow, string>;
  levels!: Table<LevelRow, string>;
  classes!: Table<ClassRow, string>;
  subjects!: Table<SubjectRow, string>;
  learningAreas!: Table<LearningAreaRow, string>;
  skills!: Table<SkillRow, string>;
  students!: Table<StudentRow, string>;
  enrollments!: Table<EnrollmentRow, string>;
  scoreRecords!: Table<ScoreRecordRow, string>;
  skillRatings!: Table<SkillAssessmentRecordRow, string>;
  sessions!: Table<CachedSession, string>;
  outbox!: Table<OutboxEntry, string>;
  schools!: Table<SchoolRow, string>;
  reportRecords!: Table<ReportRecordRow, string>;
  feeStructures!: Table<FeeStructureRow, string>;
  studentFees!: Table<StudentFeeRow, string>;
  feePayments!: Table<FeePaymentRow, string>;

  constructor() {
    super("edulink-capture-db");
    this.version(1).stores({
      meta: "&key",
      academicYears: "id, is_current",
      terms: "id, is_active, academic_year_id",
      levels: "id, code, sort_order",
      classes: "id, level_id, code",
      subjects: "id, sort_order",
      learningAreas: "id, sort_order",
      skills: "id, learning_area_id, level_id",
      students: "id, student_id",
      enrollments: "id, student_id, term_id, class_id, is_current, [term_id+class_id]",
      scoreRecords: "id, student_id, term_id, subject_id, [student_id+term_id+subject_id]",
      skillRatings: "id, student_id, term_id, skill_id, [student_id+term_id+skill_id]",
      sessions: "cacheKey, class_id, term_id",
      outbox: "clientId, status, createdAt, type",
    });
    // v2: caches needed for offline Remarks & attendance (school profile,
    // for the headteacher-name prefill; report_records, the same table
    // CloudReportRemarksEntry reads/writes). Existing v1 tables are
    // carried forward unchanged - Dexie only needs the tables that are
    // new or whose schema changed declared here.
    this.version(2).stores({
      schools: "id",
      reportRecords: "id, student_id, term_id, [student_id+term_id]",
    });
    // v3: caches needed for offline fee payment recording. Deliberately
    // read-only here (see StudentFeeRow) - fee structure setup and
    // generating a term's fees stay office/online-only tasks.
    this.version(3).stores({
      feeStructures: "id, term_id, level_id",
      studentFees: "id, student_id, term_id, fee_structure_id, [student_id+term_id]",
      feePayments: "id, student_fee_id",
    });
  }
}

export const captureDb = new CaptureDatabase();

export async function getCachedProfile(): Promise<UserProfileRow | null> {
  const row = await captureDb.meta.get("profile");
  return (row?.value as UserProfileRow | undefined) ?? null;
}

export async function setCachedProfile(profile: UserProfileRow | null): Promise<void> {
  if (profile) await captureDb.meta.put({ key: "profile", value: profile });
  else await captureDb.meta.delete("profile");
}

export async function getLastLookupSyncAt(): Promise<string | null> {
  const row = await captureDb.meta.get("lastLookupSyncAt");
  return (row?.value as string | undefined) ?? null;
}
