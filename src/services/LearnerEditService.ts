/**
 * Edits to learners that are already registered. Works offline: an edit is
 * saved on the phone straight away and sent to the server as soon as there
 * is a connection (and again each time the app opens or a sync finishes).
 *
 * Kept in its own small on-phone database so it never touches the main
 * capture database or its sync engine.
 */
import Dexie, { type Table } from "dexie";
import { rest } from "@/lib/supabaseClient";
import { captureDb } from "@/lib/offlineDb";
import { onSyncChange } from "@/services/SyncEngine";
import type { GuardianRow, StudentRow } from "@/types/database";

export interface GuardianEdit {
  full_name: string;
  relationship: string | null;
  phone: string;
  alternative_phone: string | null;
  email: string | null;
  residential_address: string | null;
  sms_opt_in: boolean;
}

export interface EditEntry {
  id: string;
  studentId: string;
  schoolId: string;
  studentLabel: string;
  changes: Record<string, unknown>;
  guardian: GuardianEdit | null;
  status: "PENDING" | "SYNCING" | "FAILED";
  error: string | null;
  createdAt: string;
}

class EditsDb extends Dexie {
  edits!: Table<EditEntry, string>;
  constructor() {
    super("edulink-capture-edits");
    this.version(1).stores({ edits: "id, studentId, status, createdAt" });
  }
}

const db = new EditsDb();
const listeners = new Set<() => void>();
let running = false;

function notify() {
  listeners.forEach((cb) => cb());
}

export function onEditsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function listPendingEdits(): Promise<EditEntry[]> {
  return db.edits.orderBy("createdAt").toArray();
}

export async function getPendingEditFor(studentId: string): Promise<EditEntry | undefined> {
  const rows = await db.edits.where("studentId").equals(studentId).sortBy("createdAt");
  return rows[rows.length - 1];
}

export async function getGuardianCached(studentId: string): Promise<GuardianEdit | null> {
  const row = await captureDb.meta.get(`guardian:${studentId}`);
  return (row?.value as GuardianEdit | undefined) ?? null;
}

async function cacheGuardian(studentId: string, g: GuardianEdit): Promise<void> {
  await captureDb.meta.put({ key: `guardian:${studentId}`, value: g });
}

/** Latest guardian details: from the server when online (and remembered for
 *  offline use), otherwise whatever was remembered last. */
export async function loadGuardian(studentId: string): Promise<GuardianEdit | null> {
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const rows = await rest.select<GuardianRow>("guardians", { filters: { student_id: `eq.${studentId}` }, limit: 1 });
      const g = rows[0];
      if (g) {
        const edit: GuardianEdit = {
          full_name: g.full_name,
          relationship: g.relationship,
          phone: g.phone,
          alternative_phone: g.alternative_phone,
          email: g.email,
          residential_address: g.residential_address,
          sms_opt_in: g.sms_opt_in,
        };
        await cacheGuardian(studentId, edit);
        return edit;
      }
    } catch {
      /* fall back to the remembered copy */
    }
  }
  return getGuardianCached(studentId);
}

export async function saveLearnerEdit(input: {
  student: StudentRow;
  changes: Record<string, unknown>;
  guardian: GuardianEdit | null;
}): Promise<void> {
  const { student, changes, guardian } = input;
  await db.edits.add({
    id: crypto.randomUUID(),
    studentId: student.id,
    schoolId: student.school_id,
    studentLabel: `${student.first_name} ${student.last_name}`.trim(),
    changes,
    guardian,
    status: "PENDING",
    error: null,
    createdAt: new Date().toISOString(),
  });
  // Show the change on this phone straight away.
  if (Object.keys(changes).length > 0) await captureDb.students.update(student.id, changes as Partial<StudentRow>);
  if (guardian) await cacheGuardian(student.id, guardian);
  notify();
  void runLearnerEditSync();
}

export async function discardEdit(id: string): Promise<void> {
  await db.edits.delete(id);
  notify();
}

export async function runLearnerEditSync(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  running = true;
  try {
    const entries = await db.edits.where("status").anyOf(["PENDING", "FAILED"]).sortBy("createdAt");
    for (const e of entries) {
      await db.edits.update(e.id, { status: "SYNCING", error: null });
      notify();
      try {
        if (Object.keys(e.changes).length > 0) {
          const rows = await rest.update<StudentRow>("students", { id: `eq.${e.studentId}` }, e.changes as Partial<StudentRow>);
          if (!rows || rows.length === 0) {
            throw new Error("The server did not accept this change (learner not found or not in your class).");
          }
        }
        if (e.guardian) {
          const existing = await rest.select<GuardianRow>("guardians", {
            filters: { student_id: `eq.${e.studentId}` },
            limit: 1,
          });
          if (existing[0]) {
            await rest.update<GuardianRow>("guardians", { id: `eq.${existing[0].id}` }, { ...e.guardian });
          } else {
            await rest.insert<GuardianRow>("guardians", { ...e.guardian, student_id: e.studentId, school_id: e.schoolId });
          }
        }
        await db.edits.delete(e.id);
      } catch (err) {
        await db.edits.update(e.id, {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Could not send this change.",
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
export function startLearnerEditSync(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", () => void runLearnerEditSync());
  onSyncChange(() => void runLearnerEditSync());
  void runLearnerEditSync();
}
