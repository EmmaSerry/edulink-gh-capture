/**
 * Offline daily attendance register for the Capture app.
 *
 * Own small on-phone database (separate from the main Capture one, so nothing existing is touched):
 *  - "days":    the last copy of a class's register for a date, downloaded from the server
 *  - "pending": registers saved on this phone that have not reached the server yet
 * Sending uses the same server function as the web app (save_class_attendance), so the security checks and the
 * update of each learner's report-card "days present" are the server's. One send is all-or-nothing per class+date.
 */
import Dexie, { type Table } from "dexie";
import { rest } from "@/lib/supabaseClient";

export type AttStatus = "present" | "absent" | "late" | "excused";

export interface AttMark {
  status: AttStatus | "";
  note: string;
}

export interface DayCache {
  key: string; // classId|date
  classId: string;
  date: string;
  marks: Record<string, AttMark>;
  fetchedAt: string;
}

export interface PendingRegister {
  key: string; // classId|date
  classId: string;
  termId: string;
  date: string;
  marks: Record<string, AttMark>;
  savedAt: string;
}

class AttendanceDb extends Dexie {
  days!: Table<DayCache, string>;
  pending!: Table<PendingRegister, string>;
  constructor() {
    super("edulink-capture-attendance-db");
    this.version(1).stores({ days: "key, classId", pending: "key, classId" });
  }
}

const db = new AttendanceDb();

type Listener = () => void;
const listeners = new Set<Listener>();
let sending = false;
const notify = () => listeners.forEach((l) => l());

export function onAttendanceChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const dayKey = (classId: string, date: string) => `${classId}|${date}`;

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function friendlyError(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : "";
  if (!m) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return "Could not reach the server. The register is safe on this phone and will be sent when you are online.";
  }
  return m;
}

interface ServerRow {
  student_id: string;
  status: AttStatus;
  note: string | null;
}

export interface SendResult {
  sent: number;
  failed: string[];
}

export const AttendanceCaptureService = {
  isSending: () => sending,
  pendingCount: () => db.pending.count(),
  pendingFor: (classId: string, date: string) => db.pending.get(dayKey(classId, date)),

  /** What to show for a class+date: unsent phone copy first, else the last downloaded copy. */
  async load(classId: string, date: string, online: boolean): Promise<{ marks: Record<string, AttMark>; unsent: boolean }> {
    const key = dayKey(classId, date);
    const pend = await db.pending.get(key);
    if (pend) return { marks: pend.marks, unsent: true };
    if (online) {
      try {
        const rows = await rest.select<ServerRow>("daily_attendance", {
          select: "student_id,status,note",
          filters: { class_id: `eq.${classId}`, attendance_date: `eq.${date}` },
        });
        const marks: Record<string, AttMark> = {};
        for (const r of rows) marks[r.student_id] = { status: r.status, note: r.note ?? "" };
        await db.days.put({ key, classId, date, marks, fetchedAt: new Date().toISOString() });
        return { marks, unsent: false };
      } catch {
        /* fall back to the copy on the phone */
      }
    }
    const cached = await db.days.get(key);
    return { marks: cached?.marks ?? {}, unsent: false };
  },

  /** Save on the phone straight away. Call send() afterwards to push it to the server. */
  async save(classId: string, termId: string, date: string, marks: Record<string, AttMark>): Promise<void> {
    const key = dayKey(classId, date);
    await db.pending.put({ key, classId, termId, date, marks, savedAt: new Date().toISOString() });
    notify();
  },

  async send(): Promise<SendResult> {
    const result: SendResult = { sent: 0, failed: [] };
    if (sending) return result;
    if (typeof navigator !== "undefined" && !navigator.onLine) return result;
    sending = true;
    notify();
    try {
      for (const p of await db.pending.toArray()) {
        try {
          const rows = Object.entries(p.marks).map(([student_id, m]) => ({ student_id, status: m.status, note: m.note }));
          await rest.rpc<number>("save_class_attendance", {
            p_class_id: p.classId,
            p_term_id: p.termId,
            p_date: p.date,
            p_rows: rows,
          });
          // Only drop it if the phone copy was not edited again while sending.
          const now = await db.pending.get(p.key);
          if (now && now.savedAt === p.savedAt) {
            await db.pending.delete(p.key);
            await db.days.put({ key: p.key, classId: p.classId, date: p.date, marks: p.marks, fetchedAt: new Date().toISOString() });
          }
          result.sent += 1;
        } catch (e) {
          result.failed.push(`${p.date}: ${friendlyError(e, "Could not send this register.")}`);
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

/** Send waiting registers whenever the phone comes back online. Call once when the app starts. */
export function startAttendanceSync(): void {
  if (typeof window === "undefined") return;
  void navigator.storage?.persist?.();
  window.addEventListener("online", () => {
    void AttendanceCaptureService.send();
  });
  void AttendanceCaptureService.send();
}
