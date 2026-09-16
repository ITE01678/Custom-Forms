import { useEffect, useState } from "react";
import { useAutofill } from "./useAutofill";
import type { AnswerValue, FormField } from "../../../formsSchema/types";

interface Props {
  field: FormField;
  respondentEmail: string;
  priorAnswers: Record<string, AnswerValue>;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

/** Renders a graph-autofill or connector-autofill SCALAR field: a glowing
 *  "auto-fill" badge, loading/empty/error states, and — unless the field's
 *  config explicitly disables it — an Auto/Manual toggle so the respondent
 *  can override the resolved value with their own entry. Repeating connector
 *  fields use ConnectorTableField instead. */
export function AutofillField({ field, respondentEmail, priorAnswers, onChange, error }: Props) {
  const { status, rows, error: autofillError, retry } = useAutofill(field, respondentEmail, priorAnswers);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualValue, setManualValue] = useState("");

  const allowOverride =
    field.fillMode === "graph-autofill"
      ? field.graphAutofill?.allowManualOverride !== false
      : field.connectorAutofill?.allowManualOverride !== false;

  const outputKey = field.fillMode === "graph-autofill" ? "value" : field.connectorAutofill?.outputMapping[0]?.key ?? "value";
  const resolvedValue = rows[0]?.[outputKey];

  useEffect(() => {
    if (mode !== "auto") return;
    if (status === "resolved") onChange((resolvedValue as AnswerValue) ?? null);
    else if (status === "empty") onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, resolvedValue, mode]);

  function switchToManual() {
    const seed = typeof resolvedValue === "string" || typeof resolvedValue === "number" ? String(resolvedValue) : "";
    setManualValue(seed);
    setMode("manual");
    onChange(seed || null);
  }

  function switchToAuto() {
    setMode("auto");
    retry();
  }

  return (
    <div className="fill-field">
      <label className="fill-field__label">
        {field.label}
        {field.validation?.required && <span className="fill-field__required-mark">*</span>}
        <span className="autofill-badge">
          <span className="autofill-badge__dot" />
          auto-fill
        </span>
        {allowOverride && (
          <span className="fill-source-toggle">
            <button type="button" className={mode === "auto" ? "is-active" : ""} onClick={switchToAuto}>
              Auto
            </button>
            <button type="button" className={mode === "manual" ? "is-active" : ""} onClick={switchToManual}>
              Manual
            </button>
          </span>
        )}
      </label>

      {mode === "manual" ? (
        <input
          className="fill-field__input"
          type="text"
          value={manualValue}
          onChange={(e) => {
            setManualValue(e.target.value);
            onChange(e.target.value);
          }}
        />
      ) : (
        <>
          {status === "loading" && <p className="fill-field__help">Loading…</p>}
          {status === "resolved" && <p className="fill-field__autofill-value">{String(resolvedValue ?? "—")}</p>}
          {status === "empty" && (
            <p className="fill-field__help">
              No value found{allowOverride ? " — switch to Manual to fill this in." : "."}
            </p>
          )}
          {status === "error" && (
            <div className="error-text">
              Couldn't load this value{autofillError ? `: ${autofillError}` : "."} <button onClick={retry}>Retry</button>
            </div>
          )}
        </>
      )}

      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
