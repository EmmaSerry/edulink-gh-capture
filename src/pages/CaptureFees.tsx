import { useEffect, useMemo, useState } from "react";
import { captureDb } from "@/lib/offlineDb";
import { CaptureService } from "@/services/CaptureService";
import { useCaptureAuth } from "@/contexts/CaptureAuthContext";
import type { TermRow, ClassRow, StudentRow, SchoolRow, FeeStructureRow, StudentFeeRow, FeePaymentMethod } from "@/types/database";

const FEE_MANAGER_ROLES = new Set(["bursar", "school_admin", "district_admin", "platform_admin"]);

/** Same options as the cloud app's Fees screen minus "paystack" - that
 *  method only makes sense for an online card/mobile-money checkout
 *  flow, never something recorded by hand in the field. */
const PAYMENT_METHODS: { value: FeePaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

function fullNameOf(s: StudentRow): string {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}

function money(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

interface FeeLine {
  studentFee: StudentFeeRow;
  feeName: string;
  paid: number;
}

function PaymentRow({ line, onRecord }: { line: FeeLine; onRecord: (studentFeeId: string, amount: number, method: FeePaymentMethod, reference: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FeePaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const balance = line.studentFee.amount_due - line.paid;

  function handleSubmit() {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) return;
    onRecord(line.studentFee.id, value, method, reference.trim());
    setAmount("");
    setReference("");
    setOpen(false);
  }

  return (
    <div className="p-3 border-bottom">
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <div className="fw-medium">{line.feeName}</div>
          <div className="small text-muted">
            Due {money(line.studentFee.amount_due)} · Paid {money(line.paid)}
          </div>
        </div>
        <div className="text-end">
          <div className={`fw-semibold ${balance > 0 ? "text-danger" : "text-success"}`}>{money(balance)}</div>
          <div className="small text-muted">{balance > 0 ? "balance" : "settled"}</div>
        </div>
      </div>
      {!open && (
        <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={() => setOpen(true)} disabled={balance <= 0}>
          Record payment
        </button>
      )}
      {open && (
        <div className="row g-2 mt-1">
          <div className="col-5">
            <input
              type="number"
              min={0}
              step="0.01"
              className="form-control form-control-sm"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="col-7">
            <select className="form-select form-select-sm" value={method} onChange={(e) => setMethod(e.target.value as FeePaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="col-12 d-flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit}>
              Save
            </button>
            <button type="button" className="btn btn-link btn-sm text-muted" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Offline counterpart of the cloud app's CloudFees screen - narrowed to
 * just the one thing that belongs in the field: recording a payment
 * against a fee already generated online. Fee structure setup and
 * "generate this term's fees" stay office/online-only tasks (see
 * StudentFeeRow in types/database.ts) - this screen only ever reads
 * fee_structures/student_fees, never writes them.
 *
 * Gated the same way the cloud app's /fees route is (RequireAdmin
 * roles="fees"): bursar/school_admin/district_admin/platform_admin
 * only, and private schools only. Both checks are client-side
 * convenience here - the real boundary is the database's own RLS
 * (is_fee_manager()), which record_payment() runs under regardless of
 * what this screen does.
 */
export function CaptureFees() {
  const { profile } = useCaptureAuth();
  const [term, setTerm] = useState<TermRow | null>(null);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [structures, setStructures] = useState<FeeStructureRow[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [lines, setLines] = useState<FeeLine[]>([]);
  const [loadingClass, setLoadingClass] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const isFeeManager = !!profile && FEE_MANAGER_ROLES.has(profile.role);

  useEffect(() => {
    if (!isFeeManager) {
      setLoadingContext(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [terms, classRows, levelRows, schoolRows, structureRows] = await Promise.all([
        captureDb.terms.toArray(),
        captureDb.classes.toArray(),
        // Only needed transiently, to sort classes into curriculum
        // order below - unlike CaptureAssessment/CaptureRemarksAttendance/
        // CaptureProgress, this screen doesn't branch by assessment_mode,
        // so there's no reason to hold levels in state here.
        captureDb.levels.orderBy("sort_order").toArray(),
        captureDb.schools.toArray(),
        captureDb.feeStructures.toArray(),
      ]);
      if (cancelled) return;
      setTerm(terms.find((t) => t.is_active) ?? null);
      const levelOrder = new Map(levelRows.map((l) => [l.id, l.sort_order]));
      const sortedClasses = [...classRows].sort((a, b) => {
        const byLevel = (levelOrder.get(a.level_id) ?? 0) - (levelOrder.get(b.level_id) ?? 0);
        return byLevel !== 0 ? byLevel : a.name.localeCompare(b.name);
      });
      setClasses(sortedClasses);
      setSchool(schoolRows[0] ?? null);
      setStructures(structureRows);
      setLoadingContext(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFeeManager]);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId) ?? null, [classes, classId]);

  useEffect(() => {
    if (!classId || !term) {
      setStudents([]);
      setStudentId("");
      return;
    }
    let cancelled = false;
    (async () => {
      const enrollments = await captureDb.enrollments.where("[term_id+class_id]").equals([term.id, classId]).toArray();
      const studentIds = enrollments.map((e) => e.student_id);
      const rosterStudents = (await captureDb.students.bulkGet(studentIds))
        .filter((s): s is StudentRow => !!s)
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
      if (cancelled) return;
      setStudents(rosterStudents);
      setStudentId("");
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, term]);

  useEffect(() => {
    if (!studentId || !term) {
      setLines([]);
      return;
    }
    let cancelled = false;
    setLoadingClass(true);
    (async () => {
      const fees = await captureDb.studentFees.where("[student_id+term_id]").equals([studentId, term.id]).toArray();
      const structureNames = new Map(structures.map((s) => [s.id, s.name]));
      const built: FeeLine[] = [];
      for (const fee of fees) {
        const payments = await captureDb.feePayments.where("student_fee_id").equals(fee.id).toArray();
        const paid = payments.reduce((sum, p) => sum + p.amount, 0);
        built.push({ studentFee: fee, feeName: structureNames.get(fee.fee_structure_id) ?? "Fee", paid });
      }
      built.sort((a, b) => a.feeName.localeCompare(b.feeName));
      if (cancelled) return;
      setLines(built);
      setLoadingClass(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, term, structures]);

  function handleRecord(studentFeeId: string, amount: number, method: FeePaymentMethod, reference: string) {
    void CaptureService.recordPayment({
      studentFeeId,
      amount,
      method,
      reference: reference || null,
    }).then(() => {
      // Optimistic: reflect the payment in this screen immediately
      // rather than waiting for the next sync + reference-data refresh
      // to bring back the real fee_payments row.
      setLines((prev) => prev.map((l) => (l.studentFee.id === studentFeeId ? { ...l, paid: l.paid + amount } : l)));
      setSavedMessage("Payment recorded - will sync when online.");
      setTimeout(() => setSavedMessage(null), 3000);
    });
  }

  if (loadingContext) return <p className="text-muted">Loading…</p>;

  if (!isFeeManager) {
    return (
      <div>
        <h1 className="h4 mb-3">Fees</h1>
        <div className="alert alert-secondary">Fee recording is only available to bursars and school admins.</div>
      </div>
    );
  }

  if (!school?.is_private) {
    return (
      <div>
        <h1 className="h4 mb-3">Fees</h1>
        <div className="alert alert-secondary">Fees apply to private schools only.</div>
      </div>
    );
  }

  if (!term) {
    return <div className="alert alert-warning">No active term cached yet. Refresh reference data from Home while online.</div>;
  }

  return (
    <div>
      <h1 className="h4 mb-1">Fees</h1>
      <p className="text-muted mb-3">{term.term_name}</p>

      {savedMessage && <div className="alert alert-success py-2 small">{savedMessage}</div>}

      <div className="actrs-card p-3 mb-3">
        <label className="form-label small">Class</label>
        <select className="form-select mb-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="form-label small">Student</label>
        <select className="form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId || students.length === 0}>
          <option value="">{students.length === 0 ? "No students cached for this class" : "Select a student…"}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {fullNameOf(s)}
            </option>
          ))}
        </select>
      </div>

      {studentId && (
        <div className="actrs-card p-0">
          {loadingClass && <p className="text-muted text-center py-4 mb-0">Loading…</p>}
          {!loadingClass && lines.length === 0 && (
            <p className="text-muted text-center py-4 mb-0 px-3">
              No fees have been generated for this student yet - that's done from the dashboard's Fees screen once
              online.
            </p>
          )}
          {!loadingClass && lines.map((line) => <PaymentRow key={line.studentFee.id} line={line} onRecord={handleRecord} />)}
        </div>
      )}

      {selectedClass && !studentId && students.length > 0 && (
        <p className="text-muted small mt-2 mb-0">Pick a student to see their fees.</p>
      )}
    </div>
  );
}
