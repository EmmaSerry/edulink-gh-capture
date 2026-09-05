import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { captureDb, type OutboxEntry } from "@/lib/offlineDb";
import { CaptureService } from "@/services/CaptureService";
import { onSyncChange } from "@/services/SyncEngine";
import { IconCheckCircle, IconAlertTriangle, IconCloudUp } from "@/components/CaptureIcons";
import type { AcademicYearRow, TermRow, LevelRow, ClassRow } from "@/types/database";

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Other"];

/**
 * Same fields and flow as the cloud app's student registration screen,
 * reading its dropdown options from the local cache instead of a live
 * query, and handing off to CaptureService instead of calling
 * register_student directly - so this screen works identically whether
 * there's a connection right now or not. The one visible difference:
 * there's no final student code to show immediately (that's assigned by
 * the server), so the confirmation panel tracks this one registration's
 * outbox entry live and updates itself the moment it syncs.
 */
export function CaptureRegister() {
  const { profile } = useCaptureAuth();

  const [academicYear, setAcademicYear] = useState<AcademicYearRow | null>(null);
  const [term, setTerm] = useState<TermRow | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("F");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [guardianFullName, setGuardianFullName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState(RELATIONSHIPS[0]);
  const [guardianPhone, setGuardianPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queuedClientId, setQueuedClientId] = useState<string | null>(null);
  const [queuedName, setQueuedName] = useState<string>("");
  const [queuedEntry, setQueuedEntry] = useState<OutboxEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [years, terms, levelRows, classRows] = await Promise.all([
          captureDb.academicYears.toArray(),
          captureDb.terms.toArray(),
          captureDb.levels.orderBy("sort_order").toArray(),
          captureDb.classes.toArray(),
        ]);
        if (cancelled) return;
        setAcademicYear(years.find((y) => y.is_current) ?? null);
        setTerm(terms.find((t) => t.is_active) ?? null);
        setLevels(levelRows);
        setAllClasses(classRows);
      } catch (err) {
        if (!cancelled) setContextError(err instanceof Error ? err.message : "Could not load cached setup data.");
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const classes = useMemo(() => allClasses.filter((c) => c.level_id === levelId), [allClasses, levelId]);

  useEffect(() => {
    setClassId((current) => (classes.some((c) => c.id === current) ? current : ""));
  }, [classes]);

  useEffect(() => {
    if (!queuedClientId) return;
    let cancelled = false;
    async function refresh() {
      const entry = await captureDb.outbox.get(queuedClientId as string);
      if (!cancelled) setQueuedEntry(entry ?? null);
    }
    void refresh();
    const unsubscribe = onSyncChange(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queuedClientId]);

  const readyToSubmit = useMemo(
    () =>
      !!academicYear &&
      !!term &&
      !!classId &&
      !!levelId &&
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      dateOfBirth.length > 0 &&
      guardianFullName.trim().length > 0 &&
      guardianPhone.trim().length > 0,
    [academicYear, term, classId, levelId, firstName, lastName, dateOfBirth, guardianFullName, guardianPhone]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id || !academicYear || !term) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const clientId = await CaptureService.registerStudent({
        schoolId: profile.school_id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        dateOfBirth,
        academicYearId: academicYear.id,
        termId: term.id,
        levelId,
        classId,
        guardianFullName: guardianFullName.trim(),
        guardianRelationship,
        guardianPhone: guardianPhone.trim(),
      });
      setQueuedName(`${firstName.trim()} ${lastName.trim()}`);
      setQueuedClientId(clientId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not queue this registration.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setGender("F");
    setDateOfBirth("");
    setLevelId("");
    setClassId("");
    setGuardianFullName("");
    setGuardianRelationship(RELATIONSHIPS[0]);
    setGuardianPhone("");
    setQueuedClientId(null);
    setQueuedEntry(null);
  }

  if (loadingContext) return <p className="text-muted">Loading…</p>;
  if (contextError) return <div className="alert alert-danger">{contextError}</div>;

  if (!academicYear || !term) {
    return (
      <div className="alert alert-warning">
        No current academic year/active term cached yet. Connect to the internet once and refresh reference data
        from the Home screen before registering students.
      </div>
    );
  }

  if (queuedClientId) {
    const status = queuedEntry?.status ?? "PENDING";
    return (
      <div className="actrs-card p-4">
        {status === "SYNCED" ? (
          <div className="d-flex align-items-center gap-2 mb-2 text-success">
            <IconCheckCircle size={26} />
            <h1 className="h5 mb-0">Registered</h1>
          </div>
        ) : status === "FAILED" ? (
          <div className="d-flex align-items-center gap-2 mb-2 text-danger">
            <IconAlertTriangle size={26} />
            <h1 className="h5 mb-0">Sync failed</h1>
          </div>
        ) : (
          <div className="d-flex align-items-center gap-2 mb-2 text-primary">
            <IconCloudUp size={26} />
            <h1 className="h5 mb-0">Queued</h1>
          </div>
        )}
        <p className="mb-1">
          <strong>{queuedName}</strong>
        </p>
        {status === "SYNCED" && queuedEntry?.resultLabel && (
          <p className="text-muted small mb-3">Student ID: {queuedEntry.resultLabel}</p>
        )}
        {status === "FAILED" && <p className="text-danger small mb-3">{queuedEntry?.error}</p>}
        {(status === "PENDING" || status === "SYNCING") && (
          <p className="text-muted small mb-3">Will register automatically once synced. Check the Sync tab for progress.</p>
        )}
        <button className="btn btn-primary" onClick={resetForm}>
          Register another
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="h4 mb-1">Register a student</h1>
      <p className="text-muted mb-4">
        {academicYear.label} · {term.term_name}
      </p>

      {submitError && <div className="alert alert-danger">{submitError}</div>}

      <form onSubmit={handleSubmit} className="actrs-card p-3">
        <h2 className="h6 mb-3">Student details</h2>
        <div className="row g-3 mb-3">
          <div className="col-6">
            <label className="form-label small">First name</label>
            <input className="form-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="col-6">
            <label className="form-label small">Last name</label>
            <input className="form-control" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="col-6">
            <label className="form-label small">Gender</label>
            <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value as "M" | "F")}>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small">Date of birth</label>
            <input type="date" className="form-control" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
          </div>
        </div>

        <h2 className="h6 mb-3">Class placement</h2>
        <div className="row g-3 mb-3">
          <div className="col-6">
            <label className="form-label small">Level</label>
            <select className="form-select" value={levelId} onChange={(e) => setLevelId(e.target.value)} required>
              <option value="">Select…</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small">Class</label>
            <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!levelId} required>
              <option value="">{levelId ? "Select…" : "Choose a level first"}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="h6 mb-3">Parent / guardian</h2>
        <div className="row g-3 mb-4">
          <div className="col-12">
            <label className="form-label small">Full name</label>
            <input className="form-control" value={guardianFullName} onChange={(e) => setGuardianFullName(e.target.value)} required />
          </div>
          <div className="col-6">
            <label className="form-label small">Relationship</label>
            <select className="form-select" value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)}>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small">Phone number</label>
            <input
              type="tel"
              className="form-control"
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder="024 000 0000"
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={!readyToSubmit || submitting}>
          {submitting ? "Queuing…" : "Register student"}
        </button>
      </form>
    </div>
  );
}
