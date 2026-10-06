import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useSiteCapabilities } from "../auth/CapabilityProvider";
import { createForm, getFormById, listMyForms, type StoredForm } from "../services/forms";
import { listFormPermissionsForEmail } from "../services/formPermissions";
import { AppTopbar } from "../components/layout/AppTopbar";

export function Dashboard() {
  const { email, displayName } = useAuth();
  const { capabilities: siteCapabilities } = useSiteCapabilities();
  const navigate = useNavigate();

  const [forms, setForms] = useState<StoredForm[]>([]);
  const [sharedForms, setSharedForms] = useState<StoredForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    listMyForms(email)
      .then((result) => !cancelled && setForms(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));

    // "Shared with you" — forms this account was explicitly granted
    // collaborator access to (builder's Access tab), as opposed to ones they
    // own. Best-effort: a failure here shouldn't block the owned-forms grid.
    listFormPermissionsForEmail(email)
      .then(async (grants) => {
        const uniqueFormIds = [...new Set(grants.map((g) => g.fields.FormId))];
        const resolved = await Promise.all(uniqueFormIds.map((id) => getFormById(id)));
        if (!cancelled) {
          setSharedForms(resolved.filter((s): s is StoredForm => s !== null && s.form.owner.upn.toLowerCase() !== email.toLowerCase()));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [email]);

  async function handleCreate() {
    if (!email) return;
    setCreating(true);
    setError(null);
    try {
      const stored = await createForm("Untitled form", { upn: email, displayName: displayName ?? undefined });
      navigate(`/builder/${stored.form.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <AppTopbar />

      <div className="page page--wide">
        <div className="dashboard-toolbar">
          {siteCapabilities.canCreateForms && (
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "+ Create a form"}
            </button>
          )}
          {siteCapabilities.canManageConnectors && (
            <Link className="toolbar-link" to="/admin/connectors">
              🔌 Data source connectors
            </Link>
          )}
          {siteCapabilities.canViewTenantSyncHealth && (
            <Link className="toolbar-link" to="/admin/sync-health">
              🩺 Sync health
            </Link>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        {loading ? (
          <p>Loading your forms…</p>
        ) : forms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📝</div>
            <h2>No forms yet</h2>
            {siteCapabilities.canCreateForms ? (
              <>
                <p>Create your first form — add fields, wire up auto-fill, and publish a shareable link.</p>
                <button className="btn-primary" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating…" : "+ Create a form"}
                </button>
              </>
            ) : (
              <p>You haven't been granted access to create or collaborate on any forms yet.</p>
            )}
          </div>
        ) : (
          <div className="form-grid">
            {forms.map(({ form }) => (
              <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                <div className="form-card__header">
                  <span className="form-card__icon" aria-hidden="true">📋</span>
                  <span className="form-card__title">{form.title || "Untitled form"}</span>
                  <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
                </div>
                {form.description && <p className="form-card__description">{form.description}</p>}
                <p className="form-card__meta">Updated {new Date(form.updatedAt).toLocaleDateString()}</p>
                {(form.status === "published" || form.status === "archived") && form.latestPublishedVersion && (
                  <span
                    className="form-card__responses"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/admin/forms/${form.id}/responses`);
                    }}
                  >
                    View responses →
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {sharedForms.length > 0 && (
          <>
            <h2 className="dashboard-section-heading">Shared with you</h2>
            <div className="form-grid">
              {sharedForms.map(({ form }) => (
                <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                  <div className="form-card__header">
                    <span className="form-card__icon" aria-hidden="true">📋</span>
                    <span className="form-card__title">{form.title || "Untitled form"}</span>
                    <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
                  </div>
                  {form.description && <p className="form-card__description">{form.description}</p>}
                  <p className="form-card__meta">
                    Owner: {form.owner.displayName ?? form.owner.upn} · Updated{" "}
                    {new Date(form.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
