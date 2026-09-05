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

export const CaptureService = {
  async registerStudent(payload: RegisterStudentPayload): Promise<string> {
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
