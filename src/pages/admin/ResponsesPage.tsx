import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFormById } from "../../services/forms";
import { getResponsesForForm } from "../../services/responses";
import type { ResponseRow } from "../../services/excel";
import { AppTopbar } from "../../components/layout/AppTopbar";
import type { FormDefinition } from "../../formsSchema/types";

export function ResponsesPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!formId) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await getFormById(formId);
        if (!stored) throw new Error("Form not found.");
        if (cancelled) return;
        setForm(stored.form);
        // Columns come from the SAME read as the rows (the workbook's
        // actual, reconciled header) — not recomputed separately from the
        // current form definition, which could differ from what the sheet
        // actually has if the form was edited/republished since responses
        // were written under an earlier field list.
        const { columns: gridColumns, rows: responseRows } = await getResponsesForForm(stored.form);
        if (!cancelled) {
          setColumns(gridColumns);
          setRows(responseRows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (error) return <div className="page">{error}</div>;
  if (loading || !form) return <div className="page">Loading…</div>;

  return (
    <div className="app-shell">
      <AppTopbar backTo={{ to: `/builder/${form.id}`, label: "Builder" }} />
      <div className="page page--wide">
      <p>
        <Link to="/admin/sync-health">🩺 Sync health</Link>
      </p>
      <h1>{form.title} — Responses</h1>
      <p>{rows.length} response(s)</p>

      {rows.length === 0 ? (
        <p>No responses yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="response-grid">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const responseId = row.values[0];
                return (
                  <tr key={i}>
                    {row.values.map((v, j) =>
                      j === 0 ? (
                        <td key={j}>
                          <Link to={`/admin/forms/${form.id}/responses/${responseId}`}>{String(v)}</Link>
                        </td>
                      ) : (
                        <td key={j}>{v === null || v === undefined ? "" : String(v)}</td>
                      )
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
