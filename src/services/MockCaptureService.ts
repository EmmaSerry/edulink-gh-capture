/**
 * Offline Mock marks entry for the Capture app.
 *
 * Keeps its own small on-phone database (separate from the main Capture one, so nothing existing is touched):
 *  - "mocks": the last copy downloaded from the server of each mock that is open for entry
 *  - "pending": marks typed on this phone that have not reached the server yet
 * Sending uses the same server function as the web app (mock_save_marks), so all security checks, grading and
 * the audit trail are the server's. A send is all-or-nothing per mock.
 */
import Dexie, { type Table } from "dexie";
import { rest } from "@/lib/supabaseClient";
import { batchByMock, nextVersion, remainingAfterSend, toEntry, cellKey, type PendingChange } from "@/mock/mockCaptureLogic";
import type { GradingConfig, MockCandidate, MockMark, MockSubject } from "@/mock/mockEngine";

export interface CachedMock {
  id: string;
  name: string;
  schoolName: string;
  academicYearLabel: string;
  status: string;
  grading: GradingConfig;
  subjects: MockSubject[];
  candidates: MockCandidate[];
  marks: MockMark[];
  canWrite: boolean;
  fetchedAt: string;
}

interface MockListRow {
  id: string;
  status: string;
}

interface MockFullPayload {
  mock: { id: string; name: string; schoolName: string; academicYearLabel: string; status: string; grading: GradingConfig };
  canWrite: boolean;
  subjects: MockSubject[];
  candidates: MockCandidate[];
  marks: MockMark[];
}

class MockCaptureDb extends Dexie {
  mocks!: Table<CachedMock, string>;
  pending!: Table<PendingChange, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super("edulink-capture-mock-db");
    this.version(1).stores({ mocks: "id", pending: "key, mockId", meta: "&key" });
  }
}

const db = new MockCaptureDb();

type Listener = () => void;
const listeners = new Set<Listener>();
let sending = false;
const notify = () => listeners.forEach((l) => l());

export function onMockChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Browsers report any network failure as "Failed to fetch"; say what it means in plain words. */
export function friendlyError(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : "";
  if (!m) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return "Could not reach the server. Check the internet connection and try again. Marks already typed are safe on this phone.";
  }
  return m;
}

export interface MockSendResult {
  sent: number;
  failed: Array<{ mockName: string; message: string }>;
}

export const MockCaptureService = {
  isSending: () => sending,

  listCached: () => db.mocks.toArray(),
  getCached: (id: string) => db.mocks.get(id),
  pendingAll: () => db.pending.toArray(),
  pendingFor: (mockId: string) => db.pending.where("mockId").equals(mockId).toArray(),
  pendingCount: () => db.pending.count(),

  async lastDownloadAt(): Promise<string | null> {
    const row = await db.meta.get("lastDownloadAt");
    return (row?.value as string | undefined) ?? null;
  },

  /** Online: copy every mock that is open for entry onto this phone. Pending (unsent) marks are never touched. */
  async download(): Promise<number> {
    const list = await rest.rpc<MockListRow[]>("mock_list", { p_academic_year_id: null });
    const open = list.filter((m) => m.status === "open");
    const keep = new Set<string>();
    for (const m of open) {
      const full = await rest.rpc<MockFullPayload>("mock_get_full", { p_mock_id: m.id });
      if (!full.canWrite) continue;
      keep.add(m.id);
      await db.mocks.put({
        id: full.mock.id,
        name: full.mock.name,
        schoolName: full.mock.schoolName,
        academicYearLabel: full.mock.academicYearLabel,
        status: full.mock.status,
        grading: full.mock.grading,
        subjects: full.subjects,
        candidates: full.candidates,
        marks: full.marks,
        canWrite: full.canWrite,
        fetchedAt: new Date().toISOString(),
      });
    }
    // Forget mocks that are no longer open, unless marks are still waiting to be sent for them.
    for (const c of await db.mocks.toArray()) {
      if (keep.has(c.id)) continue;
      const waiting = await db.pending.where("mockId").equals(c.id).count();
      if (waiting === 0) await db.mocks.delete(c.id);
    }
    await db.meta.put({ key: "lastDownloadAt", value: new Date().toISOString() });
    notify();
    return keep.size;
  },

  /** Save one cell on the phone straight away. An empty edit equal to what the server holds removes the pending change. */
  async setCell(mockId: string, candidateId: string, subjectId: string, text: string, serverText: string): Promise<void> {
    const key = cellKey(candidateId, subjectId);
    const existing = await db.pending.get(key);
    if (text.trim().toLowerCase() === serverText.trim().toLowerCase()) {
      if (existing) await db.pending.delete(key);
    } else {
      await db.pending.put({ key, mockId, candidateId, subjectId, text, version: nextVersion(existing) });
    }
    notify();
  },

  async discardPending(mockId: string): Promise<void> {
    await db.pending.where("mockId").equals(mockId).delete();
    notify();
  },

  /** Online: send every waiting change, one all-or-nothing batch per mock, then refresh that mock's copy. */
  async send(): Promise<MockSendResult> {
    const result: MockSendResult = { sent: 0, failed: [] };
    if (sending) return result;
    if (typeof navigator !== "undefined" && !navigator.onLine) return result;
    sending = true;
    notify();
    try {
      const batches = batchByMock(await db.pending.toArray());
      for (const [mockId, changes] of batches) {
        const cached = await db.mocks.get(mockId);
        const name = cached?.name ?? "Mock";
        try {
          const entries = changes.map((c) => toEntry(c.candidateId, c.subjectId, c.text));
          await rest.rpc<{ saved: number }>("mock_save_marks", { p_mock_id: mockId, p_entries: entries, p_reason: null });
          const now = await db.pending.where("mockId").equals(mockId).toArray();
          const keepers = remainingAfterSend(now, changes);
          const keepKeys = new Set(keepers.map((k) => k.key));
          await db.pending.bulkDelete(now.filter((n) => !keepKeys.has(n.key)).map((n) => n.key));
          result.sent += changes.length;
          try {
            const full = await rest.rpc<MockFullPayload>("mock_get_full", { p_mock_id: mockId });
            if (cached) await db.mocks.put({ ...cached, marks: full.marks, candidates: full.candidates, status: full.mock.status, fetchedAt: new Date().toISOString() });
          } catch {
            /* the marks are saved; the copy on the phone refreshes at the next download */
          }
        } catch (e) {
          result.failed.push({ mockName: name, message: friendlyError(e, "Could not send these marks.") });
        }
        notify();
      }
    } finally {
      sending = false;
      notify();
    }
    return result;
  },
};

/** Send waiting marks whenever the phone comes back online. Call once when the app starts. */
export function startMockSync(): void {
  if (typeof window === "undefined") return;
  // Ask the browser not to clear the saved mocks and marks when the phone runs low on space.
  void navigator.storage?.persist?.();
  window.addEventListener("online", () => {
    void MockCaptureService.send();
  });
  void MockCaptureService.send();
}
