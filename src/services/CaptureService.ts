/**
 * The only way any screen writes data in this app - every capture
 * action becomes one outbox row and returns immediately, whether or not
 * a connection exists right now. SyncEngine (fired-and-forgotten right
 * after enqueueing, so it sends immediately when there IS a connection)
 * is solely responsible for actually reaching the server.
 */
import { captureDb, type RegisterStudentPayload, type UpsertScorePayload, type UpsertSkillRatingPayload } from "@/lib/offlineDb";
import { SyncEngine } from "@/services/SyncEngine";

function newClientId(): string {
  return crypto.randomUUID();
}

function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Works offline: looks for the same learner among the learners already on this
 *  phone (this school) and registrations waiting to be sent, and asks the
 *  teacher to confirm if one looks the same. */
async function findLocalDuplicates(p: RegisterStudentPayload): Promise<string[]> {
  const first = norm(p.firstName);
  const last = norm(p.lastName);
  const lines: string[] = [];
  const same = (f: string, l: string) => (f === first && l === last) || (f === last && l === first);

  const students = await captureDb.students.toArray();
  const enrolls = await captureDb.enrollments.filter((e) => !!e.is_current).toArray();
  const classOf = new Map(enrolls.map((e) => [e.student_id, e.class_id]));
  for (const s of students) {
    if (s.school_id !== p.schoolId) continue;
    const sameDob = s.date_of_birth === p.dateOfBirth;
    const nameMatch = same(norm(s.first_name), norm(s.last_name));
    const partMatch =
      [norm(s.first_name), norm(s.last_name)].some((x) => x === first || x === last);
    let kind: string | null = null;
    if (nameMatch && sameDob) kind = "Same name and date of birth";
    else if (sameDob && partMatch) kind = "Same date of birth and a similar name";
    else if (nameMatch) kind = "Same name, different date of birth";
    if (!kind) continue;
    const inClass = classOf.get(s.id) === p.classId;
    const status = s.status !== "ACTIVE" ? ` (${s.status.toLowerCase().replace("_", " ")})` : "";
    lines.push(`${s.first_name} ${s.last_name}${status} - ${kind}${inClass ? " in this class" : " in this school"}`);
    if (lines.length >= 6) break;
  }

  const pending = await captureDb.outbox.where("type").equals("REGISTER_STUDENT").toArray();
  for (const o of pending) {
    if (o.status === "SYNCED" || o.status === "FAILED") continue;
    const q = o.payload as RegisterStudentPayload;
    if (same(norm(q.firstName), norm(q.lastName)) && q.dateOfBirth === p.dateOfBirth) {
      lines.push(`${q.firstName} ${q.lastName} - already registered on this phone and waiting to be sent`);
    }
  }
  return lines;
}

export const CaptureService = {
  async registerStudent(payload: RegisterStudentPayload): Promise<string> {
    const dups = await findLocalDuplicates(payload);
    if (
      dups.length > 0 &&
      !window.confirm(
        `This learner may already be registered:\n\n${dups.map((d) => `\u2022 ${d}`).join("\n")}\n\nPress OK to register anyway, or Cancel to go back and check.`
      )
    ) {
      throw new Error("Cancelled - nothing was saved.");
    }
    const clientId = newClientId();
    await captureDb.outbox.add({
      clientId,
      type: "REGISTER_STUDENT",
      payload,
      status: "PENDING",
      error: null,
      createdAt: new Date().toISOString(),
      syncedAt: null,
      resultLabel: null,
    });
    void SyncEngine.run();
    return clientId;
  },

  async upsertScore(payload: UpsertScorePayload): Promise<string> {
    const clientId = newClientId();
    await captureDb.outbox.add({
      clientId,
      type: "UPSERT_SCORE",
      payload,
      status: "PENDING",
      error: null,
      createdAt: new Date().toISOString(),
      syncedAt: null,
      resultLabel: null,
    });
    void SyncEngine.run();
    return clientId;
  },

  async upsertSkillRating(payload: UpsertSkillRatingPayload): Promise<string> {
    const clientId = newClientId();
    await captureDb.outbox.add({
      clientId,
      type: "UPSERT_SKILL_RATING",
      payload,
      status: "PENDING",
      error: null,
      createdAt: new Date().toISOString(),
      syncedAt: null,
      resultLabel: null,
    });
    void SyncEngine.run();
    return clientId;
  },
};
