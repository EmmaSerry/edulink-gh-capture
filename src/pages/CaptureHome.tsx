import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { LookupSyncService } from "@/services/LookupSyncService";
import { SyncEngine } from "@/services/SyncEngine";
import { getLastLookupSyncAt, captureDb } from "@/lib/offlineDb";
import type { TermRow } from "@/types/database";

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleString();
}

export function CaptureHome() {
  const { profile } = useCaptureAuth();
  const online = useOnlineStatus();
  const { pending, failed, syncing } = useOutboxStatus();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [term, setTerm] = useState<TermRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    void getLastLookupSyncAt().then(setLastSync);
    void captureDb.terms.filter((t) => t.is_active).first().then((t) => setTerm(t ?? null));
    void captureDb.students.count().then(setStudentCount);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await LookupSyncService.syncAll();
      setLastSync(await getLastLookupSyncAt());
      setStudentCount(await captureDb.students.count());
      setTerm((await captureDb.terms.filter((t) => t.is_active).first()) ?? null);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not refresh reference data.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <h1 className="h4 mb-1">Hi, {profile?.full_name?.split(" ")[0] ?? "there"}</h1>
      <p className="text-muted mb-4">{term ? term.term_name : "No active term cached yet"}</p>

      <div className="actrs-card p-3 mb-3">
        <div className="d-flex justify-content-between small mb-1">
          <span className="text-muted">Reference data last refreshed</span>
          <span>{formatWhen(lastSync)}</span>
        </div>
        <div className="d-flex justify-content-between small mb-3">
          <span className="text-muted">Students cached for offline use</span>
          <span>{studentCount ?? "…"}</span>
        </div>
        {refreshError && <div className="alert alert-danger small py-2 mb-2">{refreshError}</div>}
        <button className="btn btn-outline-primary btn-sm w-100" onClick={handleRefresh} disabled={!online || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh reference data"}
        </button>
        {!online && <p className="text-muted small mt-2 mb-0">Connect to the internet to refresh reference data.</p>}
      </div>

      <div className="actrs-card p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="small text-muted">Pending items to sync</span>
          <span className="fw-semibold">{pending}</span>
        </div>
        {failed > 0 && (
          <div className="d-flex justify-content-between align-items-center mb-2 text-danger">
            <span className="small">Failed - needs attention</span>
            <span className="fw-semibold">{failed}</span>
          </div>
        )}
        <button className="btn btn-primary btn-sm w-100" onClick={() => void SyncEngine.run()} disabled={!online || syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <Link to="/sync" className="d-block text-center small mt-2">
          View sync details
        </Link>
      </div>

      <div className="row g-2">
        <div className="col-6">
          <Link to="/register" className="btn btn-outline-secondary w-100 py-3">
            <i className="bi bi-person-plus d-block fs-4 mb-1" />
            Register student
          </Link>
        </div>
        <div className="col-6">
          <Link to="/assessment" className="btn btn-outline-secondary w-100 py-3">
            <i className="bi bi-clipboard-check d-block fs-4 mb-1" />
            Enter assessment
          </Link>
        </div>
      </div>
    </div>
  );
}
