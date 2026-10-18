import { useEffect, useState } from "react";

/** True one frame after mount / whenever `key` changes, so CSS transitions play. */
function useGrow(key: unknown): boolean {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(id);
  }, [key]);
  return grown;
}

export const COLOR_MALE = "#3aa0ff";
export const COLOR_FEMALE = "#ff4fa3";
export const COLOR_GOOD = "#2f9e44";
export const COLOR_WATCH = "#f2b705";
export const COLOR_BAD = "#e03131";

/** Boys / girls ring with the total in the middle. */
export function GenderDonut({ male, female }: { male: number; female: number }) {
  const grown = useGrow(`${male}-${female}`);
  const total = male + female;
  const r = 52;
  const c = 2 * Math.PI * r;
  const m = total ? (male / total) * c : 0;
  const f = total ? (female / total) * c : 0;
  const gap = male && female ? 4 : 0;
  return (
    <div className="cd-donut-wrap">
      <svg viewBox="0 0 140 140" className="cd-donut" role="img" aria-label={`${male} boys, ${female} girls`}>
        <circle cx="70" cy="70" r={r} className="cd-track" />
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={r} className="cd-arc" stroke={COLOR_MALE} strokeDasharray={`${grown ? Math.max(0, m - gap) : 0} ${c}`} />
          <circle
            cx="70"
            cy="70"
            r={r}
            className="cd-arc"
            stroke={COLOR_FEMALE}
            strokeDasharray={`${grown ? Math.max(0, f - gap) : 0} ${c}`}
            strokeDashoffset={-m}
          />
        </g>
        <text x="70" y="72" textAnchor="middle" className="cd-donut-num">
          {total}
        </text>
        <text x="70" y="90" textAnchor="middle" className="cd-donut-lbl">
          learners
        </text>
      </svg>
      <div className="cd-legend">
        <div>
          <span className="cd-dot" style={{ background: COLOR_MALE }} /> Boys <strong>{male}</strong>
          {total > 0 && <span className="text-muted ms-1">{Math.round((male / total) * 100)}%</span>}
        </div>
        <div>
          <span className="cd-dot" style={{ background: COLOR_FEMALE }} /> Girls <strong>{female}</strong>
          {total > 0 && <span className="text-muted ms-1">{Math.round((female / total) * 100)}%</span>}
        </div>
      </div>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Text shown at the end of the bar (defaults to the value). */
  display?: string;
  color?: string;
  sub?: string;
}

/** Horizontal bars; `max` defaults to the largest value. */
export function HBars({ items, max }: { items: BarDatum[]; max?: number }) {
  const grown = useGrow(items.map((i) => `${i.label}:${i.value}`).join("|"));
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <div className="text-muted small py-2">Nothing to show yet.</div>;
  return (
    <div className="cd-bars">
      {items.map((it, i) => (
        <div key={it.label} className="cd-bar-row">
          <div className="cd-bar-head">
            <span className="cd-bar-label">{it.label}</span>
            <span className="cd-bar-val">{it.display ?? it.value}</span>
          </div>
          <div className="cd-bar-track">
            <div
              className="cd-bar-fill"
              style={{
                width: `${grown ? Math.min(100, (it.value / top) * 100) : 0}%`,
                background: it.color ?? COLOR_MALE,
                color: it.color ?? COLOR_MALE,
                transitionDelay: `${i * 70}ms`,
              }}
            />
          </div>
          {it.sub && <div className="cd-bar-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Vertical twin columns per age (boys / girls). */
export function AgeColumns({ items }: { items: { age: number; male: number; female: number }[] }) {
  const grown = useGrow(items.map((i) => `${i.age}:${i.male}:${i.female}`).join("|"));
  const max = Math.max(1, ...items.flatMap((i) => [i.male, i.female]));
  if (items.length === 0) return <div className="text-muted small py-2">Nothing to show yet.</div>;
  return (
    <div className="cd-cols">
      {items.map((it, i) => (
        <div key={it.age} className="cd-col">
          <div className="cd-col-count">{it.male + it.female}</div>
          <div className="cd-col-bars">
            <div className="cd-col-bar" style={{ height: grown ? `${(it.male / max) * 100}%` : 0, background: COLOR_MALE, transitionDelay: `${i * 60}ms` }} />
            <div className="cd-col-bar" style={{ height: grown ? `${(it.female / max) * 100}%` : 0, background: COLOR_FEMALE, transitionDelay: `${i * 60 + 40}ms` }} />
          </div>
          <div className="cd-col-lbl">{it.age}y</div>
        </div>
      ))}
    </div>
  );
}

/** Small circular gauge (0-100). */
export function Gauge({ percent, label, color }: { percent: number; label: string; color: string }) {
  const grown = useGrow(percent);
  const r = 30;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="cd-gauge">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="cd-track cd-track-sm" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="cd-arc cd-arc-sm"
          stroke={color}
          strokeDasharray={`${grown ? (p / 100) * c : 0} ${c}`}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle" className="cd-gauge-num">
          {Math.round(p)}%
        </text>
      </svg>
      <div className="cd-gauge-lbl">{label}</div>
    </div>
  );
}
