import { useMemo } from "react";
import type { AnswerValue, FormField } from "../../../formsSchema/types";
import { shuffle } from "../../../lib/shuffle";
import { textStyleToCss } from "../../../lib/textStyle";
import { GraphImage } from "../../common/GraphImage";
import { QuestionMedia } from "./QuestionMedia";

/** AnswerValue's array member is `string[] | FileAttachment[]` — multiChoice
 *  only ever deals with the string[] case, so narrow explicitly rather than
 *  a bare Array.isArray (which would admit FileAttachment[] too). */
function isStringArray(value: AnswerValue): value is string[] {
  return Array.isArray(value) && (value.length === 0 || typeof value[0] === "string");
}

interface Props {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

/**
 * Manual-fill field types only for Phase 2/3 — graph-autofill/connector-autofill
 * (read-only, resolved client-side) get their own read-only renderers (Phase 4).
 */
export function FieldRenderer({ field, value, onChange, error }: Props) {
  // Stable per-mount shuffle (not re-shuffled on every keystroke/re-render) —
  // recomputed only if the field identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(
    () => (field.shuffleOptions ? shuffle(field.options ?? []) : field.options ?? []),
    [field.id, field.shuffleOptions]
  );

  const maxLength = field.validation?.maxLength;
  const showCounter =
    maxLength !== undefined &&
    (field.type === "shortText" || field.type === "longText" || field.type === "email" || field.type === "approverEmail");

  return (
    <div className="fill-field">
      <label className="fill-field__label" htmlFor={field.id} style={textStyleToCss(field.labelStyle)}>
        {field.label}
        {field.validation?.required && <span className="fill-field__required-mark">*</span>}
      </label>
      <QuestionMedia field={field} />
      {renderInput(field, value, onChange, options)}
      {showCounter && (
        <span className="fill-field__counter">
          {typeof value === "string" ? value.length : 0}/{maxLength}
        </span>
      )}
      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function renderInput(
  field: FormField,
  value: AnswerValue,
  onChange: (v: AnswerValue) => void,
  options: NonNullable<FormField["options"]>
) {
  switch (field.type) {
    case "shortText":
      return (
        <input
          id={field.id}
          className="fill-field__input"
          type="text"
          maxLength={field.validation?.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "email":
    case "approverEmail":
      return (
        <input
          id={field.id}
          className="fill-field__input"
          type="email"
          maxLength={field.validation?.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "longText":
      return (
        <textarea
          id={field.id}
          className="fill-field__input"
          maxLength={field.validation?.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          id={field.id}
          className="fill-field__input"
          type="number"
          min={field.validation?.min}
          max={field.validation?.max}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );

    case "date":
      return (
        <input
          id={field.id}
          className="fill-field__input"
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "dateTime":
      return (
        <input
          id={field.id}
          className="fill-field__input"
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "rating": {
      const max = 5;
      const current = typeof value === "number" ? value : 0;
      return (
        <div className="rating-stars">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`rating-star ${n <= current ? "is-filled" : ""}`}
              onClick={() => onChange(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
        </div>
      );
    }

    case "singleChoice": {
      const predefined = new Set(options.map((o) => o.value));
      const isOtherSelected = typeof value === "string" && value !== "" ? !predefined.has(value) : false;

      if (field.choiceDisplay === "dropdown") {
        return (
          <div>
            <select
              id={field.id}
              value={isOtherSelected ? "__other__" : typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value === "__other__" ? "" : e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {field.allowOther && <option value="__other__">Other</option>}
            </select>
            {field.allowOther && isOtherSelected && (
              <input
                className="choice-pill__other-input"
                placeholder="Other"
                value={String(value ?? "")}
                onChange={(e) => onChange(e.target.value)}
              />
            )}
          </div>
        );
      }

      return (
        <div>
          {options.map((opt) => (
            <label key={opt.value} className={`choice-pill ${opt.imageUrl ? "choice-pill--media" : ""} ${value === opt.value ? "is-selected" : ""}`}>
              <input type="radio" name={field.id} checked={value === opt.value} onChange={() => onChange(opt.value)} />
              {opt.imageUrl && <GraphImage className="choice-pill__image" src={opt.imageUrl} alt="" />}
              {opt.label}
            </label>
          ))}
          {field.allowOther && (
            <label className={`choice-pill ${isOtherSelected ? "is-selected" : ""}`}>
              <input type="radio" name={field.id} checked={isOtherSelected} onChange={() => onChange("")} />
              <input
                className="choice-pill__other-input"
                placeholder="Other"
                value={isOtherSelected ? String(value) : ""}
                onFocus={() => !isOtherSelected && onChange("")}
                onChange={(e) => onChange(e.target.value)}
              />
            </label>
          )}
        </div>
      );
    }

    case "multiChoice": {
      const selected = isStringArray(value) ? value : [];
      const predefined = new Set(options.map((o) => o.value));
      const otherEntry = selected.find((v) => !predefined.has(v));
      const isOtherChecked = otherEntry !== undefined;
      return (
        <div>
          {options.map((opt) => (
            <label key={opt.value} className={`choice-pill ${opt.imageUrl ? "choice-pill--media" : ""} ${selected.includes(opt.value) ? "is-selected" : ""}`}>
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, opt.value] : selected.filter((v) => v !== opt.value))
                }
              />
              {opt.imageUrl && <GraphImage className="choice-pill__image" src={opt.imageUrl} alt="" />}
              {opt.label}
            </label>
          ))}
          {field.allowOther && (
            <label className={`choice-pill ${isOtherChecked ? "is-selected" : ""}`}>
              <input
                type="checkbox"
                checked={isOtherChecked}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, ""]
                      : selected.filter((v) => predefined.has(v))
                  )
                }
              />
              <input
                className="choice-pill__other-input"
                placeholder="Other"
                value={otherEntry ?? ""}
                onChange={(e) => onChange([...selected.filter((v) => predefined.has(v)), e.target.value])}
              />
            </label>
          )}
        </div>
      );
    }

    default:
      return <p className="error-text">Field type "{field.type}" isn't supported yet.</p>;
  }
}
