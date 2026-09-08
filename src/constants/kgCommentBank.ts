/**
 * Quick-fill phrases for KG's single "General Comments" box (item 9 of
 * the KG report redesign) - combines the tone of a scored level's two
 * separate remarks (Class Teacher's + Headteacher's) into one bank,
 * since KG's official form has only one comments field. Picking an
 * entry fills the textarea on CloudReportRemarksEntry; the teacher can
 * still edit or replace it freely - this is a starting point, not a
 * locked value. No settings screen manages this list yet (nothing in
 * the cloud app has a remarks bank at all today - see RemarksBank.ts,
 * which is the offline ACTRS app's equivalent and isn't wired up
 * here); a school wanting to add its own phrases is a natural, small
 * follow-up once this is in real use.
 */
export const KG_GENERAL_COMMENT_BANK: string[] = [
  "A confident and enthusiastic learner who works well independently.",
  "Shows real curiosity and asks thoughtful questions during lessons.",
  "Works well with classmates and shares readily during group activities.",
  "Has made steady progress this term across most learning areas.",
  "A pleasure to teach - attentive, respectful, and eager to participate.",
  "Needs more encouragement to speak up and join group discussions.",
  "Settling in well; still needs support to complete tasks independently.",
  "Would benefit from more practice with fine motor and writing skills.",
  "Sometimes finds it hard to sit still and focus for the full activity time.",
  "Needs more support building confidence in Numeracy activities.",
  "Improving steadily - keep up the encouragement and practice at home.",
  "A caring and helpful classmate who is well liked by peers.",
  "Follows instructions well and completes activities with minimal guidance.",
  "Punctual and regular in attendance; this consistency is helping progress.",
];
