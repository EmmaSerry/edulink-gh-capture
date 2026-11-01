/**
 * Archive or permanently remove a learner (class teachers, own class only;
 * enforced by remove_learner() in the database). Works offline: the learner
 * disappears from this phone straight away and the request is sent as soon as
 * there is a connection (and each time the app opens or a sync finishes).
 *
 * Own small on-phone database, like LearnerEditService, so it never touches
 * the main capture database or its sync engine.
 */
import Dexie, { type Table } from "dexie";
import { rest } from "@/lib/supabaseClient";
import { captureDb } from "@/lib/offlineDb";
import { onSyncChange } from "@/services/SyncEngine";
import type { StudentRow } from "@/types/database";

export type RemoveMode = "archive" | "delete";

export interface RemoveEntry {
  id: string;
  studentId: string;
  studentLabel: string;
  mode: RemoveMode;
  reason: string | null;
  status: "PENDING" | "SYNCING" | "FAILED";
  error: string | null;
  createdAt: string;
  /** Copy of the learner, so a rejected request can put them back on this phone. */
  snapshot: StudentRow;
}

class RemoveDb extends Dexie {
  removals!: Table<RemoveEntry, string>;
  constructor() {
    super("edulink-capture-removals");
    this.version(1).stores({ removals: "id, studentId, status, createdAt" });
  }
}

const db = new RemoveDb();
const listeners = new Set<() => void>();
let running = false;

function notify() {
  listeners.forEach((cb) => cb());
}

export function onRemovalsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function listPendingRemovals(): Promise<RemoveEntry[]> {
  return db.removals.orderBy("createdAt").toArray();
}

export async function queueRemoval(student: StudentRow, mode: RemoveMode, reason: string | null): Promise<void> {
  await db.removals.add({
    id: crypto.randomUUID(),
    studentId: student.id,
    studentLabel: `${student.first_name} ${student.last_name}`.trim(),
    mode,
    reason: reason?.trim() || null,
    status: "PENDING",
    error: null,
    createdAt: new Date().toISOString(),
    snapshot: student,
  });
  // Take the learner off this phone straight away.
  await hideLocally(student.id);
  notify();
  void runRemovalSync();
}

async function hideLocally(studentId: string): Promise<void> {
  await captureDb.students.delete(studentId);
  await captureDb.enrollments.where("student_id").equals(studentId).delete();
}

/** Rejected request: forget it and bring the learner back on this phone. */
export async function discardRemoval(id: string): Promise<void> {
  const e = await db.removals.get(id);
  if (e) {
    await captureDb.students.put(e.snapshot);
  }
  await db.removals.delete(id);
  notify();
}

export async function runRemovalSync(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  running = true;
  try {
    const entries = await db.removals.where("status").anyOf(["PENDING", "FAILED"]).sortBy("createdAt");
    for (const e of entries) {
      await db.removals.update(e.id, { status: "SYNCING", error: null });
      notify();
      try {
        await rest.rpc<void>("remove_learner", {
          p_student_id: e.studentId,
          p_mode: e.mode,
          p_reason: e.reason,
        });
        await db.removals.delete(e.id);
      } catch (err) {
        await db.removals.update(e.id, {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Could not send this request.",
        });
      }
      notify();
    }
  } finally {
    running = false;
    notify();
  }
}

let started = false;
/** Call once when the app starts. */
export function startLearnerRemoveSync(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", () => void runRemovalSync());
  onSyncChange(() => void runRemovalSync());
  void runRemovalSync();
}
