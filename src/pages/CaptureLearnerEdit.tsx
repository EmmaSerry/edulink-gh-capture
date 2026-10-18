import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useCaptureAuth } from "@contexts/CaptureAuthContext";
import { captureDb } from "@/lib/offlineDb";
import { PhotoPickerField } from "@/components/PhotoPickerField";
import {
  getPendingEditFor,
  loadGuardian,
  saveLearnerEdit,
  type GuardianEdit,
} from "@/services/LearnerEditService";
import type { StudentRow, StudentStatus } from "@/types/database";

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Other"];
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  TRANSFERRED_OUT: "Transferred out",
  GRADUATED: "Graduated",
  WITHDRAWN: "Withdrawn",
  DECEASED: "Deceased",
};
const STATUS_ROLES = new Set(["school_admin", "district_admin", "platform_admin"]);

interface Bio {
  first_name: string;
  middle_name: string;
  last_name: string;
  preferred_name: string;
  gender: "M" | "F";
  date_of_birth: string;
  nationality: string;
  admission_number: string;
  ghana_card_number: string;
  special_educational_needs: string;
  status: StudentStatus;
  status_reason: string;
}

function toBio(s: StudentRow): Bio {
  return {
    first_name: s.first_name,
    middle_name: s.middle_name ?? "",
    last_name: s.last_name,
    preferred_name: s.preferred_name ?? "",
    gender: s.gender,
    date_of_birth: s.date_of_birth,
    nationality: s.nationality ?? "",
    admission_number: s.admission_number ?? "",
    ghana_card_number: s.ghana_card_number ?? "",
    special_educational_needs: s.special_educational_needs ?? "",
    status: s.status,
    status_reason: s.status_reason ?? "",
  };
}

const EMPTY_GUARDIAN: GuardianEdit = {
  full_name: "",
  relationship: RELATIONSHIPS[0],
  phone: "",
  alternative_phone: "",
  email: "",
  residential_address: "",
  sms_opt_in: true,
};

/** Edit one learner's details, photo and guardian. Works offline. */
export function CaptureLearnerEdit() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useCaptureAuth();
  const canChangeStatus = !!profile && STATUS_ROLES.has(profile.role);

  const [student, setStudent] = useState<StudentRow | null>(null);
  const [bio, setBio] = useState<Bio | null>(null);
  const [original, setOriginal] = useState<Bio | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [guardian, setGuardian] = useState<GuardianEdit>(EMPTY_GUARDIAN);
  const [origGuardian, setOrigGuardian] = useState<GuardianEdit | null>(null);
  const [guardianKnown, setGuardianKnown] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const s = await captureDb.students.get(id);
      if (!s) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }
      const g = await loadGuardian(id);
      const pending = await getPendingEditFor(id);
      if (cancelled) return;
      setStudent(s);
      const b = toBio(s);
      setBio(b);
      setOriginal(b);
      setPhoto(s.photo_url);
      const gg = pending?.guardian ?? g;
      setGuardianKnown(!!gg);
      setGuardian(gg ?? EMPTY_GUARDIAN);
      setOrigGuardian(gg);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function setB<K extends keyof Bio>(k: K, v: Bio[K]) {
    setBio((b) => (b ? { ...b, [k]: v } : b));
  }
  function setG<K extends keyof GuardianEdit>(k: K, v: GuardianEdit[K]) {
    setGuardian((g) => ({ ...g, [k]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!student || !bio || !original) return;
    setError(null);
    setMessage(null);

    const changes: Record<string, unknown> = {};
    const text = (v: string) => v.trim() || null;
    const next: Record<string, unknown> = {
      first_name: bio.first_name.trim(),
      middle_name: text(bio.middle_name),
      last_name: bio.last_name.trim(),
      preferred_name: text(bio.preferred_name),
      gender: bio.gender,
      date_of_birth: bio.date_of_birth,
      nationality: text(bio.nationality),
      admission_number: text(bio.admission_number),
      ghana_card_number: text(bio.ghana_card_number),
      special_educational_needs: text(bio.special_educational_needs),
    };
    if (canChangeStatus) {
      next.status = bio.status;
      next.status_reason = bio.status === "ACTIVE" ? null : text(bio.status_reason);
    }
    const current = student as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(next)) {
      const before = current[k] ?? null;
      if (v !== before) changes[k] = v;
    }
    if (photo !== student.photo_url) changes.photo_url = photo;

    if (!bio.first_name.trim() || !bio.last_name.trim() || !bio.date_of_birth) {
      setError("First name, last name and date of birth are required.");
      return;
    }

    const g: GuardianEdit = {
      full_name: guardian.full_name.trim(),
      relationship: guardian.relationship,
      phone: guardian.phone.trim(),
      alternative_phone: text(guardian.alternative_phone ?? ""),
      email: text(guardian.email ?? ""),
      residential_address: text(guardian.residential_address ?? ""),
      sms_opt_in: guardian.sms_opt_in,
    };
    const guardianTouched = guardianKnown
      ? JSON.stringify(g) !== JSON.stringify(origGuardian)
      : !!(g.full_name || g.phone);
    if (guardianTouched && (!g.full_name || !g.phone)) {
      setError("A guardian needs a name and a phone number.");
      return;
    }

    if (Object.keys(changes).length === 0 && !guardianTouched) {
      setMessage("Nothing was changed.");
      return;
    }

    setSaving(true);
    try {
      await saveLearnerEdit({ student, changes, guardian: guardianTouched ? g : null });
      const refreshed = await captureDb.students.get(student.id);
      if (refreshed) {
        setStudent(refreshed);
        setOriginal(toBio(refreshed));
      }
      if (guardianTouched) {
        setOrigGuardian(g);
        setGuardianKnown(true);
      }
      setMessage(
        navigator.onLine
          ? "Saved. Sending to the server now."
          : "Saved on this phone. It will be sent automatically when you are online.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>;
  if (notFound || !student || !bio)
    return (
      <div>
        <div className="alert alert-warning">This learner is not on this phone. Refresh reference data on Home while online.</div>
        <Link to="/learners">Back to learners</Link>
      </div>
    );

  return (
    <form onSubmit={handleSubmit}>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <h1 className="h5 mb-0">Edit learner</h1>
        <Link to="/learners" className="btn btn-outline-secondary btn-sm">
          Back
        </Link>
      </div>
      <p className="text-muted small">{student.student_id}</p>

      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {message && <div className="alert alert-success py-2 small">{message}</div>}

      <div className="actrs-card p-3 mb-3">
        <h2 className="h6 fw-bold mb-2">Photo</h2>
        <PhotoPickerField value={photo} onChange={setPhoto} />
      </div>

      <div className="actrs-card p-3 mb-3">
        <h2 className="h6 fw-bold mb-2">Details</h2>
        <div className="row g-2">
          <Field label="First name" value={bio.first_name} onChange={(v) => setB("first_name", v)} required />
          <Field label="Middle name" value={bio.middle_name} onChange={(v) => setB("middle_name", v)} />
          <Field label="Last name" value={bio.last_name} onChange={(v) => setB("last_name", v)} required />
          <Field label="Preferred name" value={bio.preferred_name} onChange={(v) => setB("preferred_name", v)} />
          <div className="col-6">
            <label className="form-label small mb-1">Gender</label>
            <select className="form-select" value={bio.gender} onChange={(e) => setB("gender", e.target.value as "M" | "F")}>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small mb-1">Date of birth</label>
            <input type="date" className="form-control" value={bio.date_of_birth} onChange={(e) => setB("date_of_birth", e.target.value)} required />
          </div>
          <Field label="Nationality" value={bio.nationality} onChange={(v) => setB("nationality", v)} />
          <Field label="Admission number" value={bio.admission_number} onChange={(v) => setB("admission_number", v)} />
          <Field label="Ghana Card number" value={bio.ghana_card_number} onChange={(v) => setB("ghana_card_number", v)} />
          <div className="col-12">
            <label className="form-label small mb-1">Special educational needs (if any)</label>
            <textarea
              className="form-control"
              rows={2}
              value={bio.special_educational_needs}
              onChange={(e) => setB("special_educational_needs", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="actrs-card p-3 mb-3">
        <h2 className="h6 fw-bold mb-2">Guardian</h2>
        {!guardianKnown && (
          <p className="text-muted small">
            Guardian details are not on this phone yet. Open this learner once while online to see them, or enter new ones.
          </p>
        )}
        <div className="row g-2">
          <Field label="Full name" value={guardian.full_name} onChange={(v) => setG("full_name", v)} />
          <div className="col-6">
            <label className="form-label small mb-1">Relationship</label>
            <select className="form-select" value={guardian.relationship ?? ""} onChange={(e) => setG("relationship", e.target.value)}>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Field label="Phone" value={guardian.phone} onChange={(v) => setG("phone", v)} />
          <Field label="Alternative phone" value={guardian.alternative_phone ?? ""} onChange={(v) => setG("alternative_phone", v)} />
          <Field label="Email" value={guardian.email ?? ""} onChange={(v) => setG("email", v)} full />
          <Field label="Residential address" value={guardian.residential_address ?? ""} onChange={(v) => setG("residential_address", v)} full />
          <div className="col-12">
            <div className="form-check">
              <input
                id="smsopt"
                type="checkbox"
                className="form-check-input"
                checked={guardian.sms_opt_in}
                onChange={(e) => setG("sms_opt_in", e.target.checked)}
              />
              <label htmlFor="smsopt" className="form-check-label small">
                Receives SMS notifications
              </label>
            </div>
          </div>
        </div>
      </div>

      {canChangeStatus && (
        <div className="actrs-card p-3 mb-3">
          <h2 className="h6 fw-bold mb-2">Status</h2>
          <select className="form-select mb-2" value={bio.status} onChange={(e) => setB("status", e.target.value as StudentStatus)}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {bio.status !== "ACTIVE" && (
            <input
              className="form-control"
              placeholder="Reason / note"
              value={bio.status_reason}
              onChange={(e) => setB("status_reason", e.target.value)}
            />
          )}
        </div>
      )}

      <button className="btn btn-primary w-100 mb-4" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-12" : "col-6"}>
      <label className="form-label small mb-1">{label}</label>
      <input className="form-control" value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
