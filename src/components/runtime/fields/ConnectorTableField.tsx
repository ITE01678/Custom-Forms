import { useState } from "react";
import { useEffect } from "react";
import { useAutofill } from "./useAutofill";
import { textStyleToCss } from "../../../lib/textStyle";
import { QuestionMedia } from "./QuestionMedia";
import type { AnswerValue, FormField, RepeatingTableValue } from "../../../formsSchema/types";

interface Props {
  field: FormField;
  respondentEmail: string;
  priorAnswers: Record<string, AnswerValue>;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

function isRepeatingTableValue(v: AnswerValue): v is RepeatingTableValue {
  return !!v && typeof v === "object" && !Array.isArray(v) && "rows" in v;
}

function toRepeatingValue(
  rows: Record<string, unknown>[],
  connectorId: string,
  source: "connector" | "manual"
): RepeatingTableValue {
  return {
    rows: rows.map((r) => r as Record<string, string | number | null>),
    meta: { source, connectorId, fetchedAt: new Date().toISOString(), rowCount: rows.length },
  };
}

/**
 * Renders a connector-autofill repeatingTable field — e.g. the Team Outing
 * form's roster of team members. A glowing "auto-fill" badge marks it, and
 * — unless the config disables it — an Auto/Manual toggle lets the
 * respondent take over with an editable grid at any time, not just on
 * failure. Automatic-mode empty/error presentation still follows the
 * field's configured emptyResultBehavior/errorBehavior.
 */
export function ConnectorTableField({ field, respondentEmail, priorAnswers, value, onChange, error }: Props) {
  const { status, rows, error: autofillError, retry } = useAutofill(field, respondentEmail, priorAnswers);
  const columns = field.columns ?? [];
  const cfg = field.connectorAutofill;
  const allowOverride = cfg?.allowManualOverride !== false;
  // meta.source tells us definitively whether the existing answer (if any)
  // was a respondent's manual entry — unlike AutofillField's scalar case,
  // no guessing needed. Starting in Manual with it preserved avoids the
  // same class of bug: without this, the auto-resolve effect below fires
  // the instant the connector settles and overwrites the manual rows with
  // fresh connector data on resume/edit/approval-review remount.
  const existingManualRows = isRepeatingTableValue(value) && value.meta?.source === "manual" ? value.rows : null;
  const [mode, setMode] = useState<"auto" | "manual">(() => (existingManualRows ? "manual" : "auto"));
  const [manualRows, setManualRows] = useState<Record<string, string | number | null>[]>(() => existingManualRows ?? []);

  useEffect(() => {
    if (mode !== "auto") return;
    if (status === "resolved" || status === "empty") {
      onChange(toRepeatingValue(rows, cfg?.connectorId ?? "", "connector"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, rows.length, mode]);

  function commitManualRows(next: Record<string, string | number | null>[]) {
    setManualRows(next);
    onChange(toRepeatingValue(next, cfg?.connectorId ?? "", "manual"));
  }

  function switchToManual() {
    if (manualRows.length === 0 && rows.length > 0) {
      setManualRows(rows.map((r) => r as Record<string, string | number | null>));
    }
    setMode("manual");
  }

  function switchToAuto() {
    setMode("auto");
    retry();
  }

  const badge = (
    <>
      <span className="autofill-badge">
        <span className="autofill-badge__dot" />
        auto-fill
      </span>
      {allowOverride && (
        <span className="fill-source-toggle">
          <button
            type="button"
            className={mode === "auto" ? "is-active" : ""}
            aria-label={`Auto-fill ${field.label}`}
            onClick={switchToAuto}
          >
            Auto
          </button>
          <button
            type="button"
            className={mode === "manual" ? "is-active" : ""}
            aria-label={`Enter ${field.label} manually`}
            onClick={switchToManual}
          >
            Manual
          </button>
        </span>
      )}
    </>
  );

  if (mode === "manual") {
    return (
      <ManualGrid field={field} columns={columns} rows={manualRows} onChange={commitManualRows} badge={badge} error={error} />
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <div className="fill-field">
        <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
          {field.label}
          {badge}
        </label>
        <QuestionMedia field={field} />
        <p className="fill-field__help">Loading…</p>
      </div>
    );
  }

  if (status === "error") {
    if (cfg?.errorBehavior === "blockSubmit") {
      return (
        <div className="fill-field">
          <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
            {field.label}
            {badge}
          </label>
          <QuestionMedia field={field} />
          <div className="error-text">Couldn't load this table{autofillError ? `: ${autofillError}` : "."}</div>
        </div>
      );
    }
    if (cfg?.errorBehavior === "showErrorAllowRetry") {
      return (
        <div className="fill-field">
          <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
            {field.label}
            {badge}
          </label>
          <QuestionMedia field={field} />
          <div className="error-text">
            Couldn't load this table{autofillError ? `: ${autofillError}` : "."} <button onClick={retry}>Retry</button>
          </div>
        </div>
      );
    }
    // showWarningAllowManualOverride — fall through to an editable manual grid
    return (
      <ManualGrid
        field={field}
        columns={columns}
        rows={manualRows}
        onChange={commitManualRows}
        badge={badge}
        warning="Couldn't load this automatically — please fill it in manually."
        error={error}
      />
    );
  }

  if (status === "empty") {
    if (cfg?.emptyResultBehavior === "hideField") return null;
    if (cfg?.emptyResultBehavior === "showEmptyTable") {
      return <ConnectorGridReadOnly field={field} columns={columns} rows={[]} badge={badge} error={error} />;
    }
    return (
      <div className="fill-field">
        <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
          {field.label}
          {badge}
        </label>
        <QuestionMedia field={field} />
        <p className="fill-field__help">No records found.</p>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return <ConnectorGridReadOnly field={field} columns={columns} rows={rows} badge={badge} error={error} />;
}

function ConnectorGridReadOnly({
  field,
  columns,
  rows,
  badge,
  error,
}: {
  field: FormField;
  columns: NonNullable<FormField["columns"]>;
  rows: Record<string, unknown>[];
  badge: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="fill-field">
      <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
        {field.label}
        {badge}
      </label>
      <QuestionMedia field={field} />
      <div className="table-scroll">
        <table className="response-grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>No records found.</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>{String(row[c.key] ?? "")}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function ManualGrid({
  field,
  columns,
  rows,
  onChange,
  badge,
  warning,
  error,
}: {
  field: FormField;
  columns: NonNullable<FormField["columns"]>;
  rows: Record<string, string | number | null>[];
  onChange: (rows: Record<string, string | number | null>[]) => void;
  badge?: React.ReactNode;
  warning?: string;
  error?: string;
}) {
  return (
    <div className="fill-field">
      <label className="fill-field__label" style={textStyleToCss(field.labelStyle)}>
        {field.label}
        {badge}
      </label>
      <QuestionMedia field={field} />
      {warning && <p className="error-text">{warning}</p>}
      <div className="table-scroll">
        <table className="response-grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <input
                      value={String(row[c.key] ?? "")}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...row, [c.key]: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, ""]))])}>
        + Add row
      </button>
      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
