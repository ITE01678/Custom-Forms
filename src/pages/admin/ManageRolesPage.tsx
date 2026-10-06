import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { ALLOWED_DOMAIN } from "../../auth/msalConfig";
import { addAuditEntry } from "../../services/auditLog";
import {
  listAppRoleOverrides,
  removeAppRoleOverride,
  setAppRoleOverride,
  type AppRoleFields,
} from "../../services/siteRoles";
import { AppShell } from "../../components/layout/AppShell";
import type { ListItem } from "../../services/lists";
import type { SiteRole } from "../../formsSchema/types";

const ROLE_LABELS: Record<SiteRole, string> = {
  owner: "Owner — unrestricted access to everything",
  admin: "Admin — can create forms; manages forms/responses they own or are granted",
  member: "Member — fill out forms, see/edit their own responses only",
};

/**
 * Lets a Site Owner assign any specific person's site-wide role. This is the
 * ONLY source of truth for roles (see services/siteRoles.ts and SETUP.md's
 * "Role model" section) — an earlier version also tried deriving a default
 * from native SharePoint Owners/Members group membership, which turned out
 * not to be reachable from this app at all (SharePoint's classic REST API
 * doesn't honor cross-origin bearer-token calls from an external static
 * site). Someone with no row here is a Member by default.
 */
export function ManageRolesPage() {
  const { email: myEmail } = useAuth();
  const [overrides, setOverrides] = useState<ListItem<AppRoleFields>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<SiteRole>("admin");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setOverrides(await listAppRoleOverrides());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSet() {
    if (!myEmail) return;
    const email = newEmail.trim().toLowerCase();
    setError(null);
    if (!email) return;
    if (!email.endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`)) {
      setError(`"${email}" isn't a @${ALLOWED_DOMAIN} address.`);
      return;
    }
    setSaving(true);
    try {
      await setAppRoleOverride({ email, role: newRole, setBy: myEmail, note: newNote.trim() || undefined });
      await addAuditEntry({
        formId: "",
        responseId: "",
        byEmail: myEmail,
        action: "role-override-set",
        changedFields: [{ fieldId: "role", oldValue: null, newValue: { email, role: newRole } }],
      });
      setNewEmail("");
      setNewNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(item: ListItem<AppRoleFields>) {
    if (!myEmail) return;
    setError(null);
    try {
      await removeAppRoleOverride(item.id);
      await addAuditEntry({
        formId: "",
        responseId: "",
        byEmail: myEmail,
        action: "role-override-removed",
        changedFields: [{ fieldId: "role", oldValue: { email: item.fields.Email, role: item.fields.Role }, newValue: null }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <AppShell backTo={{ to: "/", label: "My forms" }}>
      <div className="page page--wide">
        <div className="page-header">
          <span className="page-header__icon" aria-hidden="true">🔐</span>
          <div>
            <h1>Manage roles</h1>
            <p className="page-header__subtitle">
              This is the app's own role model — it does not change anyone's real SharePoint site
              permissions. Anyone with no role set here is a Member by default. A change here takes
              effect for that person the next time they reload or sign back in.
            </p>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="panel">
          <h3>Set an override</h3>
          <div className="field-row">
            <label>Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={`name@${ALLOWED_DOMAIN}`}
            />
          </div>
          <div className="field-row">
            <label>Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as SiteRole)}>
              {(Object.keys(ROLE_LABELS) as SiteRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>Note (optional)</label>
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="e.g. covering for X while on leave" />
          </div>
          <button className="btn-primary" onClick={handleSet} disabled={saving || !newEmail.trim()}>
            {saving ? "Saving…" : "Set role"}
          </button>
        </div>

        <div className="panel">
          <h3>Current overrides</h3>
          {loading ? (
            <p>Loading…</p>
          ) : overrides.length === 0 ? (
            <p>No roles set yet — everyone defaults to Member until given a role here.</p>
          ) : (
            <div className="table-scroll">
              <table className="response-grid">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Set by</th>
                    <th>Set at</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((item) => (
                    <tr key={item.id}>
                      <td>{item.fields.Email}</td>
                      <td>{item.fields.Role}</td>
                      <td>{item.fields.SetBy}</td>
                      <td>{new Date(item.fields.SetAt).toLocaleString()}</td>
                      <td>{item.fields.Note || "—"}</td>
                      <td>
                        <button onClick={() => handleRemove(item)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
