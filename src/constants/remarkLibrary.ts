/**
 * Standard remark libraries and text-combining rules for the five free-text
 * report-card fields on a scored level (Lower Primary, Upper Primary, JHS):
 *
 *   Class teacher's remark, Headteacher's remark, Interest, Attitude, Conduct.
 *
 * Everything is still STORED as ordinary text in the same columns as before
 * (class_teacher_remark, headteacher_remark, interest_remark, attitude_remark,
 * conduct_remark) - so saved reports, printing, PDFs, SMS summaries and the
 * offline sync are unchanged. This file only decides (a) which options exist
 * and (b) how several chosen options are joined into that one text value, and
 * how a saved text value is read back into its chosen options for editing.
 *
 * Kept identical in the web app and the capture app.
 */

export type RemarkKind = "class_teacher" | "headteacher" | "interest" | "attitude" | "conduct_support";

export interface RemarkGroup {
  heading: string;
  items: string[];
}

/* ----------------------------------------------------------------------- */
/* Class teacher's remark                                                  */
/* ----------------------------------------------------------------------- */

export const CLASS_TEACHER_GROUPS: RemarkGroup[] = [
  {
    heading: "Remarks",
    items: [
      "An excellent learner who consistently demonstrates a high level of academic achievement.",
      "A very hardworking learner who takes learning seriously.",
      "A bright learner who demonstrates a good understanding of concepts taught.",
      "A conscientious learner who completes assigned tasks diligently.",
      "A regular and active participant in class activities.",
      "Has made remarkable progress this term.",
      "Has shown steady improvement in academic performance.",
      "Performs well and is encouraged to maintain this standard.",
      "Has the potential to achieve more with sustained effort.",
      "Needs to devote more time to personal studies.",
      "Needs to participate more actively in classroom activities.",
      "Needs to improve concentration during lessons.",
      "Should complete and submit assignments on time.",
      "Needs additional support and consistent practice to improve performance.",
      "Has difficulty understanding some concepts and requires further guidance.",
      "Needs to develop better study habits.",
      "Is making progress but needs to be more consistent in performance.",
      "Shows promise but does not always work to full potential.",
      "Needs to take greater responsibility for learning.",
      "Should maintain regular attendance to improve learning outcomes.",
      "Is a cooperative learner who relates well with classmates.",
      "Demonstrates leadership potential and contributes positively to class activities.",
      "Is creative and shows initiative when completing tasks.",
      "Needs to improve time management and task completion.",
      "A promising learner whose continued progress will depend on sustained effort and support.",
    ],
  },
  {
    heading: "Earlier options (kept from the previous list)",
    items: [
      "An excellent term's work. Keep it up!",
      "A very good performance this term.",
      "A good result; can still improve with more effort.",
      "A fair performance; more effort is needed next term.",
      "A weak performance; needs to work much harder.",
      "Shows steady improvement over the term.",
      "Capable of doing better with more commitment.",
      "A pleasure to teach; keep up the good work.",
      "Needs extra support in some subjects next term.",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/* Headteacher's remark                                                    */
/* ----------------------------------------------------------------------- */

export const HEADTEACHER_GROUPS: RemarkGroup[] = [
  {
    heading: "Remarks",
    items: [
      "An excellent performance. Keep it up.",
      "Commendable performance. Maintain this high standard.",
      "A very promising learner. Continue to strive for excellence.",
      "Good performance. Greater effort will yield even better results.",
      "A satisfactory performance. Keep working hard.",
      "Shows good potential for further academic growth.",
      "Encouraged to maintain discipline and consistency in learning.",
      "Needs to put in more effort to improve overall performance.",
      "Must take personal studies more seriously.",
      "Greater commitment to academic work is required.",
      "Needs to improve punctuality and regular school attendance.",
      "Regular attendance and active participation will improve performance.",
      "Should pay greater attention to the class teacher's guidance.",
      "Needs to demonstrate greater responsibility in academic work and conduct.",
      "Parents and guardians are encouraged to support learning at home.",
      "Parents should monitor homework and encourage regular reading.",
      "Continued cooperation between the school and home is encouraged.",
      "Has demonstrated commendable progress during the term.",
      "Needs additional guidance and support to reach expected learning outcomes.",
      "Should work towards achieving a more balanced performance across subjects.",
      "A well-behaved learner who contributes positively to the school community.",
      "Demonstrates good leadership qualities and a sense of responsibility.",
      "Needs to improve consistency in both academic work and personal conduct.",
      "I wish the learner continued success in the next academic term.",
      "Congratulations on a successful term. Continue to aim higher.",
      "There is room for improvement. Greater effort and parental support are encouraged.",
      "The learner is encouraged to set clear academic goals and work diligently towards them.",
      "The learner's progress is encouraging; continued effort will be important next term.",
      "May the learner continue to grow academically, socially and morally.",
    ],
  },
  {
    // "Promoted to the next class." from the old list is intentionally NOT
    // here: promotion is recorded in the separate "Promoted to" field, from
    // actual school records, never asserted by a comment.
    heading: "Earlier options (kept from the previous list)",
    items: [
      "Excellent result. Congratulations!",
      "Very good performance. Well done.",
      "Good performance. Keep working hard.",
      "Fair result; more effort is expected next term.",
      "Below expectation; needs to put in more effort.",
      "A commendable result this term.",
      "Must improve punctuality and regularity next term.",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/* Interest (short activity labels)                                        */
/* ----------------------------------------------------------------------- */

export const INTEREST_GROUPS: RemarkGroup[] = [
  {
    heading: "Academic and intellectual interests",
    items: [
      "Reading", "Creative Writing", "Storytelling", "Drawing and Colouring", "Puzzles", "Mathematics Activities",
      "Science Experiments", "Computer Activities", "Research", "Debating", "Public Speaking", "Quizzes",
      "Spelling Activities", "Learning New Skills",
    ],
  },
  {
    heading: "Sports and physical activities",
    items: [
      "Soccer", "Athletics", "Basketball", "Volleyball", "Handball", "Netball", "Table Tennis", "Skipping",
      "Dancing", "Swimming", "Gymnastics", "Sports in General", "Outdoor Games",
    ],
  },
  {
    heading: "Creative and performing arts",
    items: [
      "Singing", "Music", "Playing Musical Instruments", "Drama", "Acting", "Painting", "Craftwork", "Beadwork",
      "Sewing", "Modelling", "Poetry", "Traditional Cultural Activities",
    ],
  },
  {
    heading: "Social and practical interests",
    items: [
      "Group Activities", "Making Friends", "Conversation", "Helping Others", "Community Activities", "Gardening",
      "Farming", "Cooking", "Building and Construction", "Repairing Objects", "Nature Exploration",
      "Caring for Animals", "Leadership Activities", "Organising Events",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/* Attitude (behaviour statements, written in sentence case so they join   */
/* naturally: "Cooperative with others; respectful towards ...")           */
/* ----------------------------------------------------------------------- */

export const ATTITUDE_GROUPS: RemarkGroup[] = [
  {
    heading: "Positive interpersonal attitudes",
    items: [
      "Respectful towards teachers and peers", "Tolerant of differing opinions", "Cooperative with others",
      "Kind and considerate", "Helpful to classmates", "Empathetic towards others", "Friendly and approachable",
      "Shares resources willingly", "Accepts others regardless of background", "Works well in a team",
      "Shows patience with others", "Resolves disagreements peacefully",
    ],
  },
  {
    heading: "Learning and work attitudes",
    items: [
      "Eager to learn", "Attentive during lessons", "Curious and inquisitive", "Takes initiative",
      "Works independently", "Works well with guidance", "Perseveres when faced with challenges",
      "Accepts correction positively", "Willing to try new tasks", "Completes tasks responsibly",
      "Demonstrates self-motivation", "Shows creativity and initiative", "Participates actively in lessons",
      "Takes responsibility for mistakes",
    ],
  },
  {
    heading: "Self-management and emotional development",
    items: [
      "Demonstrates self-control", "Shows patience", "Manages emotions appropriately", "Demonstrates resilience",
      "Displays confidence", "Shows humility", "Accepts feedback constructively", "Demonstrates self-discipline",
      "Adapts well to changes", "Shows perseverance", "Demonstrates honesty", "Is considerate of others' feelings",
    ],
  },
  {
    heading: "Areas requiring development",
    items: [
      "Needs to improve attentiveness", "Needs encouragement to participate", "Needs support to work independently",
      "Needs to cooperate more with peers", "Needs to be more tolerant of differing opinions",
      "Needs to accept correction positively", "Needs to develop greater self-confidence",
      "Needs to demonstrate more patience", "Needs to manage emotions more appropriately",
      "Needs to take greater responsibility for tasks", "Needs to show more initiative",
      "Needs to improve perseverance", "Needs to respect others' contributions",
      "Needs to develop better teamwork skills", "Needs to become more receptive to feedback",
    ],
  },
  {
    // The old Interest and Attitude quick-fill lines described attitudes to
    // learning rather than activities, so they live here, under Attitude.
    heading: "Earlier options (kept from the previous lists)",
    items: [
      "Excellent attitude towards work and peers", "Very cooperative and hardworking",
      "Positive attitude towards learning", "Attitude towards work is satisfactory", "Attitude needs improvement",
      "Often reluctant to participate", "Must take schoolwork more seriously",
      "Cooperates well with classmates and teachers", "Shows a great deal of initiative",
      "Shows outstanding interest in all subjects", "Very enthusiastic and eager to learn",
      "Shows keen interest in class activities", "Interest in schoolwork is satisfactory",
      "Shows interest only in a few subjects", "Needs to show more interest in schoolwork",
      "Easily distracted; must concentrate more",
      "Participates actively in class and extra-curricular activities", "Curious and asks thoughtful questions",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/* Conduct: ONE overall rating + optional supporting remarks               */
/* ----------------------------------------------------------------------- */

export interface ConductRating {
  label: string;
  description: string;
}

export const CONDUCT_RATINGS: ConductRating[] = [
  { label: "Excellent", description: "Consistently demonstrates exemplary behaviour and responsibility." },
  { label: "Very Good", description: "Demonstrates commendable behaviour and respects school rules." },
  { label: "Good", description: "Generally behaves well and meets expected standards." },
  { label: "Satisfactory", description: "Behaviour meets acceptable school expectations." },
  { label: "Quite Satisfactory", description: "Behaviour is generally acceptable, with some areas requiring improvement." },
  { label: "Fairly Satisfactory", description: "Demonstrates acceptable behaviour but needs greater consistency." },
  { label: "Needs Improvement", description: "Needs to improve adherence to school rules and behavioural expectations." },
  { label: "Requires Guidance", description: "Would benefit from continued guidance and support in developing positive behaviour." },
  { label: "Unsatisfactory", description: "Behaviour falls below expected standards and requires appropriate intervention." },
];

export const CONDUCT_SUPPORT_GROUPS: RemarkGroup[] = [
  {
    heading: "Supporting remarks (optional)",
    items: [
      "Observes school rules and regulations.",
      "Demonstrates respect for teachers, staff and fellow learners.",
      "Is punctual and responsible.",
      "Takes good care of school property and learning materials.",
      "Demonstrates honesty and integrity.",
      "Interacts peacefully with others.",
      "Needs to improve punctuality and adherence to school routines.",
      "Needs reminders to follow classroom and school rules.",
      "Needs to take greater responsibility for personal actions.",
      "Needs to demonstrate greater respect for others' rights and belongings.",
      "Needs to improve cooperation and peaceful conflict resolution.",
      "Is encouraged to demonstrate greater self-discipline.",
      "Needs to take better care of school property.",
      "Has shown improvement in behaviour during the term.",
      "Is encouraged to sustain positive behavioural changes.",
    ],
  },
  {
    heading: "Earlier options (kept from the previous list)",
    items: [
      "Exemplary conduct at all times.",
      "Very well behaved and respectful.",
      "Well behaved.",
      "Conduct is satisfactory.",
      "Conduct is fair; needs closer supervision.",
      "Often disruptive in class.",
      "Must improve conduct considerably.",
      "Respects school rules and authority.",
      "A good role model to peers.",
    ],
  },
];

export const GROUPS_BY_KIND: Record<RemarkKind, RemarkGroup[]> = {
  class_teacher: CLASS_TEACHER_GROUPS,
  headteacher: HEADTEACHER_GROUPS,
  interest: INTEREST_GROUPS,
  attitude: ATTITUDE_GROUPS,
  conduct_support: CONDUCT_SUPPORT_GROUPS,
};

/* ----------------------------------------------------------------------- */
/* Text helpers                                                            */
/* ----------------------------------------------------------------------- */

/** Comparison key: ignores case, spacing and a trailing full stop/semicolon. */
export function normKey(s: string): string {
  return s.trim().replace(/[\s.;,]+$/g, "").replace(/\s+/g, " ").toLowerCase();
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const k = normKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function flat(kind: RemarkKind): string[] {
  return GROUPS_BY_KIND[kind].flatMap((g) => g.items);
}

const knownKeyCache: Partial<Record<RemarkKind, Set<string>>> = {};
function isKnown(kind: RemarkKind, text: string): boolean {
  let set = knownKeyCache[kind];
  if (!set) {
    set = new Set(flat(kind).map(normKey));
    knownKeyCache[kind] = set;
  }
  return set.has(normKey(text));
}

function stripEndPunct(s: string): string {
  return s.trim().replace(/[\s.;,]+$/g, "");
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
function upperFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ----------------------------------------------------------------------- */
/* Combine several chosen options into the one saved text                  */
/* ----------------------------------------------------------------------- */

/**
 * - interest:        "Reading" / "Reading and Soccer" / "Reading, Soccer and Singing"
 * - attitude:        "Cooperative with others; respectful towards teachers and peers."
 * - class_teacher /
 *   headteacher /
 *   conduct_support: complete sentences, joined with a single space.
 */
export function combineItems(kind: RemarkKind, items: string[]): string {
  const list = dedupe(items);
  if (list.length === 0) return "";

  if (kind === "interest") {
    const labels = list.map(stripEndPunct).filter(Boolean);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }

  if (kind === "attitude") {
    const parts = list
      .map(stripEndPunct)
      .filter(Boolean)
      .map((t, i) => {
        // Only the library's own wording is re-cased; a teacher's own text is left exactly as typed.
        if (!isKnown(kind, t)) return t;
        return i === 0 ? upperFirst(t) : lowerFirst(t);
      });
    return `${parts.join("; ")}.`;
  }

  // Complete sentences: keep each as written, make sure each ends properly.
  return list.map((t) => (/[.!?]$/.test(t) ? t : `${t}.`)).join(" ");
}

/* ----------------------------------------------------------------------- */
/* Read a saved text value back into its chosen options                    */
/* ----------------------------------------------------------------------- */

const BOUNDARY = /[\s,;.!?]/;

/**
 * Splits saved text into chips: known library options are recognised
 * (case-insensitively); anything else - older free text, or something the
 * teacher typed - is kept verbatim as its own custom chip, in its original
 * position. Nothing is ever dropped.
 */
export function parseItems(kind: RemarkKind, value: string | null | undefined): { text: string; custom: boolean }[] {
  const text = (value ?? "").trim();
  if (!text) return [];
  const lower = text.toLowerCase();

  const known = dedupe(flat(kind)).sort((a, b) => b.length - a.length);
  const taken: { start: number; end: number; item: string }[] = [];

  for (const item of known) {
    const needle = stripEndPunct(item).toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      const before = at === 0 ? " " : lower.charAt(at - 1);
      const after = end >= lower.length ? " " : lower.charAt(end);
      const overlaps = taken.some((t) => at < t.end && end > t.start);
      if (!overlaps && BOUNDARY.test(before) && BOUNDARY.test(after)) {
        taken.push({ start: at, end, item });
        break;
      }
      from = at + 1;
    }
  }

  taken.sort((a, b) => a.start - b.start);

  const chips: { text: string; custom: boolean }[] = [];
  let cursor = 0;
  const pushGap = (raw: string) => {
    let g = raw.replace(/^[\s,;.]+|[\s,;]+$/g, "");
    if (kind === "interest") g = g.replace(/^and\s+/i, "").replace(/\s+and$/i, "").replace(/^and$/i, "");
    g = g.trim();
    if (g) chips.push({ text: g, custom: true });
  };
  for (const t of taken) {
    pushGap(text.slice(cursor, t.start));
    chips.push({ text: t.item, custom: false });
    cursor = t.end;
  }
  pushGap(text.slice(cursor));
  return chips;
}

/* ----------------------------------------------------------------------- */
/* Conduct: rating + supporting remarks                                    */
/* ----------------------------------------------------------------------- */

export function combineConduct(rating: string, supporting: string[]): string {
  const support = combineItems("conduct_support", supporting);
  const r = rating.trim();
  if (!r) return support;
  return support ? `${r}. ${support}` : r;
}

export function parseConduct(value: string | null | undefined): { rating: string; supporting: { text: string; custom: boolean }[] } {
  const v = (value ?? "").trim();
  if (!v) return { rating: "", supporting: [] };
  const lower = v.toLowerCase();
  const ordered = [...CONDUCT_RATINGS].sort((a, b) => b.label.length - a.label.length);
  for (const r of ordered) {
    const l = r.label.toLowerCase();
    if (lower.startsWith(l)) {
      const next = lower.charAt(l.length);
      if (next === "" || next === "." || next === "," || next === ";") {
        const rest = v.slice(l.length).replace(/^[\s.,;:-]+/, "");
        return { rating: r.label, supporting: parseItems("conduct_support", rest) };
      }
    }
  }
  return { rating: "", supporting: parseItems("conduct_support", v) };
}

/* Flat lists (used by the sample report and anything that needs a plain list) */
export const flatOptions = flat;
