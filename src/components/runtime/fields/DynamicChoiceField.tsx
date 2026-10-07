import { useState } from "react";
import { useAutofill } from "./useAutofill";
import { QuestionMedia } from "./QuestionMedia";
import { textStyleToCss } from "../../../lib/textStyle";
import type { AnswerValue, FormField } from "../../../formsSchema/types";

// Common identity-ish column names, checked against the RAW resolved row —
// NOT the designer's chosen valueKey. A designer very reasonably sets
// valueKey/labelKey to the same display-friendly column (e.g. "displayName"
// for both, so the stored answer and the picker both show a name, not an
// email) — matching respondentEmail against THAT would never work, since a
// display name is never an email. graph-directReports/graph-profile rows
// always carry `mail`/`userPrincipalName` regardless of what the designer
// picked for display; excel-lookup/sharepoint-list-query rows carry
// whatever header names the source sheet/list happens to use, so this list
// covers the common spellings but isn't exhaustive.
const RESPONDENT_IDENTITY_KEYS = ["mail", "userPrincipalName", "email", "Email", "UPN", "upn", "EmployeeMail"];

function rowMatchesRespondent(row: Record<string, unknown>, respondentEmail: string): boolean {
  const target = respondentEmail.trim().toLowerCase();
  if (!target) return false;
  return RESPONDENT_IDENTITY_KEYS.some((key) => {
    const v = row[key];
    return typeof v === "string" && v.trim().toLowerCase() === target;
  });
}

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
  const includeRespondent = !!field.connectorAutofill?.includeRespondentAsOption;

  const connectorOptions = dyn
    ? rows
        // A "team roster" lookup naturally includes the respondent's own
        // row (they're a member of their own team) — excluded by default
        // (see ConnectorAutofillConfig.includeRespondentAsOption's doc
        // comment). Filtered on the RAW row's own identity fields, not the
        // designer's chosen valueKey — see rowMatchesRespondent's comment
        // for why (valueKey is very often "displayName", which is never
        // an email, so comparing against it silently never matched).
        .filter((r) => includeRespondent || !rowMatchesRespondent(r, respondentEmail))
        .map((r) => ({ value: String(r[dyn.valueKey] ?? ""), label: String(r[dyn.labelKey] ?? "") }))
        .filter((o) => o.value)
    : [];

  // Manual fallback entries (field.options, the builder's static-options
  // editor) — for anyone the connector can't find at all, e.g. someone
  // with no official email/Entra account, so no connector could ever
  // resolve a row for them. Appended after the connector's own results,
  // skipping anything whose label the connector already produced so a
  // manually-added entry that's ALSO found by the connector doesn't show
  // up twice.
  const seenLabels = new Set(connectorOptions.map((o) => o.label.trim().toLowerCase()));
  const manualOptions = (field.options ?? [])
    .map((o) => ({ value: o.value, label: o.label }))
    .filter((o) => !seenLabels.has(o.label.trim().toLowerCase()));

  const options = [...connectorOptions, ...manualOptions];

  const selected = isMulti ? (Array.isArray(value) ? (value as string[]).filter((v) => typeof v === "string") : []) : typeof value === "string" ? value : "";

  // Entries the RESPONDENT typed in themselves (via the "someone not
  // listed" box below) — per-response, unlike manualOptions above which
  // are the same fixed list for every respondent. Solves the case a fixed
  // builder list can't: each HOD's team is different (HOD A might need to
  // add "D", HOD P might need "R" and "S"), so there's no single static
  // list that fits everyone. Derived from `selected` itself (any label
  // that doesn't match a known option) rather than separate state, so a
  // previously-added custom name keeps showing up — and stays checked —
  // across remounts (resuming a saved draft, admin review, etc.) with no
  // extra plumbing.
  const knownLabelsLower = new Set(options.map((o) => o.label.trim().toLowerCase()));
  const customSelectedLabels = isMulti
    ? (selected as string[]).filter((l) => !knownLabelsLower.has(l.trim().toLowerCase()))
    : typeof selected === "string" && selected && !knownLabelsLower.has(selected.trim().toLowerCase())
      ? [selected]
      : [];
  const displayOptions = [...options, ...customSelectedLabels.map((l) => ({ value: l, label: l }))];

  const [customText, setCustomText] = useState("");

  function addCustom() {
    const name = customText.trim();
    if (!name) return;
    if (isMulti) {
      const current = selected as string[];
      if (!current.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...current, name]);
    } else {
      onChange(name);
    }
    setCustomText("");
  }

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
      {status === "empty" && displayOptions.length === 0 && <p className="fill-field__help">No matching records found.</p>}
      {(status === "resolved" || status === "empty") && displayOptions.length > 0 && (
        <>
          {!isMulti && field.choiceDisplay === "dropdown" ? (
            <select id={field.id} className="fill-field__input" value={selected as string} onChange={(e) => onChange(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {displayOptions.map((opt) => (
                <option key={opt.value} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div>
              {displayOptions.map((opt) => {
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

      {field.allowOther && status !== "loading" && (
        <div className="choice-other-adder">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Someone not listed (e.g. no official email)…"
          />
          <button type="button" onClick={addCustom} disabled={!customText.trim()}>
            + Add
          </button>
        </div>
      )}

      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
