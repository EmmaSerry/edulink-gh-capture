/**
 * EduLinkGH Mock Examination Analysis - calculation engine.
 *
 * Pure functions only: no database, no UI, no framework. Every screen
 * (marks entry, broadsheets, dashboards, comparisons, result slips) calls the
 * SAME functions, so a grade or aggregate can never differ between screens, and
 * the whole thing is unit-tested without a browser or database
 * (tests/mockEngine.test.ts). The SQL functions in the migration implement the
 * same grade-lookup / aggregate rules for the values stored by the server; the
 * worked examples in the tests are the shared specification.
 *
 * Direction of "better": for the standard nine-grade scale a LOWER grade (1) and a
 * LOWER aggregate are better. Nothing below hard-codes that - it follows
 * `GradingConfig.lowerIsBetter`.
 *
 * A mock aggregate is a school assessment indicator. It is NOT an official WAEC
 * BECE result and must never be labelled as one.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CoreKey = "english" | "mathematics" | "science" | "social_studies";
export const CORE_KEYS: CoreKey[] = ["english", "mathematics", "science", "social_studies"];

export interface GradeBand {
  /** Lowest mark in the band (on the scheme's maximum-mark scale). */
  min: number;
  /** Highest mark in the band. */
  max: number;
  grade: number;
  label: string;
  remark: string;
}

export interface GradingConfig {
  schemeName: string;
  maxMark: number;
  lowerIsBetter: boolean;
  scaleType: "nine_grade" | "custom";
  allowDecimals: boolean;
  bands: GradeBand[];
}

export interface MockSubject {
  id: string;
  /** Stable identifier used to match the same subject across mocks. */
  code: string;
  name: string;
  isCore: boolean;
  coreKey?: CoreKey | null;
  maxMark: number;
  sortOrder: number;
  /** Optional school target for this subject, as a percentage of its maximum mark. */
  targetPct?: number | null;
}

export type CandidateStatus = "registered" | "excluded" | "absent_all";

export interface MockCandidate {
  id: string;
  studentId: string;
  candidateNo: string;
  fullName: string;
  gender?: string | null;
  className: string;
  classId?: string | null;
  status: CandidateStatus;
  exclusionReason?: string | null;
}

/** A recorded cell. A subject with NO MockMark for a candidate is "not yet entered". */
export interface MockMark {
  candidateId: string;
  subjectId: string;
  /** null only when status is "absent". 0 is a real, valid mark. */
  mark: number | null;
  status: "entered" | "absent";
}

export const NINE_GRADE_REMARKS: Record<number, string> = {
  1: "Highest",
  2: "Higher",
  3: "High",
  4: "High Average",
  5: "Average",
  6: "Low Average",
  7: "Low",
  8: "Lower",
  9: "Lowest",
};

/** Example boundaries only (100 marks). Schools configure their own. */
export const EXAMPLE_NINE_GRADE_BANDS: GradeBand[] = [
  { min: 90, max: 100, grade: 1, label: "1", remark: NINE_GRADE_REMARKS[1] },
  { min: 80, max: 89, grade: 2, label: "2", remark: NINE_GRADE_REMARKS[2] },
  { min: 70, max: 79, grade: 3, label: "3", remark: NINE_GRADE_REMARKS[3] },
  { min: 60, max: 69, grade: 4, label: "4", remark: NINE_GRADE_REMARKS[4] },
  { min: 55, max: 59, grade: 5, label: "5", remark: NINE_GRADE_REMARKS[5] },
  { min: 50, max: 54, grade: 6, label: "6", remark: NINE_GRADE_REMARKS[6] },
  { min: 40, max: 49, grade: 7, label: "7", remark: NINE_GRADE_REMARKS[7] },
  { min: 35, max: 39, grade: 8, label: "8", remark: NINE_GRADE_REMARKS[8] },
  { min: 0, max: 34, grade: 9, label: "9", remark: NINE_GRADE_REMARKS[9] },
];

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Validates a grading scheme. Returns a list of human-readable errors; an empty
 * list means the scheme is valid.
 *
 * A band covers its own minimum up to (but not including) the next band's minimum,
 * so with decimal marks allowed, 89.5 belongs to the band whose minimum is 80.
 * Marks ranges are entered as whole numbers that must be contiguous
 * (next minimum = previous maximum + 1) with no gap and no overlap, starting at 0
 * and finishing exactly at the scheme's maximum mark.
 */
export function validateGradingConfig(cfg: GradingConfig): string[] {
  const errors: string[] = [];
  if (!isNum(cfg.maxMark) || cfg.maxMark <= 0) {
    errors.push("The maximum mark must be a number greater than 0.");
    return errors;
  }
  if (!Array.isArray(cfg.bands) || cfg.bands.length === 0) {
    errors.push("Add at least one grade range.");
    return errors;
  }

  for (const [i, b] of cfg.bands.entries()) {
    const n = i + 1;
    if (!isNum(b.min) || !isNum(b.max)) {
      errors.push(`Range ${n}: minimum and maximum must be numbers.`);
      continue;
    }
    if (b.min < 0 || b.max > cfg.maxMark) errors.push(`Range ${n}: marks must be between 0 and ${cfg.maxMark}.`);
    if (b.min > b.max) errors.push(`Range ${n}: the minimum (${b.min}) is higher than the maximum (${b.max}).`);
    if (!isNum(b.grade) || !Number.isInteger(b.grade)) errors.push(`Range ${n}: the grade must be a whole number.`);
  }
  if (errors.length > 0) return errors;

  const sorted = [...cfg.bands].sort((a, b) => a.min - b.min || a.max - b.max);

  if (sorted[0].min !== 0) errors.push(`The ranges must start at 0 (the lowest range starts at ${sorted[0].min}).`);
  if (sorted[sorted.length - 1].max !== cfg.maxMark) {
    errors.push(`The ranges must finish at the maximum mark ${cfg.maxMark} (the highest range ends at ${sorted[sorted.length - 1].max}).`);
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.min <= prev.max) errors.push(`Ranges ${prev.min}-${prev.max} and ${cur.min}-${cur.max} overlap.`);
    else if (cur.min > prev.max + 1) errors.push(`Marks ${prev.max + 1}-${cur.min - 1} are not covered by any grade.`);
  }

  const grades = sorted.map((b) => b.grade);
  if (new Set(grades).size !== grades.length) errors.push("Each grade can only be used once.");

  if (cfg.scaleType === "nine_grade") {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const have = [...grades].sort((a, b) => a - b);
    if (have.length !== 9 || have.some((g, i) => g !== expected[i])) {
      errors.push("The nine-grade scale needs exactly the grades 1 to 9, one range each.");
    }
  }

  // Direction: as marks rise, grades must consistently improve.
  if (errors.length === 0) {
    for (let i = 1; i < sorted.length; i++) {
      const improving = cfg.lowerIsBetter ? sorted[i].grade < sorted[i - 1].grade : sorted[i].grade > sorted[i - 1].grade;
      if (!improving) {
        errors.push(
          `Grade order is inconsistent: a higher mark range must give a ${cfg.lowerIsBetter ? "lower" : "higher"} grade number (check ${sorted[i - 1].min}-${sorted[i - 1].max} and ${sorted[i].min}-${sorted[i].max}).`
        );
        break;
      }
    }
  }
  return errors;
}

/** Fills in the automatic remark for the standard nine-grade scale. Custom scales keep what was typed. */
export function withAutoRemarks(cfg: GradingConfig): GradingConfig {
  if (cfg.scaleType !== "nine_grade") return cfg;
  return {
    ...cfg,
    bands: cfg.bands.map((b) => ({
      ...b,
      label: b.label || String(b.grade),
      remark: NINE_GRADE_REMARKS[b.grade] ?? b.remark,
    })),
  };
}

/**
 * Converts a raw mark on a subject out of `subjectMax` onto the scheme's scale.
 * Returns null for an invalid mark (not a number, negative, above the subject's maximum,
 * or fractional when decimals are not allowed).
 */
export function scaledMark(mark: number | null | undefined, subjectMax: number, cfg: GradingConfig): number | null {
  if (!isNum(mark) || !isNum(subjectMax) || subjectMax <= 0) return null;
  if (mark < 0 || mark > subjectMax) return null;
  if (!cfg.allowDecimals && !Number.isInteger(mark)) return null;
  return subjectMax === cfg.maxMark ? mark : round4((mark / subjectMax) * cfg.maxMark);
}

/** The band for a mark: the band with the greatest minimum that is <= the (scaled) mark. */
export function gradeForMark(mark: number | null | undefined, subjectMax: number, cfg: GradingConfig): GradeBand | null {
  const s = scaledMark(mark, subjectMax, cfg);
  if (s === null) return null;
  let best: GradeBand | null = null;
  for (const b of cfg.bands) {
    if (b.min <= s && (best === null || b.min > best.min)) best = b;
  }
  return best;
}

/** True when grade `a` is better than grade `b` under this scheme. */
export function isBetterGrade(a: number, b: number, cfg: GradingConfig): boolean {
  return cfg.lowerIsBetter ? a < b : a > b;
}

/* ------------------------------------------------------------------ */
/* Aggregate                                                           */
/* ------------------------------------------------------------------ */

export type AggregateStatus = "complete" | "incomplete" | "no_results" | "absent";

export interface ContributingSubject {
  code: string;
  name: string;
  grade: number;
  isCore: boolean;
}

export interface CandidateResult {
  candidateId: string;
  status: AggregateStatus;
  /** Null unless status is "complete". Never invented. */
  aggregate: number | null;
  contributing: ContributingSubject[];
  /** Subject-by-subject grade for every entered mark. */
  grades: Record<string, { grade: number; label: string; remark: string; mark: number; pct: number }>;
  missingCore: string[];
  absentSubjects: string[];
  electiveCount: number;
  /** Human-readable reasons the aggregate is not complete. */
  reasons: string[];
}

/**
 * Six-subject mock aggregate = the four core subjects (English Language,
 * Mathematics, Science, Social Studies) + the best two eligible non-core subjects.
 *
 * - "Best" follows the scheme direction (lowest numbers for nine-grade).
 * - Equal grades are ordered by the configured subject order, then subject code, so the
 *   choice is deterministic; it never changes the total.
 * - A missing mark, an absence or an invalid mark is NEVER treated as grade 0 or as the
 *   worst grade: the aggregate is simply not calculated ("incomplete").
 */
export function computeCandidateResult(
  candidate: Pick<MockCandidate, "id" | "status">,
  subjects: MockSubject[],
  marks: MockMark[],
  cfg: GradingConfig
): CandidateResult {
  const base: CandidateResult = {
    candidateId: candidate.id,
    status: "incomplete",
    aggregate: null,
    contributing: [],
    grades: {},
    missingCore: [],
    absentSubjects: [],
    electiveCount: 0,
    reasons: [],
  };

  if (candidate.status === "absent_all") {
    return { ...base, status: "absent", reasons: ["Candidate recorded as absent from the whole examination."] };
  }

  const byId = new Map(marks.filter((m) => m.candidateId === candidate.id).map((m) => [m.subjectId, m] as const));
  const graded: Array<{ s: MockSubject; grade: number }> = [];

  for (const s of subjects) {
    const m = byId.get(s.id);
    if (!m) continue;
    if (m.status === "absent") {
      base.absentSubjects.push(s.name);
      continue;
    }
    const band = gradeForMark(m.mark, s.maxMark, cfg);
    if (!band) {
      base.reasons.push(`${s.name}: the recorded mark is invalid and was not graded.`);
      continue;
    }
    graded.push({ s, grade: band.grade });
    base.grades[s.id] = {
      grade: band.grade,
      label: band.label,
      remark: band.remark,
      mark: m.mark as number,
      pct: round4(((m.mark as number) / s.maxMark) * 100),
    };
  }

  if (byId.size === 0) {
    return { ...base, status: "no_results", reasons: ["No marks have been entered for this candidate."] };
  }

  const coreSubjects = subjects.filter((s) => s.isCore);
  const gradedIds = new Set(graded.map((g) => g.s.id));
  for (const c of coreSubjects) {
    if (!gradedIds.has(c.id)) {
      base.missingCore.push(c.name);
      const m = byId.get(c.id);
      base.reasons.push(
        `${c.name} (core): ${m?.status === "absent" ? "candidate absent" : m ? "invalid mark" : "mark not yet entered"}.`
      );
    }
  }
  if (coreSubjects.length < 4) {
    base.reasons.push("The mock does not have all four core subjects configured.");
  }

  const electives = graded
    .filter((g) => !g.s.isCore)
    .sort((a, b) => {
      if (a.grade !== b.grade) return cfg.lowerIsBetter ? a.grade - b.grade : b.grade - a.grade;
      if (a.s.sortOrder !== b.s.sortOrder) return a.s.sortOrder - b.s.sortOrder;
      return a.s.code.localeCompare(b.s.code);
    });
  base.electiveCount = electives.length;
  if (electives.length < 2) {
    base.reasons.push(`Only ${electives.length} eligible non-core subject grade(s) available; two are needed.`);
  }

  const coreGraded = graded.filter((g) => g.s.isCore);
  const complete = coreSubjects.length >= 4 && base.missingCore.length === 0 && electives.length >= 2;
  if (!complete) return { ...base, status: "incomplete" };

  const picked = [...coreGraded, ...electives.slice(0, 2)];
  return {
    ...base,
    status: "complete",
    aggregate: picked.reduce((sum, g) => sum + g.grade, 0),
    contributing: picked.map((g) => ({ code: g.s.code, name: g.s.name, grade: g.grade, isCore: g.s.isCore })),
    reasons: [],
  };
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export interface RankInput {
  candidateId: string;
  classId?: string | null;
  status: AggregateStatus;
  aggregate: number | null;
}

export interface RankInfo {
  schoolRank: number | null;
  classRank: number | null;
  /** True when another candidate has the same aggregate (shared position). */
  tied: boolean;
}

/**
 * Standard competition ranking ("1, 1, 3"): candidates with the same aggregate share
 * a position and the next position is skipped. No hidden tie-breaker is applied. Only
 * candidates with a COMPLETE aggregate are ranked; everyone else gets null, never a rank.
 * (For a scheme where higher is better, pass lowerIsBetter=false.)
 */
export function rankCandidates(inputs: RankInput[], lowerIsBetter = true): Map<string, RankInfo> {
  const out = new Map<string, RankInfo>();
  const rankable = inputs.filter((r) => r.status === "complete" && r.aggregate !== null);

  const assign = (group: RankInput[], key: "schoolRank" | "classRank") => {
    const sorted = [...group].sort((a, b) => (lowerIsBetter ? a.aggregate! - b.aggregate! : b.aggregate! - a.aggregate!));
    let rank = 0;
    let prev: number | null = null;
    sorted.forEach((r, i) => {
      if (prev === null || r.aggregate !== prev) rank = i + 1;
      prev = r.aggregate;
      const cur = out.get(r.candidateId) ?? { schoolRank: null, classRank: null, tied: false };
      cur[key] = rank;
      out.set(r.candidateId, cur);
    });
  };

  for (const r of inputs) out.set(r.candidateId, { schoolRank: null, classRank: null, tied: false });
  assign(rankable, "schoolRank");
  const byClass = new Map<string, RankInput[]>();
  for (const r of rankable) {
    const k = r.classId ?? "";
    byClass.set(k, [...(byClass.get(k) ?? []), r]);
  }
  for (const g of byClass.values()) assign(g, "classRank");

  const counts = new Map<number, number>();
  for (const r of rankable) counts.set(r.aggregate!, (counts.get(r.aggregate!) ?? 0) + 1);
  for (const r of rankable) out.get(r.candidateId)!.tied = (counts.get(r.aggregate!) ?? 0) > 1;
  return out;
}

/** All candidates sharing the best (lowest, by default) complete aggregate. */
export function bestCandidates(results: CandidateResult[], lowerIsBetter = true): CandidateResult[] {
  const complete = results.filter((r) => r.status === "complete" && r.aggregate !== null);
  if (complete.length === 0) return [];
  const best = complete.reduce((m, r) => (lowerIsBetter ? Math.min(m, r.aggregate!) : Math.max(m, r.aggregate!)), complete[0].aggregate!);
  return complete.filter((r) => r.aggregate === best);
}

/* ------------------------------------------------------------------ */
/* Data quality                                                        */
/* ------------------------------------------------------------------ */

export interface SubjectCompleteness {
  subjectId: string;
  code: string;
  name: string;
  expected: number;
  valid: number;
  absent: number;
  outstanding: number;
  invalid: number;
  /** Share of expected records that are accounted for (valid + recorded absence), 0-100. */
  pctComplete: number | null;
}

export interface DataQualityIssue {
  kind:
    | "grading_invalid"
    | "core_subjects_missing"
    | "subject_scale_differs"
    | "outstanding_marks"
    | "invalid_marks"
    | "incomplete_aggregates"
    | "no_candidates"
    | "excluded_candidates";
  severity: "error" | "warning" | "info";
  message: string;
  count: number;
}

export interface DataQualitySummary {
  registered: number;
  excluded: number;
  absentAll: number;
  expectedCandidates: number;
  candidatesWithValidResults: number;
  subjects: SubjectCompleteness[];
  candidateCounts: { complete: number; incomplete: number; noResults: number; absent: number };
  exclusions: Array<{ candidateId: string; name: string; reason: string }>;
  totalExpectedMarks: number;
  totalAccountedMarks: number;
  overallPctComplete: number | null;
  issues: DataQualityIssue[];
  /** No "error" issue remains, so the exam can be finalised without acknowledging exceptions. */
  readyToFinalise: boolean;
}

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export function summariseDataQuality(
  subjects: MockSubject[],
  candidates: MockCandidate[],
  marks: MockMark[],
  cfg: GradingConfig,
  results?: CandidateResult[]
): DataQualitySummary {
  const active = candidates.filter((c) => c.status !== "excluded");
  const sitting = candidates.filter((c) => c.status === "registered");
  const absentAll = candidates.filter((c) => c.status === "absent_all");
  const excluded = candidates.filter((c) => c.status === "excluded");

  const markBy = new Map<string, MockMark>();
  for (const m of marks) markBy.set(`${m.candidateId}:${m.subjectId}`, m);

  const subjRows: SubjectCompleteness[] = subjects.map((s) => {
    let valid = 0;
    let absent = absentAll.length; // an absent-from-everything candidate is a recorded absence in every subject
    let invalid = 0;
    let outstanding = 0;
    for (const c of sitting) {
      const m = markBy.get(`${c.id}:${s.id}`);
      if (!m) outstanding++;
      else if (m.status === "absent") absent++;
      else if (gradeForMark(m.mark, s.maxMark, cfg)) valid++;
      else invalid++;
    }
    const expected = active.length;
    return {
      subjectId: s.id,
      code: s.code,
      name: s.name,
      expected,
      valid,
      absent,
      outstanding,
      invalid,
      pctComplete: pct(valid + absent, expected),
    };
  });

  const res = results ?? active.map((c) => computeCandidateResult(c, subjects, marks, cfg));
  const candidateCounts = { complete: 0, incomplete: 0, noResults: 0, absent: 0 };
  for (const r of res) {
    if (r.status === "complete") candidateCounts.complete++;
    else if (r.status === "incomplete") candidateCounts.incomplete++;
    else if (r.status === "no_results") candidateCounts.noResults++;
    else candidateCounts.absent++;
  }

  const totalExpectedMarks = subjRows.reduce((a, s) => a + s.expected, 0);
  const totalAccountedMarks = subjRows.reduce((a, s) => a + s.valid + s.absent, 0);
  const totalOutstanding = subjRows.reduce((a, s) => a + s.outstanding, 0);
  const totalInvalid = subjRows.reduce((a, s) => a + s.invalid, 0);

  const issues: DataQualityIssue[] = [];
  const gErrors = validateGradingConfig(cfg);
  if (gErrors.length) issues.push({ kind: "grading_invalid", severity: "error", message: `Grading scheme problem: ${gErrors[0]}`, count: gErrors.length });

  const coreCount = subjects.filter((s) => s.isCore).length;
  const coreKeys = new Set(subjects.filter((s) => s.isCore).map((s) => s.coreKey));
  if (coreCount !== 4 || CORE_KEYS.some((k) => !coreKeys.has(k))) {
    issues.push({ kind: "core_subjects_missing", severity: "error", message: "All four core subjects (English Language, Mathematics, Science, Social Studies) must be configured.", count: 1 });
  }
  const scaleDiff = subjects.filter((s) => s.maxMark !== cfg.maxMark);
  if (scaleDiff.length) {
    issues.push({
      kind: "subject_scale_differs",
      severity: "warning",
      message: `${scaleDiff.length} subject(s) are marked out of a different total than the grading scheme (${cfg.maxMark}); marks are converted proportionally before grading.`,
      count: scaleDiff.length,
    });
  }
  if (active.length === 0) issues.push({ kind: "no_candidates", severity: "error", message: "No candidates are registered for this examination.", count: 0 });
  if (totalOutstanding > 0) issues.push({ kind: "outstanding_marks", severity: "error", message: `${totalOutstanding} mark(s) have not been entered or recorded as absent.`, count: totalOutstanding });
  if (totalInvalid > 0) issues.push({ kind: "invalid_marks", severity: "error", message: `${totalInvalid} recorded mark(s) are invalid and cannot be graded.`, count: totalInvalid });
  const incompleteAgg = candidateCounts.incomplete + candidateCounts.noResults;
  if (incompleteAgg > 0) issues.push({ kind: "incomplete_aggregates", severity: "warning", message: `${incompleteAgg} candidate(s) do not have a complete six-subject aggregate.`, count: incompleteAgg });
  if (excluded.length) issues.push({ kind: "excluded_candidates", severity: "info", message: `${excluded.length} candidate(s) excluded (reasons recorded).`, count: excluded.length });

  return {
    registered: candidates.length,
    excluded: excluded.length,
    absentAll: absentAll.length,
    expectedCandidates: active.length,
    candidatesWithValidResults: candidateCounts.complete,
    subjects: subjRows,
    candidateCounts,
    exclusions: excluded.map((c) => ({ candidateId: c.id, name: c.fullName, reason: c.exclusionReason ?? "" })),
    totalExpectedMarks,
    totalAccountedMarks,
    overallPctComplete: pct(totalAccountedMarks, totalExpectedMarks),
    issues,
    readyToFinalise: !issues.some((i) => i.severity === "error"),
  };
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export interface SubjectStats {
  subjectId: string;
  code: string;
  name: string;
  /** Denominator for every figure below: candidates with a VALID mark in this subject. */
  validCount: number;
  average: number | null;
  averagePct: number | null;
  highest: number | null;
  lowest: number | null;
  gradeDistribution: Record<number, number>;
  targetPct: number | null;
  meetingTarget: number;
  belowTarget: number;
  pctMeetingTarget: number | null;
}

export function subjectStatistics(
  subjects: MockSubject[],
  candidates: MockCandidate[],
  marks: MockMark[],
  cfg: GradingConfig
): SubjectStats[] {
  const sitting = new Set(candidates.filter((c) => c.status === "registered").map((c) => c.id));
  return subjects.map((s) => {
    const vals: number[] = [];
    const dist: Record<number, number> = {};
    for (const m of marks) {
      if (m.subjectId !== s.id || !sitting.has(m.candidateId) || m.status !== "entered") continue;
      const band = gradeForMark(m.mark, s.maxMark, cfg);
      if (!band) continue;
      vals.push(m.mark as number);
      dist[band.grade] = (dist[band.grade] ?? 0) + 1;
    }
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const target = s.targetPct ?? null;
    const meeting = target === null ? 0 : vals.filter((v) => (v / s.maxMark) * 100 >= target).length;
    return {
      subjectId: s.id,
      code: s.code,
      name: s.name,
      validCount: n,
      average: n ? round4(sum / n) : null,
      averagePct: n ? round4((sum / n / s.maxMark) * 100) : null,
      highest: n ? Math.max(...vals) : null,
      lowest: n ? Math.min(...vals) : null,
      gradeDistribution: dist,
      targetPct: target,
      meetingTarget: meeting,
      belowTarget: target === null ? 0 : n - meeting,
      pctMeetingTarget: target === null ? null : pct(meeting, n),
    };
  });
}

export interface AggregateStats {
  /** Candidates with a complete aggregate - the denominator for everything below. */
  completeCount: number;
  average: number | null;
  best: number | null;
  worst: number | null;
  meetingTarget: number | null;
  belowTarget: number | null;
}

export function aggregateStatistics(results: CandidateResult[], targetAggregate: number | null, lowerIsBetter = true): AggregateStats {
  const vals = results.filter((r) => r.status === "complete" && r.aggregate !== null).map((r) => r.aggregate!);
  if (vals.length === 0) return { completeCount: 0, average: null, best: null, worst: null, meetingTarget: null, belowTarget: null };
  const meets = (v: number) => (targetAggregate === null ? false : lowerIsBetter ? v <= targetAggregate : v >= targetAggregate);
  return {
    completeCount: vals.length,
    average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
    best: lowerIsBetter ? Math.min(...vals) : Math.max(...vals),
    worst: lowerIsBetter ? Math.max(...vals) : Math.min(...vals),
    meetingTarget: targetAggregate === null ? null : vals.filter(meets).length,
    belowTarget: targetAggregate === null ? null : vals.filter((v) => !meets(v)).length,
  };
}

/* ------------------------------------------------------------------ */
/* Comparability                                                       */
/* ------------------------------------------------------------------ */

export interface ComparableMock {
  id: string;
  name: string;
  subjects: Array<Pick<MockSubject, "code" | "name" | "maxMark" | "isCore">>;
  grading: GradingConfig;
  /** Candidate student ids included (excluding excluded candidates). */
  studentIds: string[];
  /** Share (0-100) of expected marks that are valid or recorded absences; null if unknown. */
  pctComplete: number | null;
}

export type ComparabilityLevel = "comparable" | "comparable_with_limitations" | "not_directly_comparable" | "insufficient_data";

export interface ComparabilityReport {
  level: ComparabilityLevel;
  reasons: string[];
  commonSubjectCodes: string[];
  commonStudentIds: string[];
  /** Raw marks may be compared directly only if maximum marks match. */
  rawMarksComparable: boolean;
  /** Compare as % of maximum mark. */
  usePercentages: boolean;
  gradesComparable: boolean;
  aggregateComparable: boolean;
}

export function assessComparability(a: ComparableMock, b: ComparableMock, minCommonCandidates = 5): ComparabilityReport {
  const reasons: string[] = [];
  const codesA = new Map(a.subjects.map((s) => [s.code, s] as const));
  const common = b.subjects.filter((s) => codesA.has(s.code)).map((s) => s.code);
  const setB = new Set(b.studentIds);
  const commonStudents = a.studentIds.filter((id) => setB.has(id));

  let level = "comparable" as ComparabilityLevel;
  const lim = () => {
    if (level === "comparable") level = "comparable_with_limitations";
  };

  if (common.length === 0) {
    return {
      level: "insufficient_data",
      reasons: ["The two examinations have no subject in common."],
      commonSubjectCodes: [],
      commonStudentIds: commonStudents,
      rawMarksComparable: false,
      usePercentages: false,
      gradesComparable: false,
      aggregateComparable: false,
    };
  }
  if (commonStudents.length < minCommonCandidates) {
    reasons.push(`Only ${commonStudents.length} candidate(s) appear in both examinations (at least ${minCommonCandidates} needed for a same-candidate comparison).`);
    level = "insufficient_data";
  }

  const diffMax = common.filter((c) => a.subjects.find((s) => s.code === c)!.maxMark !== b.subjects.find((s) => s.code === c)!.maxMark);
  const rawMarksComparable = diffMax.length === 0;
  if (!rawMarksComparable) {
    reasons.push(`Maximum marks differ for ${diffMax.length} subject(s); marks are compared as percentages of each paper's maximum. Equal percentages do not prove equal paper difficulty.`);
    if (level !== "insufficient_data") lim();
  }

  const sameScale = a.grading.scaleType === b.grading.scaleType && a.grading.lowerIsBetter === b.grading.lowerIsBetter;
  const sameBands =
    a.grading.maxMark === b.grading.maxMark &&
    a.grading.bands.length === b.grading.bands.length &&
    [...a.grading.bands]
      .sort((x, y) => x.min - y.min)
      .every((x, i) => {
        const y = [...b.grading.bands].sort((p, q) => p.min - q.min)[i];
        return x.min === y.min && x.max === y.max && x.grade === y.grade;
      });
  let gradesComparable = sameScale && sameBands;
  if (!sameScale) {
    reasons.push("The grading scales differ in type or direction; grades and aggregates cannot be compared directly.");
    level = level === "insufficient_data" ? level : "not_directly_comparable";
  } else if (!sameBands) {
    reasons.push("The grade boundaries differ between the two examinations; historical grades are preserved and not re-graded, so compare marks (as percentages) rather than grades.");
    if (level !== "insufficient_data" && level !== "not_directly_comparable") lim();
    gradesComparable = false;
  }

  const coreA = a.subjects.filter((s) => s.isCore).map((s) => s.code).sort().join(",");
  const coreB = b.subjects.filter((s) => s.isCore).map((s) => s.code).sort().join(",");
  const aggregateComparable = sameScale && coreA === coreB;
  if (coreA !== coreB) {
    reasons.push("The core subjects differ, so aggregates were not built from the same rule.");
    if (level !== "insufficient_data") level = "not_directly_comparable";
  }

  if (a.subjects.length !== b.subjects.length || common.length !== a.subjects.length) {
    reasons.push("The two examinations do not assess exactly the same subjects; only the common subjects are compared.");
    if (level !== "insufficient_data" && level !== "not_directly_comparable") lim();
  }

  const union = new Set([...a.studentIds, ...b.studentIds]).size;
  const overlap = union ? (commonStudents.length / union) * 100 : 0;
  if (overlap < 80 && commonStudents.length >= minCommonCandidates) {
    reasons.push(`The candidate cohorts differ (${Math.round(overlap)}% of all candidates sat both); whole-cohort figures may change because participation changed.`);
    if (level !== "insufficient_data" && level !== "not_directly_comparable") lim();
  }

  for (const m of [a, b]) {
    if (m.pctComplete !== null && m.pctComplete < 90) {
      reasons.push(`${m.name}: only ${m.pctComplete}% of expected marks are entered or recorded as absent.`);
      if (level !== "insufficient_data" && level !== "not_directly_comparable") lim();
    }
  }

  return {
    level,
    reasons,
    commonSubjectCodes: common,
    commonStudentIds: commonStudents,
    rawMarksComparable,
    usePercentages: !rawMarksComparable,
    gradesComparable,
    aggregateComparable,
  };
}

/* ------------------------------------------------------------------ */
/* Change between two values                                           */
/* ------------------------------------------------------------------ */

export type ChangeDirection = "improved" | "declined" | "unchanged";

/** Change in a "higher is better" metric (marks, percentages, share meeting target). */
export function changeHigherBetter(before: number | null, after: number | null): { delta: number | null; direction: ChangeDirection | null } {
  if (before === null || after === null) return { delta: null, direction: null };
  const delta = round4(after - before);
  return { delta, direction: delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged" };
}

/**
 * Change in a "lower is better" metric (grades and aggregates under the nine-grade scale).
 * `delta` is the number of points IMPROVED: 25 -> 19 gives +6 (an improvement), not a decline.
 */
export function changeLowerBetter(before: number | null, after: number | null): { delta: number | null; direction: ChangeDirection | null } {
  if (before === null || after === null) return { delta: null, direction: null };
  const delta = round4(before - after);
  return { delta, direction: delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged" };
}

export function changeFor(before: number | null, after: number | null, lowerIsBetter: boolean) {
  return lowerIsBetter ? changeLowerBetter(before, after) : changeHigherBetter(before, after);
}

/* ------------------------------------------------------------------ */
/* Learner progress                                                    */
/* ------------------------------------------------------------------ */

export interface ProgressPoint {
  mockId: string;
  mockName: string;
  /** Chronological order key (e.g. mock start date as ISO string). */
  date: string;
  status: AggregateStatus;
  aggregate: number | null;
  /** Subject code -> percentage of maximum mark; null/absent when not validly entered. */
  subjectPct: Record<string, number | null>;
  /** Whether this mock is comparable to the PREVIOUS one in the list (first entry: ignored). */
  comparableToPrevious: boolean;
  outstanding: boolean;
}

export interface ProgressConfig {
  lowerIsBetter: boolean;
  /** Aggregate points of movement needed to call a learner improving / declining. */
  aggregateChangeThreshold: number;
  /** Percentage points of movement needed for a subject to count as improving / declining. */
  subjectPctThreshold: number;
  targetAggregate: number | null;
  /** Fewest complete, comparable aggregates before a trend is stated. */
  minComparable: number;
}

export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  lowerIsBetter: true,
  aggregateChangeThreshold: 3,
  subjectPctThreshold: 5,
  targetAggregate: null,
  minComparable: 2,
};

export type ProgressTrend = "improving" | "maintaining" | "declining" | "insufficient_data";
export type TargetStatus = "meeting_target" | "below_target" | "no_target" | "insufficient_data";

export interface SubjectTrend {
  code: string;
  trend: "consistent_improvement" | "consistent_decline" | "inconsistent" | "improving" | "declining" | "stable" | "insufficient_data";
  /** Percentage-point changes between successive comparable valid results. */
  deltas: number[];
}

export interface ProgressSummary {
  trend: ProgressTrend;
  targetStatus: TargetStatus;
  aggregateChange: number | null; // points improved (+) / worsened (-)
  usedMocks: string[];
  reasons: string[];
  subjectTrends: SubjectTrend[];
}

/** The longest run ending at the latest point where every step is comparable to the one before. */
function comparableRun(points: ProgressPoint[]): ProgressPoint[] {
  if (points.length === 0) return [];
  const run: ProgressPoint[] = [points[points.length - 1]];
  for (let i = points.length - 1; i > 0; i--) {
    if (!points[i].comparableToPrevious) break;
    run.unshift(points[i - 1]);
  }
  return run;
}

export function classifyProgress(history: ProgressPoint[], cfg: ProgressConfig = DEFAULT_PROGRESS_CONFIG): ProgressSummary {
  const pts = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const run = comparableRun(pts);
  const reasons: string[] = [];

  // Trend uses ONLY complete aggregates from mocks that are comparable to each other.
  const usable = run.filter((p) => p.status === "complete" && p.aggregate !== null);
  const skipped = run.length - usable.length;
  if (skipped > 0) reasons.push(`${skipped} mock(s) without a complete aggregate (missing, absent or incomplete) were not used for the trend.`);
  if (pts.length > run.length) reasons.push("Earlier mocks that are not comparable with later ones (different scale, subjects or grading) were not used.");

  let trend: ProgressTrend = "insufficient_data";
  let aggregateChange: number | null = null;
  if (usable.length >= cfg.minComparable) {
    const first = usable[0].aggregate!;
    const last = usable[usable.length - 1].aggregate!;
    const prev = usable[usable.length - 2].aggregate!;
    // Direction of the latest comparable movement, and of the whole comparable run.
    const latest = cfg.lowerIsBetter ? prev - last : last - prev;
    const overall = cfg.lowerIsBetter ? first - last : last - first;
    aggregateChange = latest;
    if (latest >= cfg.aggregateChangeThreshold && overall >= 0) trend = "improving";
    else if (latest <= -cfg.aggregateChangeThreshold && overall <= 0) trend = "declining";
    else trend = "maintaining";
  } else {
    reasons.push(`Fewer than ${cfg.minComparable} comparable complete results are available.`);
  }

  // Target status uses the latest complete aggregate (no comparison needed).
  let targetStatus: TargetStatus = "no_target";
  const latestComplete = [...pts].reverse().find((p) => p.status === "complete" && p.aggregate !== null);
  if (cfg.targetAggregate !== null) {
    if (!latestComplete) targetStatus = "insufficient_data";
    else {
      const meets = cfg.lowerIsBetter ? latestComplete.aggregate! <= cfg.targetAggregate : latestComplete.aggregate! >= cfg.targetAggregate;
      targetStatus = meets ? "meeting_target" : "below_target";
    }
  }

  // Subject trends over the comparable run, only between valid successive results.
  const codes = new Set<string>();
  run.forEach((p) => Object.keys(p.subjectPct).forEach((c) => codes.add(c)));
  const subjectTrends: SubjectTrend[] = [];
  for (const code of codes) {
    const vals = run.map((p) => p.subjectPct[code]).filter((v): v is number => v !== null && v !== undefined);
    if (vals.length < 2) {
      subjectTrends.push({ code, trend: "insufficient_data", deltas: [] });
      continue;
    }
    const deltas = vals.slice(1).map((v, i) => round4(v - vals[i]));
    const up = deltas.filter((d) => d >= cfg.subjectPctThreshold).length;
    const down = deltas.filter((d) => d <= -cfg.subjectPctThreshold).length;
    let t: SubjectTrend["trend"];
    if (deltas.length >= 2 && up === deltas.length) t = "consistent_improvement";
    else if (deltas.length >= 2 && down === deltas.length) t = "consistent_decline";
    else if (up > 0 && down > 0) t = "inconsistent";
    else if (up > 0) t = "improving";
    else if (down > 0) t = "declining";
    else t = "stable";
    subjectTrends.push({ code, trend: t, deltas });
  }

  return { trend, targetStatus, aggregateChange, usedMocks: usable.map((p) => p.mockId), reasons, subjectTrends };
}

export interface EarlySupportConfig {
  lowerIsBetter: boolean;
  targetAggregate: number | null;
  /** Percentage of maximum mark below which a subject counts as below target when no subject target is set. */
  defaultSubjectTargetPct: number;
  subjectTargetPct: Record<string, number | null>;
  /** Number of subjects below target at the latest mock that triggers the "multiple subjects" flag. */
  multipleSubjectsThreshold: number;
}

export interface EarlySupportFlag {
  kind: "repeatedly_below_target" | "persistent_weak_subject" | "deteriorating" | "multiple_subjects_below_target" | "missing_records";
  message: string;
  subjects?: string[];
}

/**
 * Early-support indicators. These prompt a teacher's professional judgement - they
 * are not a diagnosis and say nothing about a learner's ability or potential.
 */
export function earlySupportFlags(history: ProgressPoint[], cfg: EarlySupportConfig, summary?: ProgressSummary): EarlySupportFlag[] {
  const pts = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const flags: EarlySupportFlag[] = [];
  if (pts.length === 0) return flags;

  const complete = pts.filter((p) => p.status === "complete" && p.aggregate !== null);
  if (cfg.targetAggregate !== null && complete.length >= 2) {
    const last2 = complete.slice(-2);
    const below = last2.every((p) => (cfg.lowerIsBetter ? p.aggregate! > cfg.targetAggregate! : p.aggregate! < cfg.targetAggregate!));
    if (below) flags.push({ kind: "repeatedly_below_target", message: "Aggregate has been below the school target in the last two complete mocks." });
  }

  const targetFor = (code: string) => cfg.subjectTargetPct[code] ?? cfg.defaultSubjectTargetPct;
  const recent = pts.slice(-2);
  if (recent.length === 2) {
    const codes = Object.keys(recent[1].subjectPct);
    const weak = codes.filter((c) => {
      const a = recent[0].subjectPct[c];
      const b = recent[1].subjectPct[c];
      return a !== null && a !== undefined && b !== null && b !== undefined && a < targetFor(c) && b < targetFor(c);
    });
    if (weak.length) flags.push({ kind: "persistent_weak_subject", message: "Below the subject target in the last two mocks where a valid mark exists.", subjects: weak });
  }

  const s = summary ?? classifyProgress(pts, { ...DEFAULT_PROGRESS_CONFIG, lowerIsBetter: cfg.lowerIsBetter, targetAggregate: cfg.targetAggregate });
  if (s.trend === "declining") flags.push({ kind: "deteriorating", message: "Aggregate has worsened between comparable complete mocks." });

  const latest = pts[pts.length - 1];
  const belowNow = Object.entries(latest.subjectPct).filter(([c, v]) => v !== null && v !== undefined && v < targetFor(c)).map(([c]) => c);
  if (belowNow.length >= cfg.multipleSubjectsThreshold) {
    flags.push({ kind: "multiple_subjects_below_target", message: `${belowNow.length} subjects are below target in the latest mock.`, subjects: belowNow });
  }

  if (latest.outstanding || latest.status === "incomplete" || latest.status === "no_results") {
    flags.push({ kind: "missing_records", message: "The latest mock has missing results that need follow-up before conclusions are drawn." });
  }
  return flags;
}

/* ------------------------------------------------------------------ */
/* School support priority (district view)                             */
/* ------------------------------------------------------------------ */

export interface SchoolSupportMetrics {
  schoolId: string;
  schoolName: string;
  eligibleCandidates: number;
  candidatesWithValidResults: number;
  /** Share of expected marks entered or recorded absent, 0-100. */
  pctComplete: number | null;
  /** Share of valid-result candidates below the aggregate/subject target, 0-100; null when no target. */
  pctBelowTarget: number | null;
  /** Subject codes below target in at least `persistenceMocks` successive comparable mocks. */
  persistentWeakSubjects: string[];
  /** Mean change in aggregate for the SAME candidates across comparable mocks, + = improved; null if none. */
  aggregateImprovement: number | null;
  sameCandidateCount: number;
  /** Change in the number of candidates between the two latest mocks, as a percentage; null if unknown. */
  participationChangePct: number | null;
  comparableMocks: boolean;
}

export type SupportClass = "priority_support" | "monitoring" | "progressing_positively" | "insufficient_data";

export interface SupportFactor {
  key: string;
  label: string;
  value: string;
  severity: "high" | "medium" | "info" | "positive";
}

export interface SupportConfig {
  minCandidates: number;
  minPctComplete: number;
  belowTargetHighPct: number;
  weakSubjectsHigh: number;
  weakSubjectsMedium: number;
  noImprovementPoints: number;
  participationSwingPct: number;
  improvementPositivePoints: number;
}

export const DEFAULT_SUPPORT_CONFIG: SupportConfig = {
  minCandidates: 10,
  minPctComplete: 70,
  belowTargetHighPct: 60,
  weakSubjectsHigh: 3,
  weakSubjectsMedium: 1,
  noImprovementPoints: 1,
  participationSwingPct: 25,
  improvementPositivePoints: 2,
};

/**
 * Classifies a school for the district's attention - always together with the
 * factors that produced the classification. Low results alone never produce a negative
 * label about the school; they are one factor among data quality, participation and
 * cohort limitations. There is no composite score.
 */
export function classifySchoolSupport(m: SchoolSupportMetrics, cfg: SupportConfig = DEFAULT_SUPPORT_CONFIG): { classification: SupportClass; factors: SupportFactor[]; limitations: string[] } {
  const factors: SupportFactor[] = [];
  const limitations: string[] = [];

  if (m.candidatesWithValidResults < cfg.minCandidates) {
    limitations.push(`Only ${m.candidatesWithValidResults} candidate(s) have valid results (at least ${cfg.minCandidates} needed).`);
  }
  if (m.pctComplete === null || m.pctComplete < cfg.minPctComplete) {
    limitations.push(`Result entry is ${m.pctComplete === null ? "unknown" : m.pctComplete + "%"} complete (at least ${cfg.minPctComplete}% needed).`);
  }
  if (limitations.length > 0) {
    factors.push({ key: "data_quality", label: "Data completeness", value: limitations.join(" "), severity: "info" });
    return { classification: "insufficient_data", factors, limitations };
  }

  if (m.participationChangePct !== null && Math.abs(m.participationChangePct) >= cfg.participationSwingPct) {
    limitations.push(`Number of candidates changed by ${m.participationChangePct > 0 ? "+" : ""}${Math.round(m.participationChangePct)}% between mocks; compare with care.`);
    factors.push({ key: "participation", label: "Participation change", value: `${Math.round(m.participationChangePct)}%`, severity: "info" });
  }
  if (!m.comparableMocks) limitations.push("The mocks used are not directly comparable, so change over time is not assessed.");

  let high = 0;
  let medium = 0;

  if (m.pctBelowTarget !== null) {
    if (m.pctBelowTarget >= cfg.belowTargetHighPct) {
      high++;
      factors.push({ key: "below_target", label: "Candidates below target", value: `${m.pctBelowTarget}% of ${m.candidatesWithValidResults} candidates with valid results`, severity: "high" });
    } else {
      factors.push({ key: "below_target", label: "Candidates below target", value: `${m.pctBelowTarget}% of ${m.candidatesWithValidResults}`, severity: "info" });
    }
  }
  if (m.persistentWeakSubjects.length >= cfg.weakSubjectsHigh) {
    high++;
    factors.push({ key: "weak_subjects", label: "Persistently weak subjects", value: m.persistentWeakSubjects.join(", "), severity: "high" });
  } else if (m.persistentWeakSubjects.length >= cfg.weakSubjectsMedium) {
    medium++;
    factors.push({ key: "weak_subjects", label: "Persistently weak subjects", value: m.persistentWeakSubjects.join(", "), severity: "medium" });
  }

  let improving = false;
  if (m.comparableMocks && m.aggregateImprovement !== null && m.sameCandidateCount >= cfg.minCandidates) {
    if (m.aggregateImprovement >= cfg.improvementPositivePoints) {
      improving = true;
      factors.push({ key: "improvement", label: "Change in aggregate (same candidates)", value: `+${m.aggregateImprovement.toFixed(1)} points improved across ${m.sameCandidateCount} candidates`, severity: "positive" });
    } else if (m.aggregateImprovement <= -cfg.noImprovementPoints) {
      high++;
      factors.push({ key: "improvement", label: "Change in aggregate (same candidates)", value: `${m.aggregateImprovement.toFixed(1)} points (worsened) across ${m.sameCandidateCount} candidates`, severity: "high" });
    } else {
      medium++;
      factors.push({ key: "improvement", label: "Change in aggregate (same candidates)", value: `${m.aggregateImprovement.toFixed(1)} points (little change) across ${m.sameCandidateCount} candidates`, severity: "medium" });
    }
  }

  let classification: SupportClass;
  if (high >= 2) classification = "priority_support";
  else if (high === 1 || medium >= 1) classification = "monitoring";
  else if (improving) classification = "progressing_positively";
  else classification = "monitoring";
  return { classification, factors, limitations };
}
