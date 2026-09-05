import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";

export function RequireCaptureAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useCaptureAuth();
  const location = useLocation();

  if (loading) return <p className="text-muted p-4">Loading…</p>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
