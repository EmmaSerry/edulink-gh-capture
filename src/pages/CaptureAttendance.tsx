import { useCallback, useEffect, useMemo, useState } from "react";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { captureDb } from "@/lib/offlineDb";
import {
  AttendanceCaptureService,
  onAttendanceChange,
  todayISO,
  friendlyError,
  type AttMark,
  type AttStatus,
} from "@/services/AttendanceCaptureService";
import type { ClassRow, StudentRow, TermRow } from "@/types/database";

const OPTIONS: { key: AttStatus; label: string; cls: string }[] = [
  { key: "present", label: "P", cls: "success" },
  { key: "late", label: "L", cls: "warning" },
  { key: "absent", label: "A", cls: "danger" },
  { key: "excused", label: "E", cls: "info" },
];

function nameOf(s: StudentRow): string {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}

/**
 * Daily attendance on the phone. Works with no internet: the register is saved on the phone and sent
 * automatically when a connection returns. P = Present, L = Late, A = Absent, E = Excused.
 */
export function CaptureAttendance() {
  const { profile } = useCaptureAuth();
  const online = useOnlineStatus();
  const [term, setTerm] = useState<TermRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttMark>>({});
  const [unsent, setUnsent] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingTotal, setPendingTotal] = useState(0);

  useEffect(() => {
    void (async () => {
      const t = (await captureDb.terms.filter((x) => x.is_active).first()) ?? null;
      setTerm(t);
      const all = await captureDb.classes.toArray();
      const mine =
        profile?.role === "teacher" ? all.filter((c) => c.class_teacher_id === profile.id) : all;
      mine.sort((a, b) => a.name.localeCompare(b.name));
      setClasses(mine);
      if (mine.length === 1) setClassId(mine[0].id);
    })();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    const load = () => void AttendanceCaptureService.pendingCount().then(setPendingTotal);
    load();
    return onAttendanceChange(load);
  }, []);

  const loadDay = useCallback(async () => {
    if (!term || !classId) {
      setStudents([]);
      setMarks({});
      return;
    }
    setLoading(true);
    setMsg(null);
    const roster = await captureDb.enrollments.where("[term_id+class_id]").equals([term.id, classId]).toArray();
    const studs = (await captureDb.students.bulkGet(roster.map((e) => e.student_id))).filter(
      (s): s is StudentRow => !!s
    );
    studs.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    setStudents(studs);
    const day = await AttendanceCaptureService.load(classId, date, online);
    setMarks(day.marks);
    setUnsent(day.unsent);
    setDirty(false);
    setLoading(false);
  }, [term, classId, date, online]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  function mark(id: string, s: AttStatus) {
    setMarks((m) => {
      const cur = m[id]?.status;
      return { ...m, [id]: { status: cur === s ? "" : s, note: m[id]?.note ?? "" } };
    });
    setDirty(true);
    setMsg(null);
  }

  function allPresent() {
    const m: Record<string, AttMark> = {};
    for (const s of students) m[s.id] = { status: "present", note: marks[s.id]?.note ?? "" };
    setMarks(m);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!term || !classId) return;
    await AttendanceCaptureService.save(classId, term.id, date, marks);
    setDirty(false);
    setUnsent(true);
    if (online) {
      const r = await AttendanceCaptureService.send();
      if (r.failed.length > 0) setMsg({ ok: false, text: friendlyError(new Error(r.failed[0]), "Could not send.") });
      else {
        setUnsent(false);
        setMsg({ ok: true, text: "Register saved and sent." });
      }
    } else {
      setMsg({ ok: true, text: "Saved on this phone. It will be sent when you are online." });
    }
  }

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, none: 0 };
    for (const s of students) {
      const v = marks[s.id]?.status;
      if (v) c[v] += 1;
      else c.none += 1;
    }
    return c;
  }, [students, marks]);

  if (!term) return <div className="alert alert-warning small">No active term on this phone yet. Open Home and tap "Refresh reference data" while online.</div>;

  return (
    <div>
      <h1 className="h5 mb-1">Daily attendance</h1>
      <p className="text-muted small mb-3">
        {term.term_name} · P present, L late, A absent, E excused
        {pendingTotal > 0 && <span className="text-warning"> · {pendingTotal} register(s) waiting to send</span>}
      </p>

      <div className="actrs-card p-3 mb-3">
        <label className="form-label small mb-1">Class</label>
        <select className="form-select mb-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="form-label small mb-1">Date</label>
        <div className="d-flex gap-2">
          <input
            type="date"
            className="form-control"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button className="btn btn-outline-secondary" onClick={() => setDate(todayISO())}>
            Today
          </button>
        </div>
      </div>

      {msg && <div className={`alert ${msg.ok ? "alert-success" : "alert-danger"} py-2 small`}>{msg.text}</div>}

      {classId && (
        <div className="actrs-card p-0">
          <div className="p-3 border-bottom">
            <div className="small text-muted mb-2">
              Present {counts.present} · Late {counts.late} · Absent {counts.absent} · Excused {counts.excused} · Not marked{" "}
              {counts.none}
              {unsent && !dirty && <span className="text-warning"> · not sent yet</span>}
              {dirty && <span className="text-warning"> · unsaved</span>}
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-success btn-sm flex-fill" onClick={allPresent} disabled={loading}>
                Everyone present
              </button>
              <button className="btn btn-primary btn-sm flex-fill" onClick={() => void save()} disabled={!dirty && !unsent}>
                {online ? "Save & send" : "Save on phone"}
              </button>
            </div>
          </div>
          {loading && <p className="text-center text-muted py-4 mb-0">Loading…</p>}
          {!loading && students.length === 0 && (
            <p className="text-center text-muted py-4 mb-0 small">
              No learners cached for this class. Refresh reference data on the Home screen while online.
            </p>
          )}
          {!loading &&
            students.map((s, i) => (
              <div key={s.id} className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom">
                <div className="small fw-medium" style={{ minWidth: 0 }}>
                  <span className="text-muted me-2">{i + 1}</span>
                  {nameOf(s)}
                </div>
                <div className="btn-group btn-group-sm flex-shrink-0">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`btn ${marks[s.id]?.status === o.key ? `btn-${o.cls}` : `btn-outline-${o.cls}`}`}
                      style={{ minWidth: 40 }}
                      onClick={() => mark(s.id, o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
