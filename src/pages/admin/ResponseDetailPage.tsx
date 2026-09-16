import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getFormById, getFormVersion } from "../../services/forms";
import { flattenFields, getResponseByRowIndex } from "../../services/excel";
import { getIndexByResponseId } from "../../services/responseIndex";
import { getEntriesForResponse } from "../../services/auditLog";
import { updateResponse } from "../../services/responses";
import { resolveFirstSectionId } from "../../formsSchema/branching";
import { formatAnswer } from "../../lib/formatAnswer";
import { FillRunner } from "../../components/runtime/FillRunner";
import type { AnswerValue, AuditEntry, FormDefinition, FormResponse } from "../../formsSchema/types";

export function ResponseDetailPage() {
  const { formId, responseId } = useParams<{ formId: string; responseId: string }>();
  const { email } = useAuth();

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [pinnedForm, setPinnedForm] = useState<FormDefinition | null>(null);
  const [response, setResponse] = useState<FormResponse | null>(null);
  const [rowIndex, setRowIndex] = useState<number | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  async function load() {
    if (!formId || !responseId) return;
    setLoading(true);
    setError(null);
    try {
      const stored = await getFormById(formId);
      if (!stored) throw new Error("Form not found.");
      setForm(stored.form);

      const indexEntry = await getIndexByResponseId(formId, responseId);
      if (!indexEntry) throw new Error("Response not found in the index.");
      setRowIndex(indexEntry.fields.RowIndex);

      const found = await getResponseByRowIndex(stored.form, indexEntry.fields.RowIndex);
      if (!found) throw new Error("Response row not found in the workbook.");
      setResponse(found);

      const pinned =
        found.formVersion === stored.form.latestPublishedVersion
          ? stored.form
          : (await getFormVersion(formId, found.formVersion)) ?? stored.form;
      setPinnedForm(pinned);

      setAuditTrail(await getEntriesForResponse(formId, responseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, responseId]);

  if (error) return <div className="page">{error}</div>;
  if (loading || !form || !response || !pinnedForm || rowIndex === null) return <div className="page">Loading…</div>;

  const canAdminEdit = form.editPolicy.mode === "admin-only" || form.editPolicy.mode === "self-and-admin";

  if (editing) {
    const firstSectionId = resolveFirstSectionId(pinnedForm.sections, response.answers);

    async function handleAdminEditSubmit(answers: Record<string, AnswerValue>, reason?: string) {
      if (!email) throw new Error("Not signed in.");
      await updateResponse({
        form: pinnedForm!,
        existing: response!,
        rowIndexHint: rowIndex!,
        answers,
        editorEmail: email,
        reason,
      });
      setEditing(false);
      await load();
    }

    return (
      <div className="page">
        <button onClick={() => setEditing(false)}>← Cancel edit</button>
        <FillRunner
          form={pinnedForm}
          responseId={response.id}
          initialAnswers={response.answers}
          initialSectionIds={firstSectionId ? [firstSectionId] : []}
          requireReason={!!form.editPolicy.requireReasonForEdit}
          banner={<>Editing as admin ({email}) — this will be recorded in the audit trail.</>}
          onSubmit={handleAdminEditSubmit}
        />
      </div>
    );
  }

  const fields = flattenFields(pinnedForm);

  return (
    <div className="page">
      <p>
        <Link to={`/admin/forms/${form.id}/responses`}>← Back to responses</Link>
      </p>
      <h1>{form.title}</h1>
      <p>
        Submitted by <strong>{response.respondentUpn}</strong>
        {response.submittedAt && ` on ${new Date(response.submittedAt).toLocaleString()}`}
      </p>

      {canAdminEdit && <button onClick={() => setEditing(true)}>Edit this response</button>}

      <div className="panel">
        <h3>Answers</h3>
        {fields.map((field) => (
          <div className="fill-field" key={field.id}>
            <span className="fill-field__label">{field.label}</span>
            <p>{formatAnswer(response.answers[field.id] ?? null)}</p>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Audit trail</h3>
        {auditTrail.length === 0 ? (
          <p>No history recorded yet.</p>
        ) : (
          <table className="response-grid">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Action</th>
                <th>Changed</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.at).toLocaleString()}</td>
                  <td>{entry.byUpn}</td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.changedFields.length === 0
                      ? "—"
                      : entry.changedFields
                          .map((c) => {
                            const label = fields.find((f) => f.id === c.fieldId)?.label ?? c.fieldId;
                            return `${label}: ${formatAnswer(c.oldValue as AnswerValue)} → ${formatAnswer(c.newValue as AnswerValue)}`;
                          })
                          .join("; ")}
                  </td>
                  <td>{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
