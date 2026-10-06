import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useSiteCapabilities } from "../auth/CapabilityProvider";
import { createForm, getFormById, listMyForms, type StoredForm } from "../services/forms";
import { listFormPermissionsForEmail } from "../services/formPermissions";
import { AppShell } from "../components/layout/AppShell";
import { FormQuickActions } from "../components/common/FormQuickActions";

interface SharedFormRow {
  form: StoredForm["form"];
  canViewResponses: boolean;
  canManageResponses: boolean;
}

export function Dashboard() {
  const { email, displayName } = useAuth();
  const { capabilities: siteCapabilities } = useSiteCapabilities();
  const navigate = useNavigate();

  const [forms, setForms] = useState<StoredForm[]>([]);
  const [sharedForms, setSharedForms] = useState<SharedFormRow[]>([]);
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
        const resolved = await Promise.all(
          grants.map(async (g) => {
            const stored = await getFormById(g.fields.FormId);
            if (!stored || stored.form.owner.upn.toLowerCase() === email.toLowerCase()) return null;
            return {
              form: stored.form,
              canViewResponses: !!g.fields.CanViewResponses,
              canManageResponses: !!g.fields.CanManageResponses,
            };
          })
        );
        if (!cancelled) setSharedForms(resolved.filter((r): r is SharedFormRow => r !== null));
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
    <AppShell>
      <div className="page page--wide">
        <div className="dashboard-toolbar">
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating || !siteCapabilities.canCreateForms}
            title={!siteCapabilities.canCreateForms ? "Admin or Owner access required" : undefined}
          >
            {creating ? "Creating…" : "+ Create a form"}
          </button>
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
                <FormQuickActions form={form} canViewResponses canViewSyncHealth />
                {form.description && <p className="form-card__description">{form.description}</p>}
                <p className="form-card__meta">Updated {new Date(form.updatedAt).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        )}

        {sharedForms.length > 0 && (
          <>
            <h2 className="dashboard-section-heading">Shared with you</h2>
            <div className="form-grid">
              {sharedForms.map(({ form, canViewResponses, canManageResponses }) => (
                <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                  <div className="form-card__header">
                    <span className="form-card__icon" aria-hidden="true">📋</span>
                    <span className="form-card__title">{form.title || "Untitled form"}</span>
                    <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
                  </div>
                  <FormQuickActions form={form} canViewResponses={canViewResponses} canViewSyncHealth={canManageResponses} />
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
    </AppShell>
  );
}
