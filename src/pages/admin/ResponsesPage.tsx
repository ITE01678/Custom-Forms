import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFormById } from "../../services/forms";
import { getResponsesForForm } from "../../services/responses";
import type { ResponseRow } from "../../services/excel";
import { AppShell } from "../../components/layout/AppShell";
import { Icon } from "../../components/common/Icon";
import { useFormCapabilities } from "../../hooks/useFormCapabilities";
import type { FormDefinition } from "../../formsSchema/types";

export function ResponsesPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { loading: capabilitiesLoading, capabilities } = useFormCapabilities(form?.id, form?.owner.upn);

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
  if (loading || !form || capabilitiesLoading) return <div className="page">Loading…</div>;
  if (!capabilities?.canViewResponses) {
    return (
      <AppShell backTo={{ to: "/", label: "My forms" }}>
        <div className="page page--centered" role="alert">
          <p>You don't have access to this form's responses.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell backTo={{ to: `/builder/${form.id}`, label: "Builder" }}>
      <div className="page page--wide">
      <div className="page-header">
        <span className="page-header__icon"><Icon name="chart" size={20} /></span>
        <div>
          <h1>{form.title}</h1>
          <p className="page-header__subtitle">{rows.length} response{rows.length === 1 ? "" : "s"}</p>
        </div>
        <Link to={`/admin/sync-health?formId=${form.id}`} className="icon-btn" data-tooltip="Sync health for this form">
          <Icon name="pulse" size={16} />
        </Link>
      </div>

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
    </AppShell>
  );
}
