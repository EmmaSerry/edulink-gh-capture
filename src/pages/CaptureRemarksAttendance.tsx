import { useEffect, useMemo, useState } from "react";
import { captureDb } from "@/lib/offlineDb";
import { CaptureService } from "@/services/CaptureService";
import { KG_GENERAL_COMMENT_BANK } from "@/constants/kgCommentBank";
import {
  CONDUCT_COMMENT_BANK,
  INTEREST_COMMENT_BANK,
  ATTITUDE_COMMENT_BANK,
  CLASS_TEACHER_REMARK_BANK,
  HEADTEACHER_REMARK_BANK,
} from "@/constants/scoredRemarkCommentBanks";
import type { TermRow, ClassRow, LevelRow, StudentRow, ReportRecordRow, SchoolRow } from "@/types/database";

function fullNameOf(s: StudentRow): string {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}

interface ScoredDraft {
  days_present: string;
  conduct_remark: string;
  interest_remark: string;
  attitude_remark: string;
  class_teacher_remark: string;
  headteacher_remark: string;
  progression: string;
}

interface KgDraft {
  days_present: string;
  general_comment: string;
  class_teacher_name: string;
  head_teacher_name: string;
  progression: string;
}

function scoredDraftFromRecord(record: ReportRecordRow | undefined): ScoredDraft {
  return {
    days_present: record?.days_present != null ? String(record.days_present) : "",
    conduct_remark: record?.conduct_remark ?? "",
    interest_remark: record?.interest_remark ?? "",
    attitude_remark: record?.attitude_remark ?? "",
    class_teacher_remark: record?.class_teacher_remark ?? "",
    headteacher_remark: record?.headteacher_remark ?? "",
    progression: record?.progression ?? "",
  };
}

/** Same defaulting as CloudReportRemarksEntry's kgDraftFromRecord: the
 *  class teacher's/headteacher's name fields prefill from the class's
 *  assigned teacher and the school's configured headteacher (both
 *  already cached offline by LookupSyncService) rather than starting
 *  blank. */
function kgDraftFromRecord(record: ReportRecordRow | undefined, cls: ClassRow | null, school: SchoolRow | null): KgDraft {
  return {
    days_present: record?.days_present != null ? String(record.days_present) : "",
    general_comment: record?.general_comment ?? "",
    class_teacher_name: record?.class_teacher_name ?? cls?.class_teacher_name ?? "",
    head_teacher_name: record?.head_teacher_name ?? school?.head_teacher_name ?? "",
    progression: record?.progression ?? "",
  };
}

type SaveState = "idle" | "saving" | "saved";

function SaveButton({ state, onClick }: { state: SaveState; onClick: () => void }) {
  return (
    <div className="d-flex align-items-center gap-2 mt-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={state === "saving"} onClick={onClick}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      {state === "saved" && <span className="text-success small">Saved - will sync when online</span>}
    </div>
  );
}

/** A quick-fill dropdown stacked above a free-text input - selecting an
 *  option copies it into the field below, which stays a normal text
 *  input the teacher can still edit or overwrite by typing their own
 *  remark instead. Same pattern KgCard's General comments box already
 *  used, just reused for every scored-level remark field. */
function QuickFillField({
  bank,
  value,
  onChange,
}: {
  bank: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <>
      <select
        className="form-select form-select-sm mb-1"
        value=""
        onChange={(e) => {
          if (!e.target.value) return;
          onChange(e.target.value);
        }}
      >
        <option value="">Quick-fill…</option>
        {bank.map((phrase) => (
          <option key={phrase} value={phrase}>
            {phrase}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="form-control form-control-sm"
        placeholder="Or type your own…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function ScoredCard({
  student,
  record,
  onSave,
}: {
  student: StudentRow;
  record: ReportRecordRow | undefined;
  onSave: (studentId: string, changes: Partial<ReportRecordRow>) => void;
}) {
  const [draft, setDraft] = useState<ScoredDraft>(() => scoredDraftFromRecord(record));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    setDraft(scoredDraftFromRecord(record));
    setSaveState("idle");
  }, [record]);

  function set<K extends keyof ScoredDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaveState("idle");
  }

  function handleSave() {
    const daysPresentValue = draft.days_present.trim() === "" ? null : Number(draft.days_present);
    if (daysPresentValue !== null && (Number.isNaN(daysPresentValue) || daysPresentValue < 0)) return;
    setSaveState("saving");
    onSave(student.id, {
      days_present: daysPresentValue,
      conduct_remark: draft.conduct_remark.trim() === "" ? null : draft.conduct_remark,
      interest_remark: draft.interest_remark.trim() === "" ? null : draft.interest_remark,
      attitude_remark: draft.attitude_remark.trim() === "" ? null : draft.attitude_remark,
      class_teacher_remark: draft.class_teacher_remark.trim() === "" ? null : draft.class_teacher_remark,
      headteacher_remark: draft.headteacher_remark.trim() === "" ? null : draft.headteacher_remark,
      progression: draft.progression.trim() === "" ? null : draft.progression,
    });
    setSaveState("saved");
  }

  return (
    <div className="p-3 border-bottom">
      <div className="fw-medium mb-2">{fullNameOf(student)}</div>
      <div className="row g-2">
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Days present</label>
          <input
            type="number"
            min={0}
            className="form-control form-control-sm"
            value={draft.days_present}
            onChange={(e) => set("days_present", e.target.value)}
          />
        </div>
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Promoted to</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="e.g. Basic 6"
            value={draft.progression}
            onChange={(e) => set("progression", e.target.value)}
          />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">Class teacher's remark</label>
          <QuickFillField bank={CLASS_TEACHER_REMARK_BANK} value={draft.class_teacher_remark} onChange={(v) => set("class_teacher_remark", v)} />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">Headteacher's remark</label>
          <QuickFillField bank={HEADTEACHER_REMARK_BANK} value={draft.headteacher_remark} onChange={(v) => set("headteacher_remark", v)} />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">Conduct</label>
          <QuickFillField bank={CONDUCT_COMMENT_BANK} value={draft.conduct_remark} onChange={(v) => set("conduct_remark", v)} />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">Interest</label>
          <QuickFillField bank={INTEREST_COMMENT_BANK} value={draft.interest_remark} onChange={(v) => set("interest_remark", v)} />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">Attitude</label>
          <QuickFillField bank={ATTITUDE_COMMENT_BANK} value={draft.attitude_remark} onChange={(v) => set("attitude_remark", v)} />
        </div>
      </div>
      <SaveButton state={saveState} onClick={handleSave} />
    </div>
  );
}

function KgCard({
  student,
  record,
  cls,
  school,
  onSave,
}: {
  student: StudentRow;
  record: ReportRecordRow | undefined;
  cls: ClassRow | null;
  school: SchoolRow | null;
  onSave: (studentId: string, changes: Partial<ReportRecordRow>) => void;
}) {
  const [draft, setDraft] = useState<KgDraft>(() => kgDraftFromRecord(record, cls, school));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    setDraft(kgDraftFromRecord(record, cls, school));
    setSaveState("idle");
  }, [record, cls, school]);

  function handleSave() {
    const daysPresentValue = draft.days_present.trim() === "" ? null : Number(draft.days_present);
    if (daysPresentValue !== null && (Number.isNaN(daysPresentValue) || daysPresentValue < 0)) return;
    setSaveState("saving");
    onSave(student.id, {
      days_present: daysPresentValue,
      general_comment: draft.general_comment.trim() === "" ? null : draft.general_comment,
      class_teacher_name: draft.class_teacher_name.trim() === "" ? null : draft.class_teacher_name,
      head_teacher_name: draft.head_teacher_name.trim() === "" ? null : draft.head_teacher_name,
      progression: draft.progression.trim() === "" ? null : draft.progression,
    });
    setSaveState("saved");
  }

  return (
    <div className="p-3 border-bottom">
      <div className="fw-medium mb-2">{fullNameOf(student)}</div>
      <div className="row g-2">
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Days present</label>
          <input
            type="number"
            min={0}
            className="form-control form-control-sm"
            value={draft.days_present}
            onChange={(e) => {
              setDraft((d) => ({ ...d, days_present: e.target.value }));
              setSaveState("idle");
            }}
          />
        </div>
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Progression</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="e.g. KG2"
            value={draft.progression}
            onChange={(e) => {
              setDraft((d) => ({ ...d, progression: e.target.value }));
              setSaveState("idle");
            }}
          />
        </div>
        <div className="col-12">
          <label className="form-label small text-muted mb-1">General comments</label>
          <select
            className="form-select form-select-sm mb-1"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setDraft((d) => ({ ...d, general_comment: e.target.value }));
              setSaveState("idle");
            }}
          >
            <option value="">Quick-fill a comment…</option>
            {KG_GENERAL_COMMENT_BANK.map((phrase) => (
              <option key={phrase} value={phrase}>
                {phrase}
              </option>
            ))}
          </select>
          <textarea
            className="form-control form-control-sm"
            rows={2}
            placeholder="General comments on the learner's progress this term…"
            value={draft.general_comment}
            onChange={(e) => {
              setDraft((d) => ({ ...d, general_comment: e.target.value }));
              setSaveState("idle");
            }}
          />
        </div>
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Class teacher's name</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={draft.class_teacher_name}
            onChange={(e) => {
              setDraft((d) => ({ ...d, class_teacher_name: e.target.value }));
              setSaveState("idle");
            }}
          />
        </div>
        <div className="col-6">
          <label className="form-label small text-muted mb-1">Headteacher's name</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={draft.head_teacher_name}
            onChange={(e) => {
              setDraft((d) => ({ ...d, head_teacher_name: e.target.value }));
              setSaveState("idle");
            }}
          />
        </div>
      </div>
      <SaveButton state={saveState} onClick={handleSave} />
    </div>
  );
}

/**
 * Offline counterpart of the cloud app's CloudReportRemarksEntry - same
 * two field sets (a scored level's Conduct/Interest/Attitude/Class
 * Teacher's/Headteacher's remarks plus a promotion decision, and KG's
 * single General Comments box plus its own teacher/headteacher name
 * lines), same explicit per-student Save button, but reading its
 * roster/lookup data from the local cache and writing through
 * CaptureService (an instant, always-succeeds local queue write)
 * instead of a live RPC call - one card per student rather than a wide
 * table, since this app is used on a phone. Every scored-level remark
 * field now offers the same "quick-fill from a comment bank, or just
 * type your own" pattern KG's General comments box already had - see
 * scoredRemarkCommentBanks.ts (kept identical to the cloud app's copy).
 *
 * Same known scope limit as CaptureAssessment: the roster comes from
 * the cached `enrollments` table, so a student registered minutes ago
 * on this same phone and still unsynced will not yet appear here.
 */
export function CaptureRemarksAttendance() {
  const [term, setTerm] = useState<TermRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);

  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [records, setRecords] = useState<Map<string, ReportRecordRow>>(new Map());
  const [loadingClass, setLoadingClass] = useState(false);

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
      setStudents([]);
      setRecords(new Map());
      return;
    }
    let cancelled = false;
    setLoadingClass(true);
    (async () => {
      const enrollments = await captureDb.enrollments.where("[term_id+class_id]").equals([term.id, classId]).toArray();
      const studentIds = enrollments.map((e) => e.student_id);
      const rosterStudents = (await captureDb.students.bulkGet(studentIds))
        .filter((s): s is StudentRow => !!s)
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
      if (cancelled) return;
      setStudents(rosterStudents);

      const allReportRecords = await captureDb.reportRecords.where("term_id").equals(term.id).toArray();
      const map = new Map<string, ReportRecordRow>();
      for (const rec of allReportRecords) {
        if (studentIds.includes(rec.student_id)) map.set(rec.student_id, rec);
      }
      setRecords(map);
      setLoadingClass(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, term, selectedLevel]);

  function saveRow(studentId: string, changes: Partial<ReportRecordRow>) {
    if (!term || !classId) return;
    void CaptureService.upsertReportFields({ studentId, termId: term.id, classId, changes }).then(() => {
      setRecords((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        next.set(studentId, { ...(existing as ReportRecordRow), ...changes, student_id: studentId, term_id: term.id });
        return next;
      });
    });
  }

  if (loadingContext) return <p className="text-muted">Loading…</p>;
  if (!term) {
    return <div className="alert alert-warning">No active term cached yet. Refresh reference data from Home while online.</div>;
  }

  return (
    <div>
      <h1 className="h4 mb-1">Remarks &amp; attendance</h1>
      <p className="text-muted mb-3">{term.term_name}</p>

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

      {classId && (isScoredLevel || isSkillLevel) && (
        <div className="actrs-card p-0">
          {loadingClass && <p className="text-muted text-center py-4 mb-0">Loading…</p>}
          {!loadingClass && students.length === 0 && (
            <p className="text-muted text-center py-4 mb-0 px-3">
              No students cached for this class yet. Registrations made offline appear here after they sync and
              reference data is refreshed.
            </p>
          )}
          {!loadingClass &&
            isScoredLevel &&
            students.map((student) => (
              <ScoredCard key={student.id} student={student} record={records.get(student.id)} onSave={saveRow} />
            ))}
          {!loadingClass &&
            isSkillLevel &&
            students.map((student) => (
              <KgCard
                key={student.id}
                student={student}
                record={records.get(student.id)}
                cls={selectedClass}
                school={school}
                onSave={saveRow}
              />
            ))}
        </div>
      )}

      {classId && isSkillLevel && selectedClass && !selectedClass.class_teacher_name && (
        <p className="text-muted small mt-2 mb-0">
          No class teacher is assigned to {selectedClass.name} yet - set one under Settings → Classes in the
          dashboard and it'll fill in here automatically. Same for the headteacher's name, under Settings → School
          profile.
        </p>
      )}
    </div>
  );
}
