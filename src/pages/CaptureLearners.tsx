import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { captureDb } from "@/lib/offlineDb";
import { listPendingEdits, onEditsChange, runLearnerEditSync, discardEdit, type EditEntry } from "@/services/LearnerEditService";
import type { StudentRow } from "@/types/database";

interface Row {
  student: StudentRow;
  className: string;
}

/** Find a registered learner and open them for editing. Works offline. */
export function CaptureLearners() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<EditEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [students, enrollments, classes] = await Promise.all([
        captureDb.students.toArray(),
        captureDb.enrollments.filter((e) => e.is_current).toArray(),
        captureDb.classes.toArray(),
      ]);
      const className = new Map(classes.map((c) => [c.id, c.name]));
      const classOf = new Map(enrollments.map((e) => [e.student_id, className.get(e.class_id) ?? ""]));
      const list = students
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({ student: s, className: classOf.get(s.id) ?? "" }))
        .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));
      if (!cancelled) setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const load = () => void listPendingEdits().then(setEdits);
    load();
    return onEditsChange(load);
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = rows ?? [];
    const filtered = q
      ? all.filter((r) =>
          `${r.student.first_name} ${r.student.middle_name ?? ""} ${r.student.last_name} ${r.student.student_id} ${r.className}`
            .toLowerCase()
            .includes(q),
        )
      : all;
    return filtered.slice(0, 80);
  }, [rows, search]);

  const failed = edits.filter((e) => e.status === "FAILED");

  return (
    <div>
      <h1 className="h5 mb-1">Edit learners</h1>
      <p className="text-muted small">Pick a learner to correct their details. Changes save on this phone and reach the server when you are online.</p>

      {edits.length > 0 && (
        <div className={`alert ${failed.length ? "alert-warning" : "alert-info"} small py-2`}>
          {edits.length} change{edits.length === 1 ? "" : "s"} waiting to sync.
          {failed.length > 0 && (
            <ul className="mb-1 mt-1 ps-3">
              {failed.map((f) => (
                <li key={f.id}>
                  {f.studentLabel}: {f.error}{" "}
                  <button className="btn btn-link btn-sm p-0 align-baseline" onClick={() => void discardEdit(f.id)}>
                    Discard
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-sm btn-outline-primary mt-1" onClick={() => void runLearnerEditSync()}>
            Try again now
          </button>
        </div>
      )}

      <input
        className="form-control mb-3"
        placeholder="Search by name, ID or class"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {rows === null && <p className="text-muted">Loading...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-muted">No learners on this phone yet. Open Home and tap "Refresh reference data" while online.</p>
      )}

      <div className="d-flex flex-column gap-2">
        {shown.map(({ student, className }) => (
          <Link key={student.id} to={`/learners/${student.id}`} className="actrs-card p-3 text-decoration-none d-flex align-items-center gap-3">
            <div
              style={{ width: 40, height: 52, borderRadius: 6, overflow: "hidden", background: "#e9ecef", flexShrink: 0 }}
              className="border"
            >
              {student.photo_url && <img src={student.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div className="flex-grow-1">
              <div className="fw-semibold">
                {student.first_name} {student.last_name}
              </div>
              <div className="small text-muted">
                {student.student_id}
                {className ? ` · ${className}` : ""}
              </div>
            </div>
            {edits.some((e) => e.studentId === student.id) && <span className="badge text-bg-warning">Pending</span>}
          </Link>
        ))}
      </div>
      {rows !== null && rows.length > shown.length && !search && (
        <p className="text-muted small mt-2">Showing the first {shown.length}. Use search to find others.</p>
      )}
    </div>
  );
}
