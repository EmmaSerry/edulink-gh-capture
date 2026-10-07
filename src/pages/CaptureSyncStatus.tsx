import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { SyncEngine } from "@/services/SyncEngine";
import { clearCompletedHistory, clearFailed, resetThisPhone } from "@/services/OutboxMaintenance";
import type { OutboxEntry } from "@/lib/offlineDb";

const TYPE_LABEL: Record<OutboxEntry["type"], string> = {
  REGISTER_STUDENT: "Student registration",
  UPSERT_SCORE: "Score entry",
  UPSERT_SKILL_RATING: "Skill rating",
  UPSERT_REPORT_FIELDS: "Remarks/attendance",
  RECORD_PAYMENT: "Fee payment",
};

const STATUS_BADGE: Record<OutboxEntry["status"], string> = {
  PENDING: "text-bg-secondary",
  SYNCING: "text-bg-info",
  SYNCED: "text-bg-success",
  FAILED: "text-bg-danger",
};

/**
 * Every capture action queued on this phone, newest first. Finished items
 * tidy themselves away after 3 days; the buttons at the bottom clear them
 * sooner, or wipe this phone's stored data completely.
 */
export function CaptureSyncStatus() {
  const { entries, pending, failed, syncing } = useOutboxStatus();
  const online = useOnlineStatus();
  const synced = entries.filter((e) => e.status === "SYNCED").length;

  async function handleClearCompleted() {
    if (!confirm(`Remove ${synced} finished item${synced === 1 ? "" : "s"} from this list? Their data is already safe on the server.`)) return;
    await clearCompletedHistory();
    window.location.reload();
  }

  async function handleClearFailed() {
    if (!confirm(`Remove ${failed} failed item${failed === 1 ? "" : "s"}? Their data was NOT saved to the server and will be lost.`)) return;
    await clearFailed();
    window.location.reload();
  }

  async function handleReset() {
    const warn =
      pending > 0
        ? `WARNING: ${pending} item${pending === 1 ? " has" : "s have"} not synced yet and will be LOST.\n\n`
        : "";
    if (!confirm(`${warn}Wipe everything stored on this phone and sign out? You will need to be online to sign in again.`)) return;
    await resetThisPhone();
  }

  return (
    <div>
      <h1 className="h4 mb-1">Sync status</h1>
      <p className="text-muted mb-3">
        {pending} pending · {failed} failed · {synced} finished
      </p>

      <button className="btn btn-primary btn-sm w-100 mb-3" onClick={() => void SyncEngine.run()} disabled={!online || syncing}>
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {!online && <p className="text-muted small mb-3">Connect to the internet to sync.</p>}

      {entries.length === 0 && <p className="text-muted">Nothing captured yet.</p>}

      <div className="actrs-card p-0 mb-4">
        {entries.map((entry) => (
          <div key={entry.clientId} className="p-2 border-bottom">
            <div className="d-flex justify-content-between align-items-center">
              <span className="small fw-medium">{TYPE_LABEL[entry.type]}</span>
              <span className={`badge ${STATUS_BADGE[entry.status]}`}>{entry.status}</span>
            </div>
            <div className="text-muted small">{new Date(entry.createdAt).toLocaleString()}</div>
            {entry.resultLabel && <div className="small text-success">{entry.resultLabel}</div>}
            {entry.error && <div className="small text-danger">{entry.error}</div>}
          </div>
        ))}
      </div>

      <div className="actrs-card p-3">
        <h2 className="h6 mb-2">Tidy up</h2>
        <p className="text-muted small">Finished items are removed automatically after 3 days.</p>
        <div className="d-grid gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={handleClearCompleted} disabled={synced === 0}>
            Clear finished history ({synced})
          </button>
          <button className="btn btn-outline-danger btn-sm" onClick={handleClearFailed} disabled={failed === 0}>
            Clear failed items ({failed})
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleReset}>
            Reset this phone (wipe all stored data)
          </button>
        </div>
      </div>
    </div>
  );
}
