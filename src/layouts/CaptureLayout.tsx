import { NavLink, Outlet } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { useThemeMode } from "@contexts/ThemeContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { SyncEngine } from "@/services/SyncEngine";
import {
  IconHome,
  IconPersonPlus,
  IconClipboardCheck,
  IconNotebook,
  IconSync,
  IconWifi,
  IconWifiOff,
  IconSun,
  IconMoon,
} from "@/components/CaptureIcons";

const NAV_ITEMS = [
  { to: "/", end: true, label: "Home", icon: IconHome },
  { to: "/register", end: false, label: "Register", icon: IconPersonPlus },
  { to: "/assessment", end: false, label: "Assessment", icon: IconClipboardCheck },
  { to: "/remarks", end: false, label: "Remarks", icon: IconNotebook },
  { to: "/sync", end: false, label: "Sync", icon: IconSync },
] as const;

/**
 * Phone-first app shell: a status strip up top (connection state +
 * pending sync count, tappable to force a sync attempt) and a bottom
 * tab bar for the three things a teacher actually does here - register
 * a student, enter assessment data, and check on sync.
 */
export function CaptureLayout() {
  const online = useOnlineStatus();
  const { pending, failed, syncing } = useOutboxStatus();
  const { profile, signOut } = useCaptureAuth();
  const { mode, toggle } = useThemeMode();

  return (
    <div className="capture-shell d-flex flex-column vh-100">
      <header
        className={`d-flex align-items-center justify-content-between px-3 py-2 text-white ${online ? "capture-status-online" : "capture-status-offline"}`}
        onClick={() => void SyncEngine.run()}
        role="button"
      >
        <span className="d-flex align-items-center gap-2 small fw-medium">
          {online ? <IconWifi size={16} /> : <IconWifiOff size={16} />}
          {online ? "Online" : "Offline"}
        </span>
        <span className="small">
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

      <div className="d-flex align-items-center justify-content-center gap-3 py-1 border-top capture-surface">
        <button className="btn btn-link btn-sm text-muted text-decoration-none" onClick={signOut}>
          {profile?.full_name ?? "Signed in"} · Sign out
        </button>
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={toggle}
          title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {mode === "light" ? <IconMoon size={18} /> : <IconSun size={18} />}
        </button>
      </div>
      <nav className="d-flex capture-surface border-top capture-tabbar">
        {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex-fill text-center py-2 text-decoration-none capture-tab ${isActive ? "capture-tab-active" : ""}`}
          >
            <Icon size={20} className="d-block mx-auto mb-1" />
            <span className="capture-tab-label">
              {label}
              {label === "Sync" && failed > 0 && <span className="badge bg-danger rounded-pill ms-1">{failed}</span>}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
