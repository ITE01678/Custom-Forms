import { useAutofill } from "./useAutofill";
import { QuestionMedia } from "./QuestionMedia";
import { textStyleToCss } from "../../../lib/textStyle";
import type { AnswerValue, FormField } from "../../../formsSchema/types";

interface Props {
  field: FormField;
  respondentEmail: string;
  priorAnswers: Record<string, AnswerValue>;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

/**
 * A choice field (single or multi) whose OPTIONS come from a connector
 * lookup instead of the designer's static list — e.g. "find every employee
 * whose HOD Mail matches the signed-in respondent, let them pick which
 * ones." The number of options naturally tracks how many rows the
 * connector resolves (a manager with 5 reports sees 5 checkboxes, one with
 * 3 sees 3) since they're recomputed fresh from `rows` on every resolution.
 * Unlike AutofillField, the resolved rows are never auto-applied as the
 * answer — they only populate what's selectable; the respondent's actual
 * picks are a normal interactive answer, same shape as a static choice
 * field's.
 */
export function DynamicChoiceField({ field, respondentEmail, priorAnswers, value, onChange, error }: Props) {
  const { status, rows, error: autofillError, retry } = useAutofill(field, respondentEmail, priorAnswers);
  const dyn = field.connectorAutofill?.dynamicOptions;
  const isMulti = field.type === "multiChoice";

  const options = dyn
    ? rows
        .map((r) => ({ value: String(r[dyn.valueKey] ?? ""), label: String(r[dyn.labelKey] ?? "") }))
        .filter((o) => o.value)
    : [];

  const selected = isMulti ? (Array.isArray(value) ? (value as string[]).filter((v) => typeof v === "string") : []) : typeof value === "string" ? value : "";

  // The stored answer is the option's LABEL, not its `value` (e.g. the
  // employee's name, not their email) — connector-resolved rows are live
  // data, gone by the time the response is written to Excel, so there's no
  // way to reverse a stored value back into a human-readable label at
  // export time (unlike a static choice field's fixed field.options, which
  // toCellValue/fromCellValue in excel.ts CAN safely round-trip). Using the
  // label as the answer itself sidesteps that entirely, at the cost of not
  // separately capturing a stable id (e.g. email) for this answer.
  function toggle(opt: { value: string; label: string }) {
    if (isMulti) {
      const current = selected as string[];
      onChange(current.includes(opt.label) ? current.filter((v) => v !== opt.label) : [...current, opt.label]);
    } else {
      onChange(opt.label);
    }
  }

  return (
    <div className="fill-field">
      <label className="fill-field__label" htmlFor={field.id} style={textStyleToCss(field.labelStyle)}>
        {field.label}
        {field.validation?.required && <span className="fill-field__required-mark">*</span>}
        <span className="autofill-badge">
          <span className="autofill-badge__dot" />
          auto-fill
        </span>
      </label>
      <QuestionMedia field={field} />

      {status === "loading" && <p className="fill-field__help">Loading…</p>}
      {status === "error" && (
        <div className="error-text">
          Couldn't load options{autofillError ? `: ${autofillError}` : "."} <button onClick={retry}>Retry</button>
        </div>
      )}
      {status === "empty" && <p className="fill-field__help">No matching records found.</p>}
      {(status === "resolved" || status === "empty") && options.length > 0 && (
        <>
          {!isMulti && field.choiceDisplay === "dropdown" ? (
            <select id={field.id} className="fill-field__input" value={selected as string} onChange={(e) => onChange(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div>
              {options.map((opt) => {
                const isSelected = isMulti ? (selected as string[]).includes(opt.label) : selected === opt.label;
                return (
                  <label key={opt.value} className={`choice-pill ${isSelected ? "is-selected" : ""}`}>
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name={field.id}
                      checked={isSelected}
                      onChange={() => toggle(opt)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}

      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
