import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useSiteCapabilities } from "../auth/CapabilityProvider";
import { createForm, getFormById, listMyForms, type StoredForm } from "../services/forms";
import { listFormPermissionsForEmail, getFormCollaborators } from "../services/formPermissions";
import { AppShell } from "../components/layout/AppShell";
import { FormQuickActions } from "../components/common/FormQuickActions";
import { MyResponseCard } from "../components/common/MyResponseCard";
import { Icon } from "../components/common/Icon";
import { useMyResponses } from "../hooks/useMyResponses";
import { initialsOf } from "../lib/initials";
import type { FormCollaborator } from "../formsSchema/types";

interface SharedFormRow {
  form: StoredForm["form"];
  canViewResponses: boolean;
  canManageResponses: boolean;
}

type DashboardView = "forms" | "responses";

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const { email, displayName } = useAuth();
  const { capabilities: siteCapabilities } = useSiteCapabilities();
  const navigate = useNavigate();

  const [view, setView] = useState<DashboardView>("forms");
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [sharedForms, setSharedForms] = useState<SharedFormRow[]>([]);
  const [collaboratorsByFormId, setCollaboratorsByFormId] = useState<Record<string, FormCollaborator[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const myResponses = useMyResponses();

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

  // Who else has access to each form I own — shown as mini avatar bubbles on
  // its card. A second effect (depends on `forms`) rather than folded into
  // the fetch above, since it needs the owned-forms list to exist first.
  useEffect(() => {
    if (forms.length === 0) return;
    let cancelled = false;
    Promise.all(
      forms.map(({ form }) =>
        getFormCollaborators(form.id)
          .then((c) => [form.id, c] as const)
          .catch(() => [form.id, []] as const)
      )
    ).then((pairs) => {
      if (!cancelled) setCollaboratorsByFormId(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [forms]);

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

  const firstName = (displayName ?? email ?? "").trim().split(/\s+/)[0] || "there";
  const todayLabel = new Date().toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <AppShell>
      <div className="page page--wide">
        <div className="dashboard-hero">
          <div className="dashboard-hero__date">{todayLabel}</div>
          <h1 className="dashboard-hero__greeting">
            {greetingForHour(new Date().getHours())}, {firstName}
          </h1>
          <p className="dashboard-hero__tagline">
            <strong>Custom Forms</strong> — build, share, and collect responses without ever leaving SharePoint.
          </p>
        </div>

        <div className="dashboard-toolbar">
          <div className="dashboard-view-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === "forms"}
              className={view === "forms" ? "is-active" : ""}
              onClick={() => setView("forms")}
            >
              My forms
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "responses"}
              className={view === "responses" ? "is-active" : ""}
              onClick={() => setView("responses")}
            >
              My responses
            </button>
          </div>
          {view === "forms" && (
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={creating || !siteCapabilities.canCreateForms}
              title={!siteCapabilities.canCreateForms ? "Admin or Owner access required" : undefined}
            >
              {creating ? "Creating…" : "+ Create a form"}
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        {view === "responses" ? (
          <>
            {myResponses.error && <p className="error-text">{myResponses.error}</p>}
            {myResponses.loading ? (
              <p>Loading your responses…</p>
            ) : myResponses.rows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <Icon name="folder" size={28} />
                </div>
                <h2>No responses yet</h2>
                <p>Forms you fill out and submit will show up here.</p>
              </div>
            ) : (
              <div className="form-grid">
                {myResponses.rows.map((row) => (
                  <MyResponseCard key={row.form.id} {...row} />
                ))}
              </div>
            )}
          </>
        ) : loading ? (
          <p>Loading your forms…</p>
        ) : forms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Icon name="edit" size={28} />
            </div>
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
            {forms.map(({ form }) => {
              const collaborators = collaboratorsByFormId[form.id] ?? [];
              return (
                <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                  <div className="form-card__header">
                    <span className="form-card__icon">
                      <Icon name="clipboard" size={18} />
                    </span>
                    <span className="form-card__title">{form.title || "Untitled form"}</span>
                    <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
                  </div>
                  <FormQuickActions form={form} canViewResponses canViewSyncHealth />
                  {form.description && <p className="form-card__description">{form.description}</p>}
                  <p className="form-card__meta">Updated {new Date(form.updatedAt).toLocaleDateString()}</p>
                  {collaborators.length > 0 && (
                    <div className="form-card__collaborators" title={collaborators.map((c) => c.email).join(", ")}>
                      {collaborators.slice(0, 4).map((c) => (
                        <span key={c.email} className="form-card__collaborator-avatar">
                          {initialsOf(c.displayName || c.email) || "?"}
                        </span>
                      ))}
                      {collaborators.length > 4 && (
                        <span className="form-card__collaborator-avatar form-card__collaborator-avatar--more">
                          +{collaborators.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {view === "forms" && sharedForms.length > 0 && (
          <>
            <h2 className="dashboard-section-heading">Shared with you</h2>
            <div className="form-grid">
              {sharedForms.map(({ form, canViewResponses, canManageResponses }) => (
                <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                  <div className="form-card__header">
                    <span className="form-card__icon">
                      <Icon name="clipboard" size={18} />
                    </span>
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
