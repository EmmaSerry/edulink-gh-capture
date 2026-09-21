import { useEffect, useState } from "react";
import { captureDb } from "@/lib/offlineDb";

/**
 * Offline counterpart of the cloud app's TrainingModeBanner - same
 * message, same trigger (the signed-in account's school has
 * is_training = true, see edulink_gh_phase1j_training_mode.sql), just
 * reading the flag from the local cache (captureDb.schools, already
 * synced down in full by LookupSyncService) instead of a live query,
 * since this app has to work with no connection. Renders nothing at
 * all for a real school.
 */
export function TrainingModeBanner() {
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    captureDb.schools
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        const school = rows[0] as (typeof rows)[number] & { is_training?: boolean } | undefined;
        setIsTraining(school?.is_training ?? false);
      })
      .catch(() => !cancelled && setIsTraining(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTraining) return null;

  return (
    <div
      className="text-center py-1 small fw-semibold"
      style={{ background: "#f2b705", color: "#141a2b", letterSpacing: "0.02em" }}
      role="status"
    >
      TRAINING MODE - not real, not counted anywhere.
    </div>
  );
}
