/**
 * Session/profile context for the Capture app - the offline-aware
 * counterpart of the cloud app's CloudAuthContext.
 *
 * The one real difference: the profile (which carries school_id - every
 * capture action needs it) is also cached in captureDb, not just held
 * in memory. auth.getValidSession() already tolerates being offline (it
 * falls back to the last stored session rather than throwing - see
 * supabaseClient.ts), but the profile fetch is a plain REST call that
 * WILL throw with no network. Reading the cached copy first, then
 * quietly refreshing it in the background if a fetch does succeed,
 * means reopening the app at a no-signal school still lands on a usable
 * Dashboard instead of a spinner or an error screen.
 *
 * Signing in for the very first time still requires a connection - a
 * genuinely brand-new session can't be conjured up offline, only a
 * previously-established one can be reused. The Login screen explains
 * this rather than leaving it a silent trap.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, rest, type AuthSession } from "@/lib/supabaseClient";
import { getCachedProfile, setCachedProfile } from "@/lib/offlineDb";
import { LookupSyncService } from "@/services/LookupSyncService";
import type { UserProfileRow } from "@/types/database";

interface CaptureAuthContextValue {
  session: AuthSession | null;
  profile: UserProfileRow | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const CaptureAuthContext = createContext<CaptureAuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfileRow | null> {
  const rows = await rest.select<UserProfileRow>("user_profiles", { filters: { id: `eq.${userId}` }, limit: 1 });
  return rows[0] ?? null;
}

export function CaptureAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await auth.getValidSession();
      if (cancelled) return;
      if (!existing) {
        setLoading(false);
        return;
      }
      setSession(existing);

      const cached = await getCachedProfile();
      if (!cancelled && cached) setProfile(cached);

      try {
        const fresh = await fetchProfile(existing.user.id);
        if (!cancelled && fresh) {
          setProfile(fresh);
          await setCachedProfile(fresh);
        }
      } catch {
        // Offline (or the request otherwise failed) - the cached profile
        // set above, if any, is what the rest of the app uses.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const newSession = await auth.signInWithPassword(email, password);
      setSession(newSession);
      const p = await fetchProfile(newSession.user.id);
      setProfile(p);
      await setCachedProfile(p);
      // Prime the offline cache immediately after a fresh sign-in, so
      // the app is genuinely usable the instant the connection drops -
      // not just "logged in" with nothing to show on any screen yet.
      // Best-effort: a slow/flaky connection here shouldn't block
      // getting into the app.
      void LookupSyncService.syncAll().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      throw err;
    }
  }, []);

  const signOut = useCallback(() => {
    auth.signOut();
    setSession(null);
    setProfile(null);
    void setCachedProfile(null);
  }, []);

  return (
    <CaptureAuthContext.Provider value={{ session, profile, loading, error, signIn, signOut }}>
      {children}
    </CaptureAuthContext.Provider>
  );
}

export function useCaptureAuth(): CaptureAuthContextValue {
  const ctx = useContext(CaptureAuthContext);
  if (!ctx) throw new Error("useCaptureAuth must be used within a CaptureAuthProvider");
  return ctx;
}
