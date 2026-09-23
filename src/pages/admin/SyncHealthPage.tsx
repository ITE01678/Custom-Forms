import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getUnresolved, getUnresolvedForForm, retryItem, type SyncQueueFields } from "../../services/syncQueue";
import { AppTopbar } from "../../components/layout/AppTopbar";
import type { ListItem } from "../../services/lists";

/**
 * Lists SharePoint SyncQueue items that haven't confirmed as written to
 * Excel yet — the no-server equivalent of an outbox worker's monitoring
 * dashboard. Nothing here is ever silently dropped: a response that fails
 * every automatic retry stays visible here until an admin retries or
 * investigates it.
 */
export function SyncHealthPage() {
  const [searchParams] = useSearchParams();
  const formId = searchParams.get("formId");

  const [items, setItems] = useState<ListItem<SyncQueueFields>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await (formId ? getUnresolvedForForm(formId) : getUnresolved()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  async function handleRetry(item: ListItem<SyncQueueFields>) {
    setRetrying(item.id);
    try {
      await retryItem(item);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="app-shell">
      <AppTopbar backTo={{ to: "/", label: "My forms" }} />
      <div className="page page--wide">
      <h1>Sync Health</h1>
      <p>
        {formId
          ? "Responses still pending or failed sync to this form's Excel workbook."
          : "Responses still pending or failed sync to their Excel workbook, across all forms."}
      </p>

      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>Nothing pending — everything is synced.</p>
      ) : (
        <div className="table-scroll">
          <table className="response-grid">
            <thead>
              <tr>
                <th>Form</th>
                <th>Response</th>
                <th>Submitter</th>
                <th>Operation</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.fields.FormId}</td>
                  <td>{item.fields.ResponseId}</td>
                  <td>{item.fields.SubmitterEmail}</td>
                  <td>{item.fields.Operation}</td>
                  <td>{item.fields.Status}</td>
                  <td>{item.fields.Attempts}</td>
                  <td>{item.fields.LastError ?? "—"}</td>
                  <td>
                    <button onClick={() => handleRetry(item)} disabled={retrying === item.id}>
                      {retrying === item.id ? "Retrying…" : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
