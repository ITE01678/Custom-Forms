import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { createForm, listMyForms, type StoredForm } from "../services/forms";

export function Dashboard() {
  const { email, displayName, logout } = useAuth();
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
    <div className="page">
      <header className="page__header">
        <h1>Custom Forms</h1>
        <div>
          <span>{displayName ?? email}</span>{" "}
          <button onClick={() => logout()}>Sign out</button>
        </div>
      </header>

      <button onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "+ Create a form"}
      </button>{" "}
      <Link to="/admin/connectors">Data source connectors</Link>
      {" · "}
      <Link to="/admin/sync-health">Sync health</Link>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading your forms…</p>
      ) : forms.length === 0 ? (
        <p>No forms yet — create your first one above.</p>
      ) : (
        <ul className="form-list">
          {forms.map(({ form }) => (
            <li key={form.id}>
              <Link to={`/builder/${form.id}`}>{form.title}</Link>{" "}
              <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
              {form.status === "published" && (
                <>
                  {" · "}
                  <Link to={`/admin/forms/${form.id}/responses`}>Responses</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
