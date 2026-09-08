import { useEffect, useMemo, useState } from "react";
import { captureDb } from "@/lib/offlineDb";
import { CaptureService } from "@/services/CaptureService";
import type {
  TermRow,
  ClassRow,
  LevelRow,
  SubjectRow,
  LearningAreaRow,
  SkillRow,
  SkillRating,
  StudentRow,
} from "@/types/database";

/** Same quick-fill defaults as the cloud app's CloudAssessmentWorkspace
 *  (Gold/Silver/Bronze each suggest a standard comment the first time a
 *  rating is picked) - kept in sync with that copy so a rating entered
 *  offline behaves identically once it syncs. Deliberately doesn't
 *  cover X/O - those aren't proficiency levels, so there's no "how they
 *  did" comment to suggest. */
const DEFAULT_SKILL_COMMENT: Record<string, string> = {
  G: "Keep it up",
  S: "Can do better",
  B: "More room for improvement",
};

/** Every phrase this app has ever auto-filled - used to tell "the
 *  teacher typed their own note" apart from "this is still whatever we
 *  last auto-filled" so correcting a rating can safely replace the
 *  comment instead of only filling it in when blank. */
const KNOWN_DEFAULT_COMMENTS = new Set(Object.values(DEFAULT_SKILL_COMMENT));

function fullNameOf(s: StudentRow): string {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}

/**
 * Offline counterpart of the cloud app's CloudAssessmentWorkspace - same
 * two modes (scored subjects vs KG skill-checklist), same
 * one-subject/skill-at-a-time flow, but reading its roster/lookup data
 * from the local cache and writing through CaptureService (an instant,
 * always-succeeds local queue write) instead of a live RPC call.
 *
 * Known, deliberate scope limit: the roster shown here comes from the
 * cached `enrollments` table, which only has a student in it once that
 * student's registration has actually synced at least once (see
 * LookupSyncService). A student registered minutes ago on this same
 * phone, still sitting unsynced in the outbox, will not yet appear here
 * - register while there's a signal (or sync before assessing) if the
 * same visit needs to do both for the same student.
 *
 * There is also no live assessment-status lock here the way the cloud
 * screen has one: that status lives on the server and offline capture
 * has no way to check it without a connection. If a session for this
 * class+term has been opened online before (and is therefore cached),
 * its last-known status is shown and entry is blocked if it wasn't
 * DRAFT; if nothing is cached yet, entry is simply allowed - a brand
 * new session starts life as DRAFT on the server too, so this is not
 * optimistic so much as it is the actual default.
 */
export function CaptureAssessment() {
  const [term, setTerm] = useState<TermRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [learningAreas, setLearningAreas] = useState<LearningAreaRow[]>([]);
  const [learningAreaId, setLearningAreaId] = useState("");
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillId, setSkillId] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<Map<string, { sba: number | null; exam: number | null }>>(new Map());
  const [ratings, setRatings] = useState<Map<string, { rating: SkillRating | null; comment: string | null }>>(new Map());
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [loadingClass, setLoadingClass] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [terms, classRows, levelRows] = await Promise.all([
        captureDb.terms.toArray(),
        captureDb.classes.toArray(),
        captureDb.levels.orderBy("sort_order").toArray(),
      ]);
      if (cancelled) return;
      setTerm(terms.find((t) => t.is_active) ?? null);
      // classRows comes back in IndexedDB's own storage order, not
      // curriculum order - sort by the owning level's sort_order (KG1,
      // KG2, Basic1..6, JHS1..3), then by class name for schools with
      // more than one class per level, so the picker reads the way a
      // teacher expects instead of looking shuffled.
      const levelOrder = new Map(levelRows.map((l) => [l.id, l.sort_order]));
      const sortedClasses = [...classRows].sort((a, b) => {
        const byLevel = (levelOrder.get(a.level_id) ?? 0) - (levelOrder.get(b.level_id) ?? 0);
        return byLevel !== 0 ? byLevel : a.name.localeCompare(b.name);
      });
      setClasses(sortedClasses);
      setLevels(levelRows);
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
      setStudents([]);
      setScores(new Map());
      setRatings(new Map());
      setSubjects([]);
      setSubjectId("");
      setLearningAreas([]);
      setLearningAreaId("");
      setSkills([]);
      setSkillId("");
      setSessionStatus(null);
      return;
    }
    let cancelled = false;
    setLoadingClass(true);
    (async () => {
      const cached = await captureDb.sessions.get(`${classId}:${term.id}`);
      if (cancelled) return;
      setSessionStatus(cached?.status ?? null);

      const enrollments = await captureDb.enrollments.where("[term_id+class_id]").equals([term.id, classId]).toArray();
      const studentIds = enrollments.map((e) => e.student_id);
      const rosterStudents = (await captureDb.students.bulkGet(studentIds))
        .filter((s): s is StudentRow => !!s)
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
      if (cancelled) return;
      setStudents(rosterStudents);

      if (isScoredLevel) {
        const subjectRows = await captureDb.subjects
          .filter((s) => s.level_ids.includes(selectedLevel.id))
          .sortBy("sort_order");
        if (cancelled) return;
        setSubjects(subjectRows);
        setSubjectId((current) => (subjectRows.some((s) => s.id === current) ? current : subjectRows[0]?.id ?? ""));
        setLearningAreas([]);
        setLearningAreaId("");
        setSkills([]);
        setSkillId("");

        const scoreMap = new Map<string, { sba: number | null; exam: number | null }>();
        const allScores = await captureDb.scoreRecords.where("term_id").equals(term.id).toArray();
        for (const rec of allScores) {
          if (!studentIds.includes(rec.student_id)) continue;
          scoreMap.set(`${rec.student_id}:${rec.subject_id}`, { sba: rec.sba_score, exam: rec.exam_score });
        }
        setScores(scoreMap);
        setRatings(new Map());
      } else if (isSkillLevel) {
        const areaRows = await captureDb.learningAreas.filter((a) => a.level_ids.includes(selectedLevel.id)).sortBy("sort_order");
        if (cancelled) return;
        setLearningAreas(areaRows);
        setLearningAreaId((current) => (areaRows.some((a) => a.id === current) ? current : areaRows[0]?.id ?? ""));
        setSubjects([]);
        setSubjectId("");

        const ratingMap = new Map<string, { rating: SkillRating | null; comment: string | null }>();
        const allRatings = await captureDb.skillRatings.where("term_id").equals(term.id).toArray();
        for (const rec of allRatings) {
          if (!studentIds.includes(rec.student_id)) continue;
          ratingMap.set(`${rec.student_id}:${rec.skill_id}`, { rating: rec.rating, comment: rec.comment });
        }
        setRatings(ratingMap);
        setScores(new Map());
      }
      setLoadingClass(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, term, selectedLevel, isScoredLevel, isSkillLevel]);

  useEffect(() => {
    if (!isSkillLevel || !selectedLevel || !learningAreaId) {
      setSkills([]);
      setSkillId("");
      return;
    }
    let cancelled = false;
    captureDb.skills
      .filter((s) => s.learning_area_id === learningAreaId && s.level_id === selectedLevel.id)
      .sortBy("sort_order")
      .then((rows) => {
        if (cancelled) return;
        setSkills(rows);
        setSkillId((current) => (rows.some((s) => s.id === current) ? current : rows[0]?.id ?? ""));
      });
    return () => {
      cancelled = true;
    };
  }, [isSkillLevel, selectedLevel, learningAreaId]);

  const editable = sessionStatus === null || sessionStatus === "DRAFT";

  async function handleScoreBlur(studentId: string, field: "sba" | "exam", raw: string) {
    if (!term || !classId || !subjectId) return;
    const key = `${studentId}:${subjectId}`;
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0 || value > 50)) return;
    const previous = scores.get(key) ?? { sba: null, exam: null };
    if (previous[field] === value) return;

    setSavingKey(`${key}:${field}`);
    await CaptureService.upsertScore({
      studentId,
      termId: term.id,
      subjectId,
      classId,
      field: field === "sba" ? "sbaScore" : "examScore",
      value,
    });
    setScores((prev) => {
      const next = new Map(prev);
      next.set(key, { ...previous, [field]: value });
      return next;
    });
    setSavingKey(null);
  }

  function handleRatingSelect(studentId: string, raw: string) {
    if (!term || !classId || !skillId) return;
    const key = `${studentId}:${skillId}`;
    const existing = ratings.get(key) ?? { rating: null, comment: null };
    const rating = (raw === "" ? null : raw) as SkillRating | null;
    if (existing.rating === rating) return;
    // Same fix as the cloud app: apply the quick-fill comment whenever
    // the comment cell is empty OR still holds a previous auto-fill, so
    // correcting a mis-picked rating (Gold -> Silver, say) updates the
    // comment to match instead of leaving the old rating's default
    // behind. A comment the teacher actually typed themselves is never
    // touched. X/O have no default of their own, so a leftover default
    // is cleared rather than left next to "Not assessed"/"Absent".
    const existingIsBlankOrDefault =
      !existing.comment || existing.comment.trim() === "" || KNOWN_DEFAULT_COMMENTS.has(existing.comment.trim());
    const comment = existingIsBlankOrDefault ? DEFAULT_SKILL_COMMENT[rating ?? ""] ?? null : existing.comment;
    setSavingKey(`${key}:rating`);
    void CaptureService.upsertSkillRating({
      studentId,
      termId: term.id,
      skillId,
      classId,
      rating,
      comment,
    }).then(() => {
      setRatings((prev) => {
        const next = new Map(prev);
        next.set(key, { rating, comment });
        return next;
      });
      setSavingKey(null);
    });
  }

  function handleCommentBlur(studentId: string, raw: string) {
    if (!term || !classId || !skillId) return;
    const key = `${studentId}:${skillId}`;
    const existing = ratings.get(key) ?? { rating: null, comment: null };
    const comment = raw.trim() === "" ? null : raw.trim();
    if (existing.comment === comment) return;
    setSavingKey(`${key}:comment`);
    void CaptureService.upsertSkillRating({
      studentId,
      termId: term.id,
      skillId,
      classId,
      rating: existing.rating,
      comment,
    }).then(() => {
      setRatings((prev) => {
        const next = new Map(prev);
        next.set(key, { ...existing, comment });
        return next;
      });
      setSavingKey(null);
    });
  }

  if (loadingContext) return <p className="text-muted">Loading…</p>;
  if (!term) {
    return <div className="alert alert-warning">No active term cached yet. Refresh reference data from Home while online.</div>;
  }

  return (
    <div>
      <h1 className="h4 mb-1">Assessment entry</h1>
      <p className="text-muted mb-3">{term.term_name}</p>

      <div className="actrs-card p-3 mb-3">
        <label className="form-label small">Class</label>
        <select className="form-select mb-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {isScoredLevel && (
          <>
            <label className="form-label small">Subject</label>
            <select className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={subjects.length === 0}>
              {subjects.length === 0 && <option value="">No subjects cached for this level</option>}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        {isSkillLevel && (
          <>
            <label className="form-label small">Learning area</label>
            <select className="form-select mb-2" value={learningAreaId} onChange={(e) => setLearningAreaId(e.target.value)} disabled={learningAreas.length === 0}>
              {learningAreas.length === 0 && <option value="">No learning areas cached</option>}
              {learningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="form-label small">Skill</label>
            <select className="form-select" value={skillId} onChange={(e) => setSkillId(e.target.value)} disabled={skills.length === 0}>
              {skills.length === 0 && <option value="">No skills cached</option>}
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serial_number != null ? `${s.serial_number}. ` : ""}
                  {s.description}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {classId && !editable && (
        <div className="alert alert-warning py-2 small">
          This assessment was last known to be {sessionStatus?.toLowerCase()} online, so entry is locked here too.
          Reopen it to draft in the cloud dashboard first.
        </div>
      )}

      {classId && (isScoredLevel || isSkillLevel) && editable && (
        <div className="actrs-card p-0">
          {loadingClass && <p className="text-muted text-center py-4 mb-0">Loading…</p>}
          {!loadingClass && students.length === 0 && (
            <p className="text-muted text-center py-4 mb-0 px-3">
              No students cached for this class yet. Registrations made offline appear here after they sync and
              reference data is refreshed.
            </p>
          )}
          {!loadingClass &&
            students.length > 0 &&
            isScoredLevel &&
            students.map((student) => {
              const key = `${student.id}:${subjectId}`;
              const cell = scores.get(key) ?? { sba: null, exam: null };
              return (
                <div key={student.id} className="d-flex align-items-center gap-2 p-2 border-bottom">
                  <div className="flex-grow-1 small">{fullNameOf(student)}</div>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="form-control form-control-sm"
                    style={{ width: 70 }}
                    placeholder="SBA"
                    defaultValue={cell.sba ?? ""}
                    key={`${key}:sba:${cell.sba}`}
                    disabled={!subjectId}
                    onBlur={(e) => handleScoreBlur(student.id, "sba", e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="form-control form-control-sm"
                    style={{ width: 70 }}
                    placeholder="Exam"
                    defaultValue={cell.exam ?? ""}
                    key={`${key}:exam:${cell.exam}`}
                    disabled={!subjectId}
                    onBlur={(e) => handleScoreBlur(student.id, "exam", e.target.value)}
                  />
                </div>
              );
            })}
          {!loadingClass &&
            students.length > 0 &&
            isSkillLevel &&
            skillId &&
            students.map((student) => {
              const key = `${student.id}:${skillId}`;
              const cell = ratings.get(key) ?? { rating: null, comment: null };
              return (
                <div key={student.id} className="p-2 border-bottom">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <div className="flex-grow-1 small">{fullNameOf(student)}</div>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 90 }}
                      defaultValue={cell.rating ?? ""}
                      key={`${key}:rating:${cell.rating}`}
                      onChange={(e) => handleRatingSelect(student.id, e.target.value)}
                    >
                      <option value="">-</option>
                      <option value="G">G</option>
                      <option value="S">S</option>
                      <option value="B">B</option>
                      <option value="X">X</option>
                      <option value="O">O</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Comment (optional)"
                    defaultValue={cell.comment ?? ""}
                    key={`${key}:comment:${cell.comment}`}
                    onBlur={(e) => handleCommentBlur(student.id, e.target.value)}
                  />
                </div>
              );
            })}
        </div>
      )}
      {savingKey && <p className="text-muted small mt-2 mb-0">Saved to queue…</p>}
    </div>
  );
}
