import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getUnresolved, getUnresolvedForForm, retryItem, type SyncQueueFields } from "../../services/syncQueue";
import { getFormById } from "../../services/forms";
import { AppShell } from "../../components/layout/AppShell";
import { useSiteCapabilities } from "../../auth/CapabilityProvider";
import { useFormCapabilities } from "../../hooks/useFormCapabilities";
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
  const [formOwnerUpn, setFormOwnerUpn] = useState<string | undefined>(undefined);

  const { loading: siteLoading, capabilities: site } = useSiteCapabilities();
  // Only meaningfully used in the per-form (?formId=) case — resolves to
  // "loading forever" (safe default: not authorized) when formId is absent,
  // since the tenant-wide view below is gated on site.canViewTenantSyncHealth
  // instead, not on this.
  const { loading: formCapabilitiesLoading, capabilities: formCapabilities } = useFormCapabilities(
    formId ?? undefined,
    formOwnerUpn
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (formId) {
        const stored = await getFormById(formId);
        setFormOwnerUpn(stored?.form.owner.upn);
      }
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

  const authorized = formId ? !!formCapabilities?.canManageResponses : site.canViewTenantSyncHealth;
  const authorizationLoading = formId ? formCapabilitiesLoading || !formOwnerUpn : siteLoading;

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

  if (authorizationLoading) {
    return (
      <AppShell backTo={{ to: "/", label: "My forms" }}>
        <div className="page">Loading…</div>
      </AppShell>
    );
  }
  if (!authorized) {
    return (
      <AppShell backTo={{ to: "/", label: "My forms" }}>
        <div className="page page--centered" role="alert">
          <p>
            {formId
              ? "You don't have access to this form's sync health."
              : "Only the site owner can view sync health across all forms."}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell backTo={{ to: "/", label: "My forms" }}>
      <div className="page page--wide">
      <div className="page-header">
        <span className="page-header__icon" aria-hidden="true">🩺</span>
        <div>
          <h1>Sync Health</h1>
          <p className="page-header__subtitle">
            {formId
              ? "Responses still pending or failed sync to this form's Excel workbook."
              : "Responses still pending or failed sync to their Excel workbook, across all forms."}
          </p>
        </div>
      </div>

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
    </AppShell>
  );
}
