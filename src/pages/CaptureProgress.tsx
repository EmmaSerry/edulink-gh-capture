import { useEffect, useMemo, useState } from "react";
import { captureDb } from "@/lib/offlineDb";
import { useCaptureAuth } from "@/contexts/CaptureAuthContext";
import type { TermRow, ClassRow, LevelRow, SchoolRow, LearningAreaRow } from "@/types/database";

const FEE_MANAGER_ROLES = new Set(["bursar", "school_admin", "district_admin", "platform_admin"]);

function money(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

interface SubjectProgress {
  subjectId: string;
  name: string;
  sbaCount: number;
  examCount: number;
}

interface AreaProgress {
  areaId: string;
  name: string;
  rated: number;
  total: number;
}

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="capture-progress-track">
      <div className="capture-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Offline "how are we doing" view for one class - deliberately not a
 * copy of the cloud dashboard's academic-standards panel (that's a
 * server-side pass-rate/grade-band aggregation - see
 * get_school_academic_standards() - which needs data this app doesn't
 * cache and stays a live, online-only view). Everything here is
 * completion tracking computed entirely from tables already cached by
 * LookupSyncService for the other offline screens: how many students
 * have been assessed, how many have remarks/attendance recorded, and -
 * for fee managers at a private school - how fee collection for the
 * class is going. No new sync data, no new outbox action; purely a
 * read-only roll-up of what's already on the phone.
 */
export function CaptureProgress() {
  const { profile } = useCaptureAuth();
  const [term, setTerm] = useState<TermRow | null>(null);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  const [classId, setClassId] = useState("");
  const [rosterSize, setRosterSize] = useState(0);
  const [subjectProgress, setSubjectProgress] = useState<SubjectProgress[]>([]);
  const [areaProgress, setAreaProgress] = useState<AreaProgress[]>([]);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [remarksCount, setRemarksCount] = useState(0);
  const [feeDue, setFeeDue] = useState(0);
  const [feePaid, setFeePaid] = useState(0);
  const [loadingClass, setLoadingClass] = useState(false);

  const isFeeManager = !!profile && FEE_MANAGER_ROLES.has(profile.role);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [terms, classRows, levelRows, schoolRows] = await Promise.all([
        captureDb.terms.toArray(),
        captureDb.classes.toArray(),
        captureDb.levels.orderBy("sort_order").toArray(),
        captureDb.schools.toArray(),
      ]);
      if (cancelled) return;
      setTerm(terms.find((t) => t.is_active) ?? null);
      const levelOrder = new Map(levelRows.map((l) => [l.id, l.sort_order]));
      const sortedClasses = [...classRows].sort((a, b) => {
        const byLevel = (levelOrder.get(a.level_id) ?? 0) - (levelOrder.get(b.level_id) ?? 0);
        return byLevel !== 0 ? byLevel : a.name.localeCompare(b.name);
      });
      setClasses(sortedClasses);
      setLevels(levelRows);
      setSchool(schoolRows[0] ?? null);
      setLoadingContext(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId) ?? null, [classes, classId]);
  const selectedLevel = useMemo(() => levels.find((l) => l.id === selectedClass?.level_id) ?? null, [levels, selectedClass]);
  const isScoredLevel = selectedLevel?.assessment_mode === "scored";
  const isSkillLevel = selectedLevel?.assessment_mode === "skill-checklist";

  useEffect(() => {
    if (!classId || !term || !selectedLevel) {
      setRosterSize(0);
      setSubjectProgress([]);
      setAreaProgress([]);
      setAttendanceCount(0);
      setRemarksCount(0);
      setFeeDue(0);
      setFeePaid(0);
      return;
    }
    let cancelled = false;
    setLoadingClass(true);
    (async () => {
      const enrollments = await captureDb.enrollments.where("[term_id+class_id]").equals([term.id, classId]).toArray();
      const studentIds = enrollments.map((e) => e.student_id);
      if (cancelled) return;
      setRosterSize(studentIds.length);

      // Remarks & attendance completion - same fields CaptureRemarksAttendance
      // writes, whichever set applies to this level.
      const reportRecords = (await captureDb.reportRecords.where("term_id").equals(term.id).toArray()).filter((r) =>
        studentIds.includes(r.student_id)
      );
      const attendance = reportRecords.filter((r) => r.days_present != null).length;
      const remarks = reportRecords.filter((r) =>
        isSkillLevel
          ? !!r.general_comment
          : !!(r.class_teacher_remark || r.conduct_remark || r.interest_remark || r.attitude_remark || r.headteacher_remark)
      ).length;
      if (!cancelled) {
        setAttendanceCount(attendance);
        setRemarksCount(remarks);
      }

      if (isScoredLevel) {
        const subjectRows = await captureDb.subjects.filter((s) => s.level_ids.includes(selectedLevel.id)).sortBy("sort_order");
        const scores = (await captureDb.scoreRecords.where("term_id").equals(term.id).toArray()).filter((r) =>
          studentIds.includes(r.student_id)
        );
        const built: SubjectProgress[] = subjectRows.map((subject) => {
          const forSubject = scores.filter((s) => s.subject_id === subject.id);
          return {
            subjectId: subject.id,
            name: subject.name,
            sbaCount: forSubject.filter((s) => s.sba_score != null).length,
            examCount: forSubject.filter((s) => s.exam_score != null).length,
          };
        });
        if (!cancelled) {
          setSubjectProgress(built);
          setAreaProgress([]);
        }
      } else if (isSkillLevel) {
        const areaRows: LearningAreaRow[] = await captureDb.learningAreas.filter((a) => a.level_ids.includes(selectedLevel.id)).sortBy("sort_order");
        const ratings = (await captureDb.skillRatings.where("term_id").equals(term.id).toArray()).filter((r) =>
          studentIds.includes(r.student_id)
        );
        const built: AreaProgress[] = [];
        for (const area of areaRows) {
          const skillsInArea = await captureDb.skills.filter((s) => s.learning_area_id === area.id && s.level_id === selectedLevel.id).toArray();
          const skillIds = new Set(skillsInArea.map((s) => s.id));
          const rated = ratings.filter((r) => skillIds.has(r.skill_id) && r.rating != null).length;
          built.push({ areaId: area.id, name: area.name, rated, total: skillsInArea.length * studentIds.length });
        }
        if (!cancelled) {
          setAreaProgress(built);
          setSubjectProgress([]);
        }
      } else {
        setSubjectProgress([]);
        setAreaProgress([]);
      }

      if (isFeeManager && school?.is_private) {
        const studentFees = (await captureDb.studentFees.where("term_id").equals(term.id).toArray()).filter((f) =>
          studentIds.includes(f.student_id)
        );
        let due = 0;
        let paid = 0;
        for (const fee of studentFees) {
          due += fee.amount_due;
          const payments = await captureDb.feePayments.where("student_fee_id").equals(fee.id).toArray();
          paid += payments.reduce((sum, p) => sum + p.amount, 0);
        }
        if (!cancelled) {
          setFeeDue(due);
          setFeePaid(paid);
        }
      } else {
        setFeeDue(0);
        setFeePaid(0);
      }

      if (!cancelled) setLoadingClass(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, term, selectedLevel, isScoredLevel, isSkillLevel, isFeeManager, school]);

  if (loadingContext) return <p className="text-muted">Loading…</p>;
  if (!term) {
    return <div className="alert alert-warning">No active term cached yet. Refresh reference data from Home while online.</div>;
  }

  return (
    <div>
      <h1 className="h4 mb-1">Progress</h1>
      <p className="text-muted mb-3">{term.term_name} - completion so far, from what's cached on this phone</p>

      <div className="actrs-card p-3 mb-3">
        <label className="form-label small">Class</label>
        <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {classId && loadingClass && <p className="text-muted text-center py-4">Loading…</p>}

      {classId && !loadingClass && rosterSize === 0 && (
        <p className="text-muted text-center py-4 px-3">
          No students cached for this class yet. Refresh reference data from Home while online.
        </p>
      )}

      {classId && !loadingClass && rosterSize > 0 && (
        <>
          <div className="actrs-card p-3 mb-3">
            <div className="small text-muted mb-2">Roster</div>
            <div className="fw-semibold mb-1">{rosterSize} students enrolled</div>
          </div>

          {isScoredLevel && subjectProgress.length > 0 && (
            <div className="actrs-card p-3 mb-3">
              <div className="small text-muted mb-2">Assessment entry - by subject</div>
              {subjectProgress.map((sp) => (
                <div key={sp.subjectId} className="mb-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>{sp.name}</span>
                    <span className="text-muted">
                      SBA {sp.sbaCount}/{rosterSize} · Exam {sp.examCount}/{rosterSize}
                    </span>
                  </div>
                  <Bar value={sp.sbaCount + sp.examCount} total={rosterSize * 2} />
                </div>
              ))}
            </div>
          )}

          {isSkillLevel && areaProgress.length > 0 && (
            <div className="actrs-card p-3 mb-3">
              <div className="small text-muted mb-2">Skill ratings - by learning area</div>
              {areaProgress.map((ap) => (
                <div key={ap.areaId} className="mb-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>{ap.name}</span>
                    <span className="text-muted">
                      {ap.rated}/{ap.total}
                    </span>
                  </div>
                  <Bar value={ap.rated} total={ap.total} />
                </div>
              ))}
            </div>
          )}

          <div className="actrs-card p-3 mb-3">
            <div className="small text-muted mb-2">Remarks &amp; attendance</div>
            <div className="d-flex justify-content-between small mb-1">
              <span>Attendance recorded</span>
              <span className="text-muted">
                {attendanceCount}/{rosterSize}
              </span>
            </div>
            <Bar value={attendanceCount} total={rosterSize} />
            <div className="d-flex justify-content-between small mb-1 mt-2">
              <span>{isSkillLevel ? "General comments" : "Remarks"} entered</span>
              <span className="text-muted">
                {remarksCount}/{rosterSize}
              </span>
            </div>
            <Bar value={remarksCount} total={rosterSize} />
          </div>

          {isFeeManager && school?.is_private && (
            <div className="actrs-card p-3 mb-3">
              <div className="small text-muted mb-2">Fee collection</div>
              <div className="d-flex justify-content-between">
                <span className="small">Due</span>
                <span className="fw-medium">{money(feeDue)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="small">Paid</span>
                <span className="fw-medium text-success">{money(feePaid)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="small">Balance</span>
                <span className="fw-semibold text-danger">{money(feeDue - feePaid)}</span>
              </div>
              <Bar value={feePaid} total={feeDue || 1} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
