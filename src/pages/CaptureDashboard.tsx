import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { captureDb } from "@/lib/offlineDb";
import { useCaptureAuth } from "@/contexts/CaptureAuthContext";
import { LookupSyncService } from "@/services/LookupSyncService";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CaptureCountUp } from "@/components/CaptureCountUp";
import {
  AgeColumns,
  Gauge,
  GenderDonut,
  HBars,
  COLOR_BAD,
  COLOR_FEMALE,
  COLOR_GOOD,
  COLOR_MALE,
  COLOR_WATCH,
  type BarDatum,
} from "@/components/CaptureCharts";
import "@/styles/capture-dashboard.css";
import type {
  ClassRow,
  EnrollmentRow,
  LearningAreaRow,
  LevelRow,
  ScoreRecordRow,
  SchoolRow,
  SkillAssessmentRecordRow,
  SkillRow,
  StudentRow,
  SubjectRow,
  TermRow,
} from "@/types/database";

const PASS_MARK = 50; // below this a subject average / learner average needs attention
const WATCH_MARK = 65;

interface Data {
  term: TermRow | null;
  school: SchoolRow | null;
  classes: ClassRow[];
  levels: LevelRow[];
  students: StudentRow[];
  enrollments: EnrollmentRow[];
  subjects: SubjectRow[];
  scores: ScoreRecordRow[];
  areas: LearningAreaRow[];
  skills: SkillRow[];
  ratings: SkillAssessmentRecordRow[];
}

type Tab = "overview" | "classes" | "students";

function ageOf(dob: string): number | null {
  const t = new Date(dob).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}

function bandColor(avg: number): string {
  if (avg < PASS_MARK) return COLOR_BAD;
  if (avg < WATCH_MARK) return COLOR_WATCH;
  return COLOR_GOOD;
}

function total(r: ScoreRecordRow): number | null {
  if (r.sba_score == null || r.exam_score == null) return null;
  return r.sba_score + r.exam_score;
}

const KPI_GRADIENTS: [string, string][] = [
  ["#1f6feb", "#20c9b8"],
  ["#3aa0ff", "#6c5ce7"],
  ["#ff4fa3", "#ff8a4c"],
  ["#20c9b8", "#2f9e44"],
];

/** Offline dashboard: learners, class statistics (numbers + charts) and
 *  highlights of the subjects / learning areas that need attention.
 *  Everything is computed on the phone from the cached data, so it works
 *  without a connection. A teacher sees their own class(es); school-level
 *  roles see the whole school. */
export function CaptureDashboard() {
  const { profile } = useCaptureAuth();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");

  const online = useOnlineStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function load(): Promise<void> {
    const [terms, classes, levels, students, enrollments, subjects, scores, areas, skills, ratings, schools] = await Promise.all([
      captureDb.terms.toArray(),
      captureDb.classes.toArray(),
      captureDb.levels.orderBy("sort_order").toArray(),
      captureDb.students.toArray(),
      captureDb.enrollments.toArray(),
      captureDb.subjects.toArray(),
      captureDb.scoreRecords.toArray(),
      captureDb.learningAreas.toArray(),
      captureDb.skills.toArray(),
      captureDb.skillRatings.toArray(),
      captureDb.schools.toArray(),
    ]);
    const order = new Map(levels.map((l) => [l.id, l.sort_order]));
    classes.sort((a, b) => (order.get(a.level_id) ?? 0) - (order.get(b.level_id) ?? 0) || a.name.localeCompare(b.name));
    const activeTerm = terms.find((t) => t.is_active) ?? null;
    // One enrollment per learner: this term's, preferring the current one.
    const best = new Map<string, EnrollmentRow>();
    for (const e of enrollments) {
      if (activeTerm && e.term_id !== activeTerm.id) continue;
      const prev = best.get(e.student_id);
      if (!prev || (e.is_current && !prev.is_current)) best.set(e.student_id, e);
    }
    setData({
      term: activeTerm,
      school: schools[0] ?? null,
      classes,
      levels,
      students,
      enrollments: [...best.values()],
      subjects,
      scores,
      areas,
      skills,
      ratings,
    });
  }

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await LookupSyncService.syncAll();
      await load();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  // Show what is on the phone straight away, then (when online) bring it up
  // to date so newly registered learners and scores appear.
  useEffect(() => {
    void load().then(() => {
      if (navigator.onLine) void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const scopeClasses = classId ? data.classes.filter((c) => c.id === classId) : data.classes;
    const classIds = new Set(scopeClasses.map((c) => c.id));
    const studentById = new Map(data.students.map((s) => [s.id, s]));
    const classById = new Map(data.classes.map((c) => [c.id, c]));
    const levelById = new Map(data.levels.map((l) => [l.id, l]));

    const enr = data.enrollments.filter((e) => classIds.has(e.class_id));
    const learners = enr
      .map((e) => ({ s: studentById.get(e.student_id), e }))
      .filter((x): x is { s: StudentRow; e: EnrollmentRow } => !!x.s && x.s.status === "ACTIVE");
    const idSet = new Set(learners.map((l) => l.s.id));

    const male = learners.filter((l) => l.s.gender === "M").length;
    const female = learners.length - male;

    // ages
    const ageMap = new Map<number, { male: number; female: number }>();
    for (const l of learners) {
      const a = ageOf(l.s.date_of_birth);
      if (a == null) continue;
      const row = ageMap.get(a) ?? { male: 0, female: 0 };
      if (l.s.gender === "M") row.male++;
      else row.female++;
      ageMap.set(a, row);
    }
    const ages = [...ageMap.entries()].sort((a, b) => a[0] - b[0]).map(([age, v]) => ({ age, ...v }));

    // scores in scope
    const scopeScores = data.scores.filter((r) => idSet.has(r.student_id));
    const subjName = new Map(data.subjects.map((s) => [s.id, s.name]));
    const bySubject = new Map<string, number[]>();
    const byStudent = new Map<string, number[]>();
    for (const r of scopeScores) {
      const t = total(r);
      if (t == null) continue;
      (bySubject.get(r.subject_id) ?? bySubject.set(r.subject_id, []).get(r.subject_id)!).push(t);
      (byStudent.get(r.student_id) ?? byStudent.set(r.student_id, []).get(r.student_id)!).push(t);
    }
    const subjects = [...bySubject.entries()]
      .map(([id, arr]) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const below = arr.filter((v) => v < PASS_MARK).length;
        return { id, name: subjName.get(id) ?? "Subject", avg, n: arr.length, belowPct: (below / arr.length) * 100 };
      })
      .sort((a, b) => a.avg - b.avg);

    const scoredLearners = learners.filter((l) => levelById.get(l.e.level_id)?.assessment_mode === "scored");
    const entered = scoredLearners.filter((l) => byStudent.has(l.s.id)).length;
    const overallAvg = subjects.length
      ? [...byStudent.values()].flat().reduce((a, b) => a + b, 0) / [...byStudent.values()].flat().length
      : null;

    // learning areas (KG)
    const areaName = new Map(data.areas.map((a) => [a.id, a.name]));
    const skillArea = new Map(data.skills.map((s) => [s.id, s.learning_area_id]));
    const areaStats = new Map<string, { good: number; beginning: number; n: number }>();
    for (const r of data.ratings) {
      if (!idSet.has(r.student_id) || !r.rating || r.rating === "X") continue;
      const aid = skillArea.get(r.skill_id);
      if (!aid) continue;
      const row = areaStats.get(aid) ?? { good: 0, beginning: 0, n: 0 };
      row.n++;
      if (r.rating === "B") row.beginning++;
      else row.good++;
      areaStats.set(aid, row);
    }
    const areas = [...areaStats.entries()]
      .map(([id, v]) => ({ id, name: areaName.get(id) ?? "Area", beginningPct: (v.beginning / v.n) * 100, n: v.n }))
      .sort((a, b) => b.beginningPct - a.beginningPct);

    // per class numbers
    const classRows = scopeClasses.map((c) => {
      const ls = learners.filter((l) => l.e.class_id === c.id);
      const m = ls.filter((l) => l.s.gender === "M").length;
      const ids = new Set(ls.map((l) => l.s.id));
      const vals: number[] = [];
      for (const [sid, arr] of byStudent) if (ids.has(sid)) vals.push(...arr);
      const ages2 = ls.map((l) => ageOf(l.s.date_of_birth)).filter((a): a is number => a != null);
      return {
        id: c.id,
        name: c.name,
        count: ls.length,
        male: m,
        female: ls.length - m,
        avgAge: ages2.length ? ages2.reduce((a, b) => a + b, 0) / ages2.length : null,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        teacher: c.class_teacher_name,
      };
    });

    // attention items
    const attention: { kind: "bad" | "watch" | "info"; title: string; detail: string; chip: string }[] = [];
    for (const s of subjects.filter((x) => x.avg < PASS_MARK).slice(0, 4)) {
      attention.push({
        kind: "bad",
        title: s.name,
        detail: `Average ${s.avg.toFixed(0)} - ${Math.round(s.belowPct)}% of scores are below ${PASS_MARK}.`,
        chip: "Needs attention",
      });
    }
    for (const s of subjects.filter((x) => x.avg >= PASS_MARK && x.avg < WATCH_MARK).slice(0, 3)) {
      attention.push({ kind: "watch", title: s.name, detail: `Average ${s.avg.toFixed(0)} - keep an eye on it.`, chip: "Watch" });
    }
    for (const a of areas.filter((x) => x.beginningPct >= 30).slice(0, 4)) {
      attention.push({
        kind: a.beginningPct >= 50 ? "bad" : "watch",
        title: a.name,
        detail: `${Math.round(a.beginningPct)}% of ratings are "Beginning".`,
        chip: "KG area",
      });
    }
    if (scoredLearners.length > 0 && entered < scoredLearners.length) {
      attention.push({
        kind: "info",
        title: "Scores not entered yet",
        detail: `${scoredLearners.length - entered} of ${scoredLearners.length} learners have no scores recorded.`,
        chip: "Data gap",
      });
    }

    return {
      learners,
      male,
      female,
      ages,
      subjects,
      areas,
      classRows,
      attention,
      overallAvg,
      scoredCount: scoredLearners.length,
      entered,
      byStudent,
      classById,
    };
  }, [data, classId]);

  if (!data || !view) return <p className="text-muted">Loading...</p>;
  if (!data.term) {
    return <div className="alert alert-warning">No data on this phone yet. Open Home and tap "Refresh reference data" while online.</div>;
  }

  const isTeacher = profile?.role === "teacher";
  // A teacher's cached classes are the ones assigned to them, so name them.
  const scopeLabel = classId
    ? data.classes.find((c) => c.id === classId)?.name ?? ""
    : isTeacher
      ? data.classes.map((c) => c.name).join(", ")
      : "Whole school";
  const kpis: { n: number; label: string }[] = [
    { n: view.learners.length, label: "Learners" },
    { n: view.male, label: "Boys" },
    { n: view.female, label: "Girls" },
    { n: view.classRows.length, label: view.classRows.length === 1 ? "Class" : "Classes" },
  ];

  const q = search.trim().toLowerCase();
  const studentRows = view.learners
    .filter(({ s }) => !q || `${s.first_name} ${s.middle_name ?? ""} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q))
    .sort((a, b) => a.s.last_name.localeCompare(b.s.last_name))
    .slice(0, 100);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h1 className="h4 mb-0">Dashboard</h1>
          <p className="text-muted small mb-0">
            {data.school?.name ?? "Your school"} · {data.term.term_name}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </p>
        </div>
        <button className="btn btn-outline-primary btn-sm" disabled={!online || refreshing} onClick={() => void refresh()}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {refreshError && <div className="alert alert-danger py-2 small">{refreshError}</div>}

      {data.classes.length > 1 && (
        <select className="form-select mb-3" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{isTeacher ? "All my classes" : "Whole school"}</option>
          {data.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="cd-kpis">
        {kpis.map((k, i) => (
          <div key={k.label} className="cd-kpi" style={{ "--k1": KPI_GRADIENTS[i][0], "--k2": KPI_GRADIENTS[i][1], animationDelay: `${i * 80}ms` } as CSSProperties}>
            <div className="cd-kpi-num">
              <CaptureCountUp value={k.n} />
            </div>
            <div className="cd-kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="cd-tabs">
        {(["overview", "classes", "students"] as Tab[]).map((t) => (
          <button key={t} className={`cd-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : t === "classes" ? "Class statistics" : "Students"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="actrs-card p-3 mb-3">
            <div className="cd-card-title">Needs attention</div>
            {view.attention.length === 0 ? (
              <p className="text-muted small mb-0">
                {view.subjects.length === 0 && view.areas.length === 0
                  ? "No scores or ratings on this phone yet - highlights appear once assessments are entered."
                  : "Nothing is flagged. Every subject is above the pass mark."}
              </p>
            ) : (
              <div className="cd-attn">
                {view.attention.map((a, i) => (
                  <div key={`${a.title}-${i}`} className={`cd-attn-item ${a.kind === "bad" ? "" : a.kind}`} style={{ animationDelay: `${i * 70}ms` }}>
                    <div className="cd-attn-head">
                      <span className="d-flex align-items-center">
                        <span className="cd-flag" />
                        {a.title}
                      </span>
                      <span className="cd-chip">{a.chip}</span>
                    </div>
                    <div className="small text-muted mt-1">{a.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {view.subjects.length > 0 && (
            <div className="actrs-card p-3 mb-3">
              <div className="cd-card-title">Subject averages (weakest first)</div>
              <HBars
                max={100}
                items={view.subjects.map<BarDatum>((s) => ({
                  label: s.name,
                  value: s.avg,
                  display: s.avg.toFixed(0),
                  color: bandColor(s.avg),
                  sub: `${Math.round(s.belowPct)}% below ${PASS_MARK} · ${s.n} scores`,
                }))}
              />
            </div>
          )}

          {view.areas.length > 0 && (
            <div className="actrs-card p-3 mb-3">
              <div className="cd-card-title">KG learning areas - share rated "Beginning"</div>
              <HBars
                max={100}
                items={view.areas.map<BarDatum>((a) => ({
                  label: a.name,
                  value: a.beginningPct,
                  display: `${Math.round(a.beginningPct)}%`,
                  color: a.beginningPct >= 50 ? COLOR_BAD : a.beginningPct >= 30 ? COLOR_WATCH : COLOR_GOOD,
                  sub: `${a.n} ratings`,
                }))}
              />
            </div>
          )}

          <div className="actrs-card p-3 mb-3">
            <div className="cd-card-title">Boys and girls</div>
            <GenderDonut male={view.male} female={view.female} />
          </div>

          {view.scoredCount > 0 && (
            <div className="actrs-card p-3 mb-3">
              <div className="cd-card-title">Progress</div>
              <div className="cd-gauges">
                <Gauge
                  percent={(view.entered / view.scoredCount) * 100}
                  label="Learners with scores"
                  color={COLOR_MALE}
                />
                {view.overallAvg != null && (
                  <Gauge percent={view.overallAvg} label="Overall average" color={bandColor(view.overallAvg)} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "classes" && (
        <>
          <div className="actrs-card p-3 mb-3">
            <div className="cd-card-title">Learners per class</div>
            <HBars
              items={view.classRows.map<BarDatum>((c) => ({
                label: c.name,
                value: c.count,
                color: COLOR_MALE,
                sub: `${c.male} boys · ${c.female} girls`,
              }))}
            />
          </div>

          <div className="actrs-card p-3 mb-3">
            <div className="cd-card-title">Class numbers</div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">Boys</th>
                    <th className="text-end">Girls</th>
                    <th className="text-end">Avg age</th>
                    <th className="text-end">Avg score</th>
                  </tr>
                </thead>
                <tbody>
                  {view.classRows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        {c.teacher && <div className="small text-muted">{c.teacher}</div>}
                      </td>
                      <td className="text-end fw-semibold">{c.count}</td>
                      <td className="text-end">{c.male}</td>
                      <td className="text-end">{c.female}</td>
                      <td className="text-end">{c.avgAge != null ? c.avgAge.toFixed(1) : "-"}</td>
                      <td className="text-end">
                        {c.avg != null ? <span className="cd-score" style={{ background: bandColor(c.avg) }}>{c.avg.toFixed(0)}</span> : "-"}
                      </td>
                    </tr>
                  ))}
                  <tr className="fw-bold">
                    <td>All</td>
                    <td className="text-end">{view.learners.length}</td>
                    <td className="text-end">{view.male}</td>
                    <td className="text-end">{view.female}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {view.classRows.some((c) => c.avg != null) && (
            <div className="actrs-card p-3 mb-3">
              <div className="cd-card-title">Average score by class</div>
              <HBars
                max={100}
                items={view.classRows
                  .filter((c) => c.avg != null)
                  .map<BarDatum>((c) => ({ label: c.name, value: c.avg ?? 0, display: (c.avg ?? 0).toFixed(0), color: bandColor(c.avg ?? 0) }))}
              />
            </div>
          )}

          <div className="actrs-card p-3 mb-3">
            <div className="cd-card-title">Age spread</div>
            <AgeColumns items={view.ages} />
            <div className="d-flex gap-3 small mt-2">
              <span><span className="cd-dot" style={{ background: COLOR_MALE }} />Boys</span>
              <span><span className="cd-dot" style={{ background: COLOR_FEMALE }} />Girls</span>
            </div>
          </div>
        </>
      )}

      {tab === "students" && (
        <div className="actrs-card p-3 mb-3">
          <div className="cd-card-title">
            Students ({view.learners.length})
          </div>
          <input className="form-control mb-2" placeholder="Search by name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          {studentRows.length === 0 && <p className="text-muted small">No learners to show.</p>}
          {studentRows.map(({ s, e }) => {
            const vals = view.byStudent.get(s.id);
            const avg = vals && vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            return (
              <Link key={s.id} to={`/learners/${s.id}`} className="cd-student">
                <div className="cd-avatar">{s.photo_url && <img src={s.photo_url} alt="" />}</div>
                <div className="flex-grow-1">
                  <div className="fw-semibold">
                    {s.first_name} {s.last_name}
                  </div>
                  <div className="small text-muted">
                    {s.student_id} · {view.classById.get(e.class_id)?.name ?? ""} · {s.gender === "M" ? "Boy" : "Girl"}
                    {ageOf(s.date_of_birth) != null ? ` · ${ageOf(s.date_of_birth)}y` : ""}
                  </div>
                </div>
                {avg != null && (
                  <span className="cd-score" style={{ background: bandColor(avg) }}>
                    {avg.toFixed(0)}
                  </span>
                )}
              </Link>
            );
          })}
          {view.learners.length > studentRows.length && !q && (
            <p className="text-muted small mt-2">Showing the first {studentRows.length}. Use search to find others.</p>
          )}
        </div>
      )}
    </div>
  );
}
