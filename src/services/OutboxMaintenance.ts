/**
 * Keeps the on-phone "sync history" tidy.
 *
 *  - pruneOldHistory(): every time the app opens, entries that finished
 *    syncing more than 3 days ago are removed. Anything still waiting
 *    (PENDING / SYNCING) or failed is never touched.
 *  - purgeTestHistoryOnce(): a ONE-TIME clean-out the first time this
 *    version runs on a phone, removing the synced and failed entries left
 *    over from the build-up / testing period. Pending items are kept.
 *  - clearCompletedHistory() / clearFailed(): the buttons on the Sync screen.
 *  - resetThisPhone(): wipes everything stored on this phone (all cached
 *    data, the history AND anything not yet synced) and signs out.
 */
import { captureDb } from "@/lib/offlineDb";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const PURGE_MARKER = "historyPurgedV1";

export async function pruneOldHistory(): Promise<void> {
  const cutoff = Date.now() - THREE_DAYS_MS;
  const old = await captureDb.outbox
    .filter((e) => e.status === "SYNCED" && new Date(e.syncedAt ?? e.createdAt).getTime() < cutoff)
    .primaryKeys();
  if (old.length > 0) await captureDb.outbox.bulkDelete(old);
}

export async function purgeTestHistoryOnce(): Promise<void> {
  const done = await captureDb.meta.get(PURGE_MARKER);
  if (done) return;
  const stale = await captureDb.outbox.filter((e) => e.status === "SYNCED" || e.status === "FAILED").primaryKeys();
  if (stale.length > 0) await captureDb.outbox.bulkDelete(stale);
  await captureDb.meta.put({ key: PURGE_MARKER, value: new Date().toISOString() });
}

export async function runOutboxMaintenance(): Promise<void> {
  try {
    await purgeTestHistoryOnce();
    await pruneOldHistory();
  } catch {
    /* housekeeping only - never get in the way of using the app */
  }
}

export async function clearCompletedHistory(): Promise<number> {
  const keys = await captureDb.outbox.filter((e) => e.status === "SYNCED").primaryKeys();
  await captureDb.outbox.bulkDelete(keys);
  return keys.length;
}

export async function clearFailed(): Promise<number> {
  const keys = await captureDb.outbox.filter((e) => e.status === "FAILED").primaryKeys();
  await captureDb.outbox.bulkDelete(keys);
  return keys.length;
}

/** Deletes every local table, the saved sign-in and any leftover browser storage. */
export async function resetThisPhone(): Promise<void> {
  try {
    await captureDb.delete();
  } catch {
    /* if it is already gone, carry on */
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  if ("caches" in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
      /* ignore */
    }
  }
  window.location.href = "/login";
}
