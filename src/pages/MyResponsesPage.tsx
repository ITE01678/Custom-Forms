import { useMyResponses } from "../hooks/useMyResponses";
import { AppShell } from "../components/layout/AppShell";
import { MyResponseCard } from "../components/common/MyResponseCard";
import { Icon } from "../components/common/Icon";

/**
 * Every response the signed-in user has personally submitted, across ALL
 * forms (see hooks/useMyResponses.ts — the same hook backs Dashboard's "My
 * responses" toggle). Deliberately a thin directory: each row links to the
 * form's normal /f/:slug route, which already shows the right edit-vs-
 * readonly UI via the shared canSelfEdit logic — no second response-editing
 * UI needed here.
 */
export function MyResponsesPage() {
  const { rows, loading, error } = useMyResponses();

  return (
    <AppShell backTo={{ to: "/", label: "My forms" }}>
      <div className="page page--wide">
        <div className="page-header">
          <span className="page-header__icon">
            <Icon name="folder" size={22} />
          </span>
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
            <div className="empty-state__icon">
              <Icon name="folder" size={28} />
            </div>
            <h2>No responses yet</h2>
            <p>Forms you fill out and submit will show up here.</p>
          </div>
        ) : (
          <div className="form-grid">
            {rows.map((row) => (
              <MyResponseCard key={row.form.id} {...row} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
