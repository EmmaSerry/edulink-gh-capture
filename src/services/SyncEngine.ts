/**
 * Drains the outbox against the real Supabase RPCs - the piece that
 * turns "captured while offline" into "actually on the server," the
 * moment a connection is available.
 *
 * Runs the queue in the order items were captured (createdAt), which is
 * what makes the studentClientId dependency below safe: a score/rating
 * captured for a student registered moments earlier in the same offline
 * session is always queued AFTER that registration, so its dependency
 * is always resolved by the time the queue reaches it - either earlier
 * in this same pass (resolvedInThisPass), or in a previous pass, in
 * which case the registration's own success handler already rewrote
 * every dependent entry in place to carry the real student id instead
 * of a clientId (see the "backfill" step below) - so a dependency can
 * never point at an entry that no longer exists.
 *
 * Never retried automatically in a tight loop and never silently
 * dropped: a failed item is left as FAILED with its exact error message
 * attached, visible on the Sync status screen, and is retried the next
 * time run() is called (reconnect, app open, or the manual "Sync now"
 * button) - not before.
 */
import { rest } from "@/lib/supabaseClient";
import {
  captureDb,
  type OutboxEntry,
  type RegisterStudentPayload,
  type UpsertScorePayload,
  type UpsertSkillRatingPayload,
  type UpsertReportFieldsPayload,
  type RecordPaymentPayload,
} from "@/lib/offlineDb";
import type {
  StudentRow,
  AssessmentSessionRow,
  ScoreRecordRow,
  SkillAssessmentRecordRow,
  ReportRecordRow,
  FeePaymentRow,
} from "@/types/database";

type Listener = () => void;
const listeners = new Set<Listener>();
let syncing = false;

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function onSyncChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function resolveSessionId(classId: string, termId: string): Promise<string> {
  const cacheKey = `${classId}:${termId}`;
  const cached = await captureDb.sessions.get(cacheKey);
  if (cached) return cached.id;
  const session = await rest.rpc<AssessmentSessionRow>("get_or_create_assessment_session", {
    p_class_id: classId,
    p_term_id: termId,
  });
  await captureDb.sessions.put({ ...session, cacheKey });
  return session.id;
}

/** After a registration syncs, rewrites every other still-pending/failed
 *  outbox entry that depended on it (by studentClientId) to carry the
 *  real server id instead - so they no longer depend on anything and
 *  can sync on their own from this point on, this pass or a later one. */
async function backfillDependents(registrationClientId: string, realStudentId: string): Promise<void> {
  const all = await captureDb.outbox.where("status").anyOf(["PENDING", "FAILED"]).toArray();
  for (const entry of all) {
    // RECORD_PAYMENT never depends on a pending registration (see
    // RecordPaymentPayload) - excluded here rather than just relying on
    // the type cast below, since its payload shape doesn't carry a
    // studentClientId field at all.
    if (entry.type === "REGISTER_STUDENT" || entry.type === "RECORD_PAYMENT") continue;
    const payload = entry.payload as UpsertScorePayload | UpsertSkillRatingPayload | UpsertReportFieldsPayload;
    if (payload.studentClientId !== registrationClientId) continue;
    await captureDb.outbox.update(entry.clientId, {
      payload: { ...payload, studentId: realStudentId, studentClientId: undefined },
      status: "PENDING",
      error: null,
    });
  }
}

export const SyncEngine = {
  isSyncing(): boolean {
    return syncing;
  },

  async run(): Promise<void> {
    if (syncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncing = true;
    notify();

    // Resolved-this-pass, for a dependency whose registration is
    // earlier in THIS SAME run (the common case: register a student,
    // then immediately mark their scores, all before the next sync).
    const resolvedThisPass = new Map<string, string>();

    try {
      const pending = await captureDb.outbox.where("status").anyOf(["PENDING", "FAILED"]).sortBy("createdAt");
      for (const entry of pending) {
        await captureDb.outbox.update(entry.clientId, { status: "SYNCING", error: null });
        notify();
        try {
          await syncOne(entry, resolvedThisPass);
        } catch (err) {
          await captureDb.outbox.update(entry.clientId, {
            status: "FAILED",
            error: err instanceof Error ? err.message : "Could not sync this item.",
          });
        }
        notify();
      }
    } finally {
      syncing = false;
      notify();
    }
  },
};

async function syncOne(entry: OutboxEntry, resolvedThisPass: Map<string, string>): Promise<void> {
  if (entry.type === "REGISTER_STUDENT") {
    const p = entry.payload as RegisterStudentPayload;
    const student = await rest.rpc<StudentRow>("register_student", {
      p_school_id: p.schoolId,
      p_first_name: p.firstName,
      p_last_name: p.lastName,
      p_gender: p.gender,
      p_date_of_birth: p.dateOfBirth,
      p_academic_year_id: p.academicYearId,
      p_term_id: p.termId,
      p_level_id: p.levelId,
      p_class_id: p.classId,
      p_guardian_name: p.guardianFullName,
      p_guardian_relationship: p.guardianRelationship,
      p_guardian_phone: p.guardianPhone,
    });
    resolvedThisPass.set(entry.clientId, student.id);

    // The photo rides along in the same outbox entry but is saved as a
    // separate request after registration succeeds (register_student()
    // has no photo parameter) - and deliberately swallowed on failure
    // rather than thrown: the registration already succeeded and must
    // not be retried (retrying would call register_student() again and
    // create a second, duplicate student). A missing photo is a much
    // smaller problem than a duplicate learner record.
    let photoWarning: string | null = null;
    if (p.photoDataUrl) {
      try {
        await rest.update("students", { id: `eq.${student.id}` }, { photo_url: p.photoDataUrl });
        student.photo_url = p.photoDataUrl;
      } catch (photoErr) {
        photoWarning = photoErr instanceof Error ? photoErr.message : "Could not save the photo.";
      }
    }

    await captureDb.students.put(student);
    await captureDb.outbox.update(entry.clientId, {
      status: "SYNCED",
      syncedAt: new Date().toISOString(),
      resultLabel: photoWarning ? `${student.student_id} (photo not saved: ${photoWarning})` : student.student_id,
    });
    await backfillDependents(entry.clientId, student.id);
    return;
  }

  if (entry.type === "UPSERT_SCORE") {
    const p = entry.payload as UpsertScorePayload;
    const studentId = p.studentId ?? (p.studentClientId ? resolvedThisPass.get(p.studentClientId) : undefined);
    if (!studentId) {
      throw new Error("Waiting on this student's registration to sync first - will retry automatically.");
    }
    const sessionId = await resolveSessionId(p.classId, p.termId);
    const column = p.field === "sbaScore" ? "sba_score" : "exam_score";
    const rec = await rest.rpc<ScoreRecordRow>("upsert_score", {
      p_student_id: studentId,
      p_term_id: p.termId,
      p_subject_id: p.subjectId,
      p_field: column,
      p_value: p.value,
      p_session_id: sessionId,
    });
    await captureDb.scoreRecords.put(rec);
    await captureDb.outbox.update(entry.clientId, {
      status: "SYNCED",
      syncedAt: new Date().toISOString(),
      resultLabel: null,
    });
    return;
  }

  if (entry.type === "UPSERT_SKILL_RATING") {
    const p = entry.payload as UpsertSkillRatingPayload;
    const studentId = p.studentId ?? (p.studentClientId ? resolvedThisPass.get(p.studentClientId) : undefined);
    if (!studentId) {
      throw new Error("Waiting on this student's registration to sync first - will retry automatically.");
    }
    const sessionId = await resolveSessionId(p.classId, p.termId);
    const rec = await rest.rpc<SkillAssessmentRecordRow>("upsert_skill_rating", {
      p_student_id: studentId,
      p_term_id: p.termId,
      p_skill_id: p.skillId,
      p_rating: p.rating,
      p_comment: p.comment,
      p_session_id: sessionId,
    });
    await captureDb.skillRatings.put(rec);
    await captureDb.outbox.update(entry.clientId, {
      status: "SYNCED",
      syncedAt: new Date().toISOString(),
      resultLabel: null,
    });
    return;
  }

  if (entry.type === "UPSERT_REPORT_FIELDS") {
    // Attendance + remarks, same upsert_report_fields() RPC the cloud
    // app's Remarks & attendance screen calls, so a partial `changes`
    // object here behaves identically once synced.
    const p = entry.payload as UpsertReportFieldsPayload;
    const studentId = p.studentId ?? (p.studentClientId ? resolvedThisPass.get(p.studentClientId) : undefined);
    if (!studentId) {
      throw new Error("Waiting on this student's registration to sync first - will retry automatically.");
    }
    const sessionId = await resolveSessionId(p.classId, p.termId);
    const rec = await rest.rpc<ReportRecordRow>("upsert_report_fields", {
      p_student_id: studentId,
      p_term_id: p.termId,
      p_changes: p.changes,
      p_session_id: sessionId,
    });
    await captureDb.reportRecords.put(rec);
    await captureDb.outbox.update(entry.clientId, {
      status: "SYNCED",
      syncedAt: new Date().toISOString(),
      resultLabel: null,
    });
    return;
  }

  // RECORD_PAYMENT - references an already-generated student_fees row
  // (see RecordPaymentPayload), so there is no student-registration
  // dependency to resolve here, unlike every other action above.
  const p = entry.payload as RecordPaymentPayload;
  const payment = await rest.rpc<FeePaymentRow>("record_payment", {
    p_student_fee_id: p.studentFeeId,
    p_amount: p.amount,
    p_method: p.method,
    p_reference: p.reference ?? null,
    p_notes: p.notes ?? null,
  });
  await captureDb.feePayments.put(payment);
  await captureDb.outbox.update(entry.clientId, {
    status: "SYNCED",
    syncedAt: new Date().toISOString(),
    resultLabel: null,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void SyncEngine.run();
  });
}
