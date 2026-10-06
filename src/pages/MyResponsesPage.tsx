import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFormById } from "../services/forms";
import { getResponseByRowIndex } from "../services/excel";
import { getIndexEntriesForSubmitter } from "../services/responseIndex";
import { getRoutingState } from "../services/responseRouting";
import { canSelfEdit } from "../formsSchema/editAccess";
import { AppShell } from "../components/layout/AppShell";
import type { FormDefinition, FormResponse, ResponseRoutingState } from "../formsSchema/types";

interface MyResponseRow {
  form: FormDefinition;
  response: FormResponse;
  routingStatus: ResponseRoutingState["status"] | null;
  editable: boolean;
}

/** Resolves N things with at most `size` in flight at once — a user with a
 *  lot of responses shouldn't fire dozens of simultaneous Graph calls. */
async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

/**
 * Every response the signed-in user has personally submitted, across ALL
 * forms — built entirely on ResponseIndex's existing SubmitterEmail-only
 * query (zero new storage, see services/responseIndex.ts's
 * getIndexEntriesForSubmitter). Deliberately a thin directory: each row
 * links to the form's normal /f/:slug route, which (via the same canSelfEdit
 * logic used here) already shows the right edit-vs-readonly UI — no second
 * response-editing UI needed.
 */
export function MyResponsesPage() {
  const { email } = useAuth();
  const [rows, setRows] = useState<MyResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await getIndexEntriesForSubmitter(email);
        const resolved = await mapWithConcurrency(entries, 5, async (entry): Promise<MyResponseRow | null> => {
          const stored = await getFormById(entry.fields.FormId);
          if (!stored) return null;
          const { form } = stored;
          // Resolved directly via the index entry we already have, rather
          // than services/responses.ts's getMyResponse wrapper, which would
          // redundantly re-run getIndexBySubmitter (a second List query) —
          // we already know the row index.
          const response = await getResponseByRowIndex(form, entry.fields.RowIndex);
          if (!response) return null;
          const routingEntry = await getRoutingState(form.id, response.id);
          const editable = canSelfEdit({ form, response, hasActiveRouting: !!routingEntry });
          return { form, response, routingStatus: routingEntry?.state.status ?? null, editable };
        });
        if (!cancelled) {
          setRows(
            resolved
              .filter((r): r is MyResponseRow => r !== null)
              .sort((a, b) => (b.response.submittedAt ?? "").localeCompare(a.response.submittedAt ?? ""))
          );
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
  }, [email]);

  return (
    <AppShell backTo={{ to: "/", label: "My forms" }}>
      <div className="page page--wide">
        <div className="page-header">
          <span className="page-header__icon" aria-hidden="true">🗂️</span>
          <div>
            <h1>My responses</h1>
            <p className="page-header__subtitle">Every form you've personally submitted a response to.</p>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🗂️</div>
            <h2>No responses yet</h2>
            <p>Forms you fill out and submit will show up here.</p>
          </div>
        ) : (
          <div className="form-grid">
            {rows.map(({ form, response, routingStatus, editable }) => (
              <div className="form-card" key={form.id}>
                <div className="form-card__header">
                  <span className="form-card__icon" aria-hidden="true">✅</span>
                  <span className="form-card__title">{form.title || "Untitled form"}</span>
                  {routingStatus && (
                    <span className={`status-pill ${routingStatus === "approved" ? "status-pill--published" : ""}`}>
                      {routingStatus === "in-progress" ? "Awaiting approval" : routingStatus === "approved" ? "Approved" : "Rejected"}
                    </span>
                  )}
                </div>
                <p className="form-card__meta">
                  {response.submittedAt
                    ? `Submitted ${new Date(response.submittedAt).toLocaleDateString()}`
                    : "Submission date unavailable"}
                  {response.status === "submitted" && response.editHistory?.length > 0 ? " · edited" : ""}
                </p>
                {form.status === "published" ? (
                  <Link className="form-card__responses" to={`/f/${form.slug}`}>
                    {editable ? "Edit your response →" : "View your response →"}
                  </Link>
                ) : (
                  <span className="form-card__meta">This form is no longer available.</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
