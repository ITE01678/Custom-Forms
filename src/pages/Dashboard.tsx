import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { createForm, listMyForms, type StoredForm } from "../services/forms";
import { AppTopbar } from "../components/layout/AppTopbar";

export function Dashboard() {
  const { email, displayName } = useAuth();
  const navigate = useNavigate();

  const [forms, setForms] = useState<StoredForm[]>([]);
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
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "+ Create a form"}
          </button>
          <Link className="toolbar-link" to="/admin/connectors">
            🔌 Data source connectors
          </Link>
          <Link className="toolbar-link" to="/admin/sync-health">
            🩺 Sync health
          </Link>
        </div>

        {error && <p className="error-text">{error}</p>}

        {loading ? (
          <p>Loading your forms…</p>
        ) : forms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📝</div>
            <h2>No forms yet</h2>
            <p>Create your first form — add fields, wire up auto-fill, and publish a shareable link.</p>
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "+ Create a form"}
            </button>
          </div>
        ) : (
          <div className="form-grid">
            {forms.map(({ form }) => (
              <Link className="form-card" to={`/builder/${form.id}`} key={form.id}>
                <div className="form-card__header">
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
      </div>
    </div>
  );
}
