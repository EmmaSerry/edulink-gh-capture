import { useEffect, useState } from "react";
import { captureDb, type OutboxEntry } from "@/lib/offlineDb";
import { SyncEngine, onSyncChange } from "@/services/SyncEngine";

export interface OutboxSummary {
  pending: number;
  failed: number;
  syncing: boolean;
  entries: OutboxEntry[];
}

/** Live view of the outbox, re-read every time SyncEngine notifies of a
 *  change - powers the pending-count badge in the top bar and the full
 *  Sync status screen without either of them polling. */
export function useOutboxStatus(): OutboxSummary {
  const [summary, setSummary] = useState<OutboxSummary>({ pending: 0, failed: 0, syncing: false, entries: [] });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const entries = await captureDb.outbox.orderBy("createdAt").reverse().toArray();
      if (cancelled) return;
      setSummary({
        pending: entries.filter((e) => e.status === "PENDING" || e.status === "SYNCING").length,
        failed: entries.filter((e) => e.status === "FAILED").length,
        syncing: SyncEngine.isSyncing(),
        entries,
      });
    }

    void refresh();
    const unsubscribe = onSyncChange(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return summary;
}
