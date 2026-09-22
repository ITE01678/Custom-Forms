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

  function toggle(optValue: string) {
    if (isMulti) {
      const current = selected as string[];
      onChange(current.includes(optValue) ? current.filter((v) => v !== optValue) : [...current, optValue]);
    } else {
      onChange(optValue);
    }
  }

  return (
    <div className="fill-field">
      <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
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
        <div>
          {options.map((opt) => {
            const isSelected = isMulti ? (selected as string[]).includes(opt.value) : selected === opt.value;
            return (
              <label key={opt.value} className={`choice-pill ${isSelected ? "is-selected" : ""}`}>
                <input
                  type={isMulti ? "checkbox" : "radio"}
                  name={field.id}
                  checked={isSelected}
                  onChange={() => toggle(opt.value)}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}

      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
