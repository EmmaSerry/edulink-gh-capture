import { NavLink, Outlet } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { SyncEngine } from "@/services/SyncEngine";

/**
 * Phone-first app shell: a slim status strip up top (connection state +
 * pending sync count, tappable to force a sync attempt) and a bottom tab
 * bar for the three things a teacher actually does here - register a
 * student, enter assessment data, and check on sync. No sidebar, no
 * desktop-style top nav - this app is built to be held, not clicked.
 */
export function CaptureLayout() {
  const online = useOnlineStatus();
  const { pending, failed, syncing } = useOutboxStatus();
  const { profile, signOut } = useCaptureAuth();

  return (
    <div className="d-flex flex-column vh-100">
      <header
        className={`d-flex align-items-center justify-content-between px-3 py-2 ${online ? "bg-dark" : "bg-danger"} text-white`}
        style={{ fontSize: "0.8rem" }}
        onClick={() => void SyncEngine.run()}
        role="button"
      >
        <span>
          <i className={`bi ${online ? "bi-wifi" : "bi-wifi-off"} me-1`} />
          {online ? "Online" : "Offline"}
        </span>
        <span>
          {syncing
            ? "Syncing…"
            : pending > 0
              ? `${pending} pending`
              : failed > 0
                ? `${failed} failed - tap to retry`
                : "All synced"}
        </span>
      </header>

      <main className="flex-grow-1 overflow-auto p-3">
        <Outlet />
      </main>

      <nav className="d-flex border-top bg-white">
        <NavLink to="/" end className={({ isActive }) => `flex-fill text-center py-2 small ${isActive ? "text-primary fw-semibold" : "text-secondary"}`}>
          <i className="bi bi-house d-block fs-5" />
          Home
        </NavLink>
        <NavLink to="/register" className={({ isActive }) => `flex-fill text-center py-2 small ${isActive ? "text-primary fw-semibold" : "text-secondary"}`}>
          <i className="bi bi-person-plus d-block fs-5" />
          Register
        </NavLink>
        <NavLink to="/assessment" className={({ isActive }) => `flex-fill text-center py-2 small ${isActive ? "text-primary fw-semibold" : "text-secondary"}`}>
          <i className="bi bi-clipboard-check d-block fs-5" />
          Assessment
        </NavLink>
        <NavLink to="/sync" className={({ isActive }) => `flex-fill text-center py-2 small ${isActive ? "text-primary fw-semibold" : "text-secondary"}`}>
          <i className="bi bi-arrow-repeat d-block fs-5" />
          Sync
          {failed > 0 && <span className="badge bg-danger rounded-pill ms-1">{failed}</span>}
        </NavLink>
      </nav>
      <div className="text-center py-1 border-top">
        <button className="btn btn-link btn-sm text-muted" onClick={signOut}>
          {profile?.full_name ?? "Signed in"} · Sign out
        </button>
      </div>
    </div>
  );
}
