import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { MockCaptureService, onMockChange, type CachedMock } from "@/services/MockCaptureService";
import { gradeForMark } from "@/mock/mockEngine";
import { cellKey, displayText, storedText, validateCellText, type PendingChange } from "@/mock/mockCaptureLogic";

function when(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleString();
}

/** Offline marks entry for Mock Exams. Marks are kept on the phone and sent to the server when online. */
export function CaptureMock() {
  const online = useOnlineStatus();
  const [mocks, setMocks] = useState<CachedMock[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [mockId, setMockId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [cls, setCls] = useState("");

  const reload = useCallback(async () => {
    setMocks(await MockCaptureService.listCached());
    setPending(await MockCaptureService.pendingAll());
    setLastDownload(await MockCaptureService.lastDownloadAt());
  }, []);

  useEffect(() => {
    void reload();
    return onMockChange(() => void reload());
  }, [reload]);

  const mock = mocks.find((m) => m.id === mockId) ?? null;
  const pendingMap = useMemo(() => new Map(pending.map((p) => [p.key, p])), [pending]);
  const subject = mock?.subjects.find((s) => s.id === subjectId) ?? null;
  const classes = mock ? [...new Set(mock.candidates.map((c) => c.className))].sort() : [];
  const learners = mock ? mock.candidates.filter((c) => c.status === "registered" && (!cls || c.className === cls)) : [];
  const pendingForMock = mock ? pending.filter((p) => p.mockId === mock.id).length : 0;

  async function download() {
    setBusy("download");
    setErr("");
    setMsg("");
    try {
      const n = await MockCaptureService.download();
      setMsg(n === 0 ? "No mocks are open for entry right now." : `${n} mock${n === 1 ? "" : "s"} saved on this phone.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not download the mocks.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    setBusy("send");
    setErr("");
    setMsg("");
    try {
      const r = await MockCaptureService.send();
      if (r.failed.length) setErr(r.failed.map((f) => `${f.mockName}: ${f.message}`).join("  "));
      else if (r.sent > 0) setMsg(`${r.sent} mark${r.sent === 1 ? "" : "s"} sent to the server.`);
      else setMsg("Nothing to send.");
    } finally {
      setBusy("");
    }
  }

  async function discard() {
    if (!mock) return;
    if (!window.confirm(`Throw away the ${pendingForMock} unsent change${pendingForMock === 1 ? "" : "s"} on this phone for this mock?`)) return;
    await MockCaptureService.discardPending(mock.id);
  }

  return (
    <div>
      <h1 className="h5 mb-1">Mock exams</h1>
      <p className="text-muted small">Enter mock marks, even with no internet. Marks stay on this phone until they are sent.</p>

      <div className="actrs-card p-3 mb-3">
        <div className="d-flex justify-content-between small mb-2">
          <span className="text-muted">Mocks last downloaded</span>
          <span className="fw-medium">{when(lastDownload)}</span>
        </div>
        <div className="d-flex justify-content-between small mb-2">
          <span className="text-muted">Marks waiting to be sent</span>
          <span className="fw-semibold">{pending.length}</span>
        </div>
        {err && <div className="alert alert-danger small py-2 mb-2">{err}</div>}
        {msg && <div className="alert alert-success small py-2 mb-2">{msg}</div>}
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm flex-fill" disabled={!online || !!busy} onClick={download}>
            {busy === "download" ? "Downloading…" : "Download mocks"}
          </button>
          <button className="btn btn-primary btn-sm flex-fill" disabled={!online || !!busy || pending.length === 0} onClick={send}>
            {busy === "send" ? "Sending…" : "Send marks"}
          </button>
        </div>
        {!online && <p className="text-muted small mt-2 mb-0">You are offline. You can still enter marks; send them when you are back online.</p>}
      </div>

      {mocks.length === 0 ? (
        <div className="actrs-card p-3 text-muted small">No mock is saved on this phone yet. Connect to the internet and tap “Download mocks”. Only mocks that are open for entry appear.</div>
      ) : (
        <div className="actrs-card p-3">
          <div className="mb-2">
            <label className="form-label small mb-1">Mock</label>
            <select className="form-select" value={mockId} onChange={(e) => { setMockId(e.target.value); setSubjectId(""); setCls(""); }}>
              <option value="">Choose a mock…</option>
              {mocks.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.academicYearLabel})
                </option>
              ))}
            </select>
          </div>

          {mock && (
            <>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label small mb-1">Subject</label>
                  <select className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">Choose…</option>
                    {mock.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1">Class</label>
                  <select className="form-select" value={cls} onChange={(e) => setCls(e.target.value)}>
                    <option value="">All</option>
                    {classes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="small text-muted mb-2">
                Type the mark, or <strong>A</strong> if the learner was absent. Leave blank if not yet written. A mark of <strong>0</strong> is a real score. Each mark is saved on the phone as you type.
              </p>

              {!subject ? (
                <div className="text-muted small">Choose a subject to start.</div>
              ) : (
                <div>
                  {learners.map((c) => {
                    const text = displayText(c.id, subject.id, mock.marks, pendingMap);
                    const problem = validateCellText(text, subject.maxMark, mock.grading.allowDecimals);
                    const isPending = pendingMap.has(cellKey(c.id, subject.id));
                    const n = text.trim() !== "" && !problem && !/^a/i.test(text.trim()) ? Number(text) : null;
                    const g = n === null ? null : gradeForMark(n, subject.maxMark, mock.grading);
                    return (
                      <div key={c.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div className="fw-medium text-truncate">{c.fullName}</div>
                          <div className="small text-muted">
                            {c.className} · {c.candidateNo}
                          </div>
                        </div>
                        <div className="text-end" style={{ width: 96 }}>
                          <input
                            className={`form-control text-center ${problem ? "is-invalid" : isPending ? "border-warning" : ""}`}
                            inputMode="decimal"
                            placeholder={`/${subject.maxMark}`}
                            value={text}
                            onChange={(e) => void MockCaptureService.setCell(mock.id, c.id, subject.id, e.target.value, storedText(c.id, subject.id, mock.marks))}
                          />
                          <div className="small" style={{ minHeight: 18 }}>
                            {problem ? <span className="text-danger">{problem}</span> : g ? <span className="text-muted">Grade {g.grade}</span> : /^a/i.test(text.trim()) ? <span className="text-muted">Absent</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {learners.length === 0 && <div className="text-muted small">No learners to show.</div>}
                </div>
              )}

              {pendingForMock > 0 && (
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <span className="small text-muted">{pendingForMock} unsent on this phone</span>
                  <button className="btn btn-link btn-sm text-danger p-0" onClick={discard}>
                    Throw away unsent changes
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
