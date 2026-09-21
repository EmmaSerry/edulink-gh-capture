/**
 * Quick-fill comment banks for the five free-text remark fields on a
 * SCORED level's (Lower Primary, Upper Primary, JHS) report record -
 * Conduct, Interest, Attitude, Class teacher's remark, Headteacher's
 * remark. Mirrors KG_GENERAL_COMMENT_BANK's pattern exactly (see
 * kgCommentBank.ts): a dropdown offers these as a starting point, but
 * every field stays a normal free-text input underneath, so typing a
 * remark that isn't in this list works exactly as it always has -
 * nothing here is a restriction, only a shortcut.
 *
 * Kept identical to the cloud app's copy of this same file so a report
 * looks the same whichever app it was filled in from.
 */

export const CONDUCT_COMMENT_BANK: string[] = [
  "Exemplary conduct at all times.",
  "Very well behaved and respectful.",
  "Well behaved.",
  "Conduct is satisfactory.",
  "Conduct is fair; needs closer supervision.",
  "Often disruptive in class.",
  "Must improve conduct considerably.",
  "Respects school rules and authority.",
  "A good role model to peers.",
];

export const INTEREST_COMMENT_BANK: string[] = [
  "Shows outstanding interest in all subjects.",
  "Very enthusiastic and eager to learn.",
  "Shows keen interest in class activities.",
  "Interest in schoolwork is satisfactory.",
  "Shows interest only in a few subjects.",
  "Needs to show more interest in schoolwork.",
  "Easily distracted; must concentrate more.",
  "Participates actively in class and extra-curricular activities.",
  "Curious and asks thoughtful questions.",
];

export const ATTITUDE_COMMENT_BANK: string[] = [
  "Excellent attitude towards work and peers.",
  "Very cooperative and hardworking.",
  "Positive attitude towards learning.",
  "Attitude towards work is satisfactory.",
  "Attitude needs improvement.",
  "Often reluctant to participate.",
  "Must take schoolwork more seriously.",
  "Cooperates well with classmates and teachers.",
  "Shows a great deal of initiative.",
];

export const CLASS_TEACHER_REMARK_BANK: string[] = [
  "An excellent term's work. Keep it up!",
  "A very good performance this term.",
  "A good result; can still improve with more effort.",
  "A fair performance; more effort is needed next term.",
  "A weak performance; needs to work much harder.",
  "Shows steady improvement over the term.",
  "Capable of doing better with more commitment.",
  "A pleasure to teach; keep up the good work.",
  "Needs extra support in some subjects next term.",
];

export const HEADTEACHER_REMARK_BANK: string[] = [
  "Excellent result. Congratulations!",
  "Very good performance. Well done.",
  "Good performance. Keep working hard.",
  "Fair result; more effort is expected next term.",
  "Below expectation; needs to put in more effort.",
  "Promoted to the next class.",
  "A commendable result this term.",
  "Must improve punctuality and regularity next term.",
];
