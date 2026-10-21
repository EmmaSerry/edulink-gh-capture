/**
 * Flat lists derived from the standard remark library (remarkLibrary.ts).
 * Kept so existing imports (e.g. the sample report preview) keep working.
 * The Remarks & attendance screens now use the searchable pickers instead.
 */
import {
  CONDUCT_RATINGS,
  CLASS_TEACHER_GROUPS,
  HEADTEACHER_GROUPS,
  INTEREST_GROUPS,
  ATTITUDE_GROUPS,
} from "./remarkLibrary";

export const CONDUCT_COMMENT_BANK: string[] = CONDUCT_RATINGS.map((r) => r.label);
export const INTEREST_COMMENT_BANK: string[] = INTEREST_GROUPS.flatMap((g) => g.items);
export const ATTITUDE_COMMENT_BANK: string[] = ATTITUDE_GROUPS.flatMap((g) => g.items);
export const CLASS_TEACHER_REMARK_BANK: string[] = CLASS_TEACHER_GROUPS.flatMap((g) => g.items);
export const HEADTEACHER_REMARK_BANK: string[] = HEADTEACHER_GROUPS.flatMap((g) => g.items);
