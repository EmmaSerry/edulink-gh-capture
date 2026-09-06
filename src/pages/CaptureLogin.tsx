import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function CaptureLogin() {
  const { session, signIn } = useCaptureAuth();
  const online = useOnlineStatus();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 p-4">
      <div className="w-100" style={{ maxWidth: 380 }}>
        <div className="text-center mb-4">
          <h1 className="h4 mb-1">EduLink GH Capture</h1>
          <p className="text-muted small mb-0">Offline data capture for schools with no signal</p>
        </div>

        {!online && (
          <div className="alert alert-warning small py-2" role="alert">
            No connection right now. Signing in for the first time on this phone needs one - once you've signed in
            here at least once, you can reopen and keep working offline after that.
          </div>
        )}

        {error && (
          <div className="alert alert-danger small py-2" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="actrs-card p-4">
          <div className="mb-3">
            <label className="form-label small">Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label small">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
