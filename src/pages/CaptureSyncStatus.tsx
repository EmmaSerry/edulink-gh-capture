import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { SyncEngine } from "@/services/SyncEngine";
import type { OutboxEntry } from "@/lib/offlineDb";

const TYPE_LABEL: Record<OutboxEntry["type"], string> = {
  REGISTER_STUDENT: "Student registration",
  UPSERT_SCORE: "Score entry",
  UPSERT_SKILL_RATING: "Skill rating",
  UPSERT_REPORT_FIELDS: "Remarks/attendance",
};

const STATUS_BADGE: Record<OutboxEntry["status"], string> = {
  PENDING: "text-bg-secondary",
  SYNCING: "text-bg-info",
  SYNCED: "text-bg-success",
  FAILED: "text-bg-danger",
};

/**
 * Every capture action ever queued on this phone, newest first - nothing
 * captured offline is ever silently dropped, so this screen is the
 * honest record of what has and hasn't actually reached the server yet,
 * and exactly why anything that failed did.
 */
export function CaptureSyncStatus() {
  const { entries, pending, failed, syncing } = useOutboxStatus();
  const online = useOnlineStatus();

  return (
    <div>
      <h1 className="h4 mb-1">Sync status</h1>
      <p className="text-muted mb-3">
        {pending} pending · {failed} failed
      </p>

      <button className="btn btn-primary btn-sm w-100 mb-3" onClick={() => void SyncEngine.run()} disabled={!online || syncing}>
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {!online && <p className="text-muted small mb-3">Connect to the internet to sync.</p>}

      {entries.length === 0 && <p className="text-muted">Nothing captured yet.</p>}

      <div className="actrs-card p-0">
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
    </div>
  );
}
