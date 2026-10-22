/**
 * Pure helpers for offline Mock marks entry (no database, no network), so they can be tested on their own.
 * A "cell" is one learner in one subject. Typing in a cell creates a pending change for that cell only.
 */
import type { MockMark } from "./mockEngine";

export interface PendingChange {
  /** `${candidateId}|${subjectId}` */
  key: string;
  mockId: string;
  candidateId: string;
  subjectId: string;
  /** What the teacher typed: a number, "A" (absent) or "" (clear). */
  text: string;
  /** Changes every time the cell is edited, so a sync never deletes an edit made while it was sending. */
  version: number;
}

export interface MarkEntryPayload {
  candidateId: string;
  subjectId: string;
  mark?: number | null;
  absent?: boolean;
  clear?: boolean;
}

export const cellKey = (candidateId: string, subjectId: string) => `${candidateId}|${subjectId}`;

/** Returns "" when the text is acceptable, otherwise a short message for the teacher. */
export function validateCellText(text: string, max: number, allowDecimals: boolean): string {
  const t = text.trim();
  if (t === "" || /^a(bs(ent)?)?$/i.test(t)) return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "Not a number";
  if (n < 0 || n > max) return `0 to ${max}`;
  if (!allowDecimals && !Number.isInteger(n)) return "Whole numbers only";
  return "";
}

export function toEntry(candidateId: string, subjectId: string, text: string): MarkEntryPayload {
  const t = text.trim();
  if (t === "") return { candidateId, subjectId, clear: true };
  if (/^a(bs(ent)?)?$/i.test(t)) return { candidateId, subjectId, absent: true };
  return { candidateId, subjectId, mark: Number(t) };
}

/** The text a cell shows: the pending change if there is one, otherwise what the server last gave us. */
export function displayText(candidateId: string, subjectId: string, stored: MockMark[], pending: Map<string, PendingChange>): string {
  const p = pending.get(cellKey(candidateId, subjectId));
  if (p) return p.text;
  const m = stored.find((x) => x.candidateId === candidateId && x.subjectId === subjectId);
  if (!m) return "";
  return m.status === "absent" ? "A" : String(m.mark);
}

/** What the server already holds for a cell, as text, so an edit back to the same value is not queued. */
export function storedText(candidateId: string, subjectId: string, stored: MockMark[]): string {
  const m = stored.find((x) => x.candidateId === candidateId && x.subjectId === subjectId);
  if (!m) return "";
  return m.status === "absent" ? "A" : String(m.mark);
}

/** Next version number for a cell edit. */
export const nextVersion = (existing: PendingChange | undefined) => (existing ? existing.version + 1 : 1);

/** Group a list of pending changes into one batch per mock, ready for mock_save_marks. */
export function batchByMock(changes: PendingChange[]): Map<string, PendingChange[]> {
  const out = new Map<string, PendingChange[]>();
  for (const c of changes) {
    const list = out.get(c.mockId) ?? [];
    list.push(c);
    out.set(c.mockId, list);
  }
  return out;
}

/** After a successful send: keep only changes edited since the batch was taken. */
export function remainingAfterSend(current: PendingChange[], sent: PendingChange[]): PendingChange[] {
  const sentVersion = new Map(sent.map((s) => [s.key, s.version]));
  return current.filter((c) => !sentVersion.has(c.key) || (sentVersion.get(c.key) ?? 0) < c.version);
}
