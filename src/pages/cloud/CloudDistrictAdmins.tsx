import { useEffect, useState, type FormEvent } from "react";
import {
  DistrictAdminService,
  type AssignableDistrict,
  type DistrictAdminRow,
} from "@services/cloud/DistrictAdminService";

/**
 * Super Admin only: add more district administrators (each with their own
 * sign-in) and remove / restore them. The first administrator of a district
 * still comes from the district's own sign-up.
 */
export function CloudDistrictAdmins() {
  const [admins, setAdmins] = useState<DistrictAdminRow[] | null>(null);
  const [districts, setDistricts] = useState<AssignableDistrict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [districtId, setDistrictId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    DistrictAdminService.list()
      .then(setAdmins)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the administrators."));
  }

  useEffect(() => {
    load();
    DistrictAdminService.districts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setWarning(null);
    if (!districtId) return setError("Choose a district.");
    setSaving(true);
    try {
      const result = await DistrictAdminService.create({ districtId, fullName, phone, email });
      if (result.notified) {
        setSuccess(`${fullName} was added and has been texted their sign-in details.`);
      } else {
        setWarning(
          `${result.warning ?? "Added, but no text was sent."} Email: ${result.email}  Password: ${result.tempPassword}  - this is shown only once.`
        );
      }
      setFullName("");
      setPhone("");
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this administrator.");
    } finally {
      setSaving(false);
    }
  }

  async function resend(a: DistrictAdminRow) {
    const phone = window.prompt(
      `Send ${a.full_name}'s sign-in details to which phone number?\n\nA NEW password will be created (the old one stops working). Edit the number below if it was wrong.`,
      a.phone ?? ""
    );
    if (phone === null) return;
    setBusyId(a.user_id);
    setError(null);
    setSuccess(null);
    setWarning(null);
    try {
      const r = await DistrictAdminService.resend(a.user_id, phone.trim());
      if (r.notified) {
        setSuccess(`New sign-in details were texted to ${a.full_name} (${r.phone}).`);
      } else {
        setWarning(
          `${r.warning ?? "The text could not be sent."} Email: ${r.email}  Password: ${r.tempPassword}  - this is shown only once.`
        );
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the details.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(a: DistrictAdminRow) {
    const removing = a.is_active;
    if (
      !confirm(
        removing
          ? `Remove ${a.full_name} as a district administrator?\n\nThey will no longer be able to sign in.`
          : `Restore ${a.full_name} as a district administrator?`
      )
    )
      return;
    setBusyId(a.user_id);
    setError(null);
    setSuccess(null);
    try {
      await DistrictAdminService.setActive(a.user_id, !removing);
      setSuccess(removing ? `${a.full_name} was removed.` : `${a.full_name} was restored.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this administrator.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="h4 mb-1">District administrators</h1>
      <p className="text-muted mb-4">
        Add more than one administrator to a district. Each person gets their own sign-in, and is texted their first
        name, the web link and their sign-in details. Only you (the Super Admin) can add or remove them.
      </p>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      {warning && <div className="alert alert-warning">{warning}</div>}

      <form className="actrs-card p-4 mb-4" onSubmit={handleAdd}>
        <h2 className="h6 fw-bold mb-3">Add a district administrator</h2>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label small">District</label>
            <select className="form-select" value={districtId} onChange={(e) => setDistrictId(e.target.value)} required>
              <option value="">Choose a district…</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.region ? ` (${d.region})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label small">Full name</label>
            <input className="form-control" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="col-md-6">
            <label className="form-label small">Phone number (the sign-in details are texted here)</label>
            <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div className="col-md-6">
            <label className="form-label small">Email address (used to sign in)</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <button className="btn btn-primary mt-3" type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add and send sign-in details"}
        </button>
      </form>

      <div className="actrs-card p-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style={{ width: 56 }}>No.</th>
                <th>Name</th>
                <th>District</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins === null && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    Loading…
                  </td>
                </tr>
              )}
              {admins?.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No district administrators yet.
                  </td>
                </tr>
              )}
              {(admins ?? []).map((a, i) => (
                <tr key={a.user_id}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="fw-medium">{a.full_name}</td>
                  <td>{a.district_name}</td>
                  <td>{a.email ?? "-"}</td>
                  <td>{a.phone ?? "-"}</td>
                  <td>
                    <span className={`badge ${a.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
                      {a.is_active ? "Active" : "Removed"}
                    </span>
                  </td>
                  <td className="text-end">
                    {a.is_active && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary me-2"
                        disabled={busyId === a.user_id}
                        onClick={() => resend(a)}
                      >
                        Resend login details
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${a.is_active ? "btn-outline-danger" : "btn-outline-primary"}`}
                      disabled={busyId === a.user_id}
                      onClick={() => toggle(a)}
                    >
                      {a.is_active ? "Remove" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
