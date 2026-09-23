import type { AnswerValue, FormField, RepeatingTableValue } from "../formsSchema/types";

function isRepeatingTableValue(v: AnswerValue): v is RepeatingTableValue {
  return !!v && typeof v === "object" && "rows" in v;
}

/** A static choice field's stored answer is its option `value` (an opaque
 *  key, e.g. "option-1"), not the designer-facing label — resolve it for
 *  display the same way excel.ts's toCellValue does for the Excel export,
 *  so every place an answer is shown to a human agrees. A connector-driven
 *  choice field's answer is already label-based (see
 *  DynamicChoiceField.tsx), so it passes through unchanged (no match in
 *  field.options, which is empty for that field type). */
function resolveOptionLabel(field: FormField, rawValue: string): string {
  return field.options?.find((o) => o.value === rawValue)?.label ?? rawValue;
}

/** Human-readable rendering of any answer value, shared by the read-only
 *  summary, the admin response detail view, and audit-trail diffs. `field`
 *  is optional (audit-trail diffs against a deleted/renamed field may not
 *  have one) — choice-label resolution is simply skipped without it. */
export function formatAnswer(value: AnswerValue, field?: FormField): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (field && (field.type === "singleChoice" || field.type === "multiChoice") && typeof value[0] === "string") {
      return (value as string[]).map((v) => resolveOptionLabel(field, v)).join(", ");
    }
    return value.join(", ");
  }
  if (isRepeatingTableValue(value)) return `${value.rows.length} row(s)`;
  if (field && field.type === "singleChoice" && typeof value === "string") return resolveOptionLabel(field, value);
  return String(value);
}
