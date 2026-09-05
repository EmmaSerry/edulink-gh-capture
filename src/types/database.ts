/**
 * TypeScript shapes for the Phase 0 Supabase schema
 * (edulink_gh_phase0_schema.sql). Snake_case here on purpose, matching
 * the actual Postgres column names one-for-one - these are the shapes
 * that come back from the REST API, not app-facing view models. Cloud
 * services map these to/from the existing camelCase models
 * (@models/Student etc.) at the boundary, so the rest of the app never
 * has to know the database uses snake_case.
 */

export type UserRole =
  | "platform_admin"
  | "district_admin"
  | "school_admin"
  | "bursar"
  | "teacher"
  | "parent";

export interface DistrictRow {
  id: string;
  name: string;
  region: string | null;
  created_at: string;
}

export interface SchoolRow {
  id: string;
  district_id: string | null;
  name: string;
  school_code: string | null;
  circuit: string | null;
  region: string | null;
  is_private: boolean;
  postal_address: string | null;
  digital_address: string | null;
  physical_address: string | null;
  telephone: string | null;
  email: string | null;
  website: string | null;
  head_teacher_name: string | null;
  head_teacher_phone: string | null;
  logo_data_url: string | null;
  motto: string | null;
  report_header: string | null;
  report_footer: string | null;
  subscription_tier: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfileRow {
  id: string;
  full_name: string;
  role: UserRole;
  school_id: string | null;
  district_id: string | null;
  phone: string | null;
  created_at: string;
}

export interface AcademicYearRow {
  id: string;
  school_id: string;
  label: string;
  is_active: boolean;
  is_current: boolean;
}

export interface TermRow {
  id: string;
  school_id: string;
  academic_year_id: string;
  term_name: string;
  term_number: 1 | 2 | 3;
  opening_date: string | null;
  closing_date: string | null;
  vacation_date: string | null;
  reopening_date: string | null;
  total_school_days: number | null;
  is_active: boolean;
}

export interface LevelRow {
  id: string;
  school_id: string;
  code: string;
  name: string;
  assessment_mode: "scored" | "skill-checklist";
  sort_order: number;
  is_active: boolean;
}

export interface ClassRow {
  id: string;
  school_id: string;
  level_id: string;
  name: string;
  code: string;
  capacity: number | null;
  class_teacher_id: string | null;
  class_teacher_name: string | null;
  is_active: boolean;
}

export type StudentStatus = "ACTIVE" | "TRANSFERRED_OUT" | "GRADUATED" | "WITHDRAWN" | "DECEASED";

export interface StudentRow {
  id: string;
  school_id: string;
  student_id: string;
  admission_number: string | null;
  emis_number: string | null;
  ghana_card_number: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  gender: "M" | "F";
  date_of_birth: string;
  nationality: string | null;
  special_educational_needs: string | null;
  photo_url: string | null;
  academic_year_of_admission_id: string | null;
  admission_date: string | null;
  previous_school: string | null;
  boarding_status: string | null;
  status: StudentStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianRow {
  id: string;
  school_id: string;
  student_id: string;
  full_name: string;
  relationship: string | null;
  phone: string;
  alternative_phone: string | null;
  email: string | null;
  residential_address: string | null;
  sms_opt_in: boolean;
}

export type EnrollmentStatus = "ACTIVE" | "TRANSFERRED" | "ENDED";

export interface EnrollmentRow {
  id: string;
  school_id: string;
  student_id: string;
  academic_year_id: string;
  term_id: string;
  level_id: string;
  class_id: string;
  enrollment_date: string;
  status: EnrollmentStatus;
  is_current: boolean;
  remarks: string | null;
}

export type AssessmentSessionStatus = "DRAFT" | "COMPLETED" | "VERIFIED" | "FINALIZED";

export interface AssessmentSessionRow {
  id: string;
  school_id: string;
  class_id: string;
  term_id: string;
  level_id: string;
  assessment_mode: "scored" | "skill-checklist";
  status: AssessmentSessionStatus;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface GradeBandRow {
  id: string;
  school_id: string;
  level_id: string | null;
  code: string;
  label: string;
  min_score: number;
  max_score: number;
  sort_order: number;
  is_active: boolean;
}

export interface SubjectRow {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  short_name: string | null;
  level_ids: string[];
  sort_order: number;
  is_active: boolean;
}

/** A KG (skill-checklist) grouping of skills, e.g. "Numeracy" - the
 *  official NaCCA Kindergarten Learner Report Form's sections. */
export interface LearningAreaRow {
  id: string;
  school_id: string;
  name: string;
  level_ids: string[];
  sort_order: number;
  is_active: boolean;
}

/** One rateable skill within a learning area, scoped to a specific KG
 *  level (KG1/KG2 can diverge even though they start identical). */
export interface SkillRow {
  id: string;
  school_id: string;
  learning_area_id: string;
  level_id: string;
  serial_number: number | null;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export type SkillRating = "G" | "S" | "B" | "X" | "O";

/** One student's rating for one skill, for one term - the KG
 *  equivalent of ScoreRecordRow. */
export interface SkillAssessmentRecordRow {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  skill_id: string;
  rating: SkillRating | null;
  comment: string | null;
  updated_at: string;
}

export interface ScoreRecordRow {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  subject_id: string;
  sba_score: number | null;
  exam_score: number | null;
  updated_at: string;
}

/**
 * The CURRENT frozen report for one student+term - one row per
 * student+term (see edulink_gh_phase0h_report_generation.sql). There is
 * no separate "snapshot" table: snapshot_data on this row IS the frozen
 * report content. Regenerating overwrites this row (version_number
 * increments) and a copy of the old content is preserved forever in
 * report_versions before being overwritten.
 */
export interface GeneratedReportRow {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  academic_year_id: string | null;
  class_id: string;
  template_code: string;
  template_version: number;
  version_number: number;
  snapshot_data: Record<string, unknown>;
  source_assessment_updated_at: string | null;
  generated_at: string;
  generated_by: string | null;
  print_count: number;
  pdf_export_count: number;
  last_printed_at: string | null;
  last_exported_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Append-only history entry - one per past generation of a report. */
export interface ReportVersionRow {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  version_number: number;
  template_code: string;
  template_version: number;
  snapshot_data: Record<string, unknown>;
  generated_at: string;
  generated_by: string | null;
}

export interface ReportRecordRow {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  days_present: number | null;
  interest_remark: string | null;
  conduct_remark: string | null;
  attitude_remark: string | null;
  class_teacher_remark: string | null;
  headteacher_remark: string | null;
  general_comment: string | null;
  areas_for_improvement: string | null;
  teacher_recommendation: string | null;
  progression: string | null;
  class_teacher_name: string | null;
  head_teacher_name: string | null;
  finalised_at: string | null;
}

/** One row per school - how that school's report cards look (paper
 *  size, margins, font, colours, watermark, signature labels). Cloud
 *  counterpart of the offline app's singleton `TemplateSettings` table. */
export interface TemplateSettingsRow {
  id: string;
  school_id: string;
  paper_size: "A4" | "Letter";
  orientation: "Portrait" | "Landscape";
  margin_mm: number;
  font_family: string;
  font_size_pt: number;
  primary_color_hex: string;
  secondary_color_hex: string;
  show_watermark: boolean;
  watermark_opacity: number;
  signature_title_class_teacher: string;
  signature_title_head_teacher: string;
  batch_pdf_mode: "single" | "individual";
  updated_at: string;
}

export type ReportTemplateCode = "KG" | "LOWER_PRIMARY" | "UPPER_PRIMARY" | "JHS";

export interface ReportTemplateRow {
  id: string;
  school_id: string;
  code: ReportTemplateCode;
  name: string;
  description: string | null;
  applies_to_level_ids: string[];
  assessment_mode: "scored" | "skill-checklist";
  component_version: number;
  is_active: boolean;
}
