import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONDUCT_RATINGS,
  GROUPS_BY_KIND,
  combineConduct,
  combineItems,
  normKey,
  parseConduct,
  parseItems,
  type RemarkKind,
} from "@/constants/remarkLibrary";

export type RemarkFieldKind = "class_teacher" | "headteacher" | "interest" | "attitude" | "conduct";

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 4px 2px 8px",
  borderRadius: 999,
  background: "rgba(127,127,127,.18)",
  fontSize: ".78rem",
  lineHeight: 1.25,
  maxWidth: "100%",
};

interface PickerProps {
  /** Which library to pick from. */
  kind: RemarkKind;
  /** The currently chosen option texts, in order. */
  chips: { text: string; custom: boolean }[];
  onChange: (texts: string[]) => void;
  placeholder?: string;
}

/** Searchable, grouped multi-select with removable chips and a custom entry. */
function ChipPicker({ kind, chips, onChange, placeholder }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Collapse when the user clicks or taps anywhere outside this picker, or tabs away.
  useEffect(() => {
    if (!open) return;
    function away(ev: Event) {
      if (boxRef.current && ev.target instanceof Node && !boxRef.current.contains(ev.target)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
    };
  }, [open]);

  const chosen = useMemo(() => new Set(chips.map((c) => normKey(c.text))), [chips]);
  const needle = q.trim().toLowerCase();

  const groups = useMemo(
    () =>
      GROUPS_BY_KIND[kind]
        .map((g) => ({
          heading: g.heading,
          items: g.items.filter((i) => !chosen.has(normKey(i)) && (!needle || i.toLowerCase().includes(needle))),
        }))
        .filter((g) => g.items.length > 0),
    [kind, chosen, needle]
  );

  const texts = chips.map((c) => c.text);
  function add(text: string) {
    const t = text.trim();
    if (!t || chosen.has(normKey(t))) return;
    onChange([...texts, t]);
    setQ("");
    setOpen(false);
  }
  function removeAt(i: number) {
    onChange(texts.filter((_, idx) => idx !== i));
  }
  const exact = needle && GROUPS_BY_KIND[kind].some((g) => g.items.some((i) => normKey(i) === normKey(q)));

  return (
    <div ref={boxRef}>
      {chips.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-1">
          {chips.map((c, i) => (
            <span key={`${c.text}-${i}`} style={chipStyle} title={c.custom ? "Custom / earlier text" : undefined}>
              <span style={{ wordBreak: "break-word" }}>{c.text}</span>
              <button
                type="button"
                className="btn btn-sm p-0 border-0"
                style={{ width: 18, height: 18, lineHeight: 1, opacity: 0.7 }}
                aria-label={`Remove ${c.text}`}
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className="form-control form-control-sm"
        placeholder={placeholder ?? "Search or add…"}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!q.trim()) return;
            const all = groups.flatMap((g) => g.items);
            add(exact || all.length !== 1 ? q : all[0]);
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
            setQ("");
          }
        }}
      />
      {open && (
        <div
          className="border rounded mt-1"
          style={{ maxHeight: 220, overflowY: "auto", background: "var(--bs-body-bg, #fff)" }}
        >
          {groups.map((g) => (
            <div key={g.heading}>
              <div className="px-2 py-1 small fw-semibold text-muted" style={{ position: "sticky", top: 0, background: "var(--bs-body-bg, #fff)" }}>
                {g.heading}
              </div>
              {g.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="d-block w-100 text-start btn btn-sm rounded-0 border-0 px-3 py-1"
                  style={{ whiteSpace: "normal", fontSize: ".8rem" }}
                  onClick={() => add(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && !needle && <div className="px-2 py-2 small text-muted">All options chosen.</div>}
          {needle && !exact && (
            <button
              type="button"
              className="d-block w-100 text-start btn btn-sm rounded-0 border-0 px-3 py-2 fw-medium"
              style={{ whiteSpace: "normal", fontSize: ".8rem" }}
              onClick={() => add(q)}
            >
              Add “{q.trim()}” (your own wording)
            </button>
          )}
          <div className="text-end border-top p-1">
            <button type="button" className="btn btn-sm btn-link py-0" onClick={() => { setOpen(false); setQ(""); }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  kind: RemarkFieldKind;
  value: string;
  onChange: (next: string) => void;
}

/**
 * One component for all five fields. The saved value is a plain text string
 * (exactly what the report card prints); chips are read from it, and every
 * change rewrites it with the grammar rules in remarkLibrary.ts. "Edit text"
 * lets a teacher polish the final wording by hand.
 */
export function RemarkPicker({ kind, value, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  const conduct = useMemo(() => (kind === "conduct" ? parseConduct(value) : null), [kind, value]);
  const chips = useMemo(
    () => (kind === "conduct" ? conduct!.supporting : parseItems(kind, value)),
    [kind, value, conduct]
  );
  const libraryKind: RemarkKind = kind === "conduct" ? "conduct_support" : kind;

  function handleChips(texts: string[]) {
    if (kind === "conduct") onChange(combineConduct(conduct!.rating, texts));
    else onChange(combineItems(kind, texts));
  }

  const ratingInfo = conduct ? CONDUCT_RATINGS.find((r) => r.label === conduct.rating) : undefined;

  return (
    <div>
      {kind === "conduct" && (
        <div className="mb-1">
          <select
            className="form-select form-select-sm"
            value={conduct!.rating}
            onChange={(e) => onChange(combineConduct(e.target.value, conduct!.supporting.map((c) => c.text)))}
          >
            <option value="">Overall rating…</option>
            {CONDUCT_RATINGS.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>
          {ratingInfo && <div className="small text-muted mt-1">{ratingInfo.description}</div>}
        </div>
      )}

      <ChipPicker
        kind={libraryKind}
        chips={chips}
        onChange={handleChips}
        placeholder={
          kind === "conduct" ? "Optional supporting remark…" : kind === "interest" ? "Search interests…" : "Search or add…"
        }
      />

      {value.trim() !== "" && (
        <div className="small text-muted mt-1" style={{ wordBreak: "break-word" }}>
          <span className="fw-semibold">Shows as:</span> {value}
        </div>
      )}

      <button type="button" className="btn btn-link btn-sm p-0 mt-1" onClick={() => setEditing((e) => !e)}>
        {editing ? "Hide text editor" : "Edit text"}
      </button>
      {editing && (
        <textarea
          className="form-control form-control-sm mt-1"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
