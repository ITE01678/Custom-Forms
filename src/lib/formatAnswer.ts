import type { AnswerValue, RepeatingTableValue } from "../formsSchema/types";

function isRepeatingTableValue(v: AnswerValue): v is RepeatingTableValue {
  return !!v && typeof v === "object" && "rows" in v;
}

/** Human-readable rendering of any answer value, shared by the read-only
 *  summary, the admin response detail view, and audit-trail diffs. */
export function formatAnswer(value: AnswerValue): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (isRepeatingTableValue(value)) return `${value.rows.length} row(s)`;
  return String(value);
}
