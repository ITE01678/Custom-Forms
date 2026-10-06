import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { ALLOWED_DOMAIN } from "../../auth/msalConfig";
import { addAuditEntry } from "../../services/auditLog";
import {
  listAppRoleOverrides,
  listNativeSiteGroups,
  removeAppRoleOverride,
  setAppRoleOverride,
  type AppRoleFields,
  type NativeSiteMember,
} from "../../services/siteRoles";
import { AppTopbar } from "../../components/layout/AppTopbar";
import type { ListItem } from "../../services/lists";
import type { SiteRole } from "../../formsSchema/types";

const ROLE_LABELS: Record<SiteRole, string> = {
  owner: "Owner — unrestricted access to everything",
  admin: "Admin — can create forms; manages forms/responses they own or are granted",
  member: "Member — fill out forms, see/edit their own responses only",
};

/**
 * Lets a Site Owner override any specific person's site-wide role — purely
 * additive on top of native SharePoint Owners/Members group membership (see
 * services/siteRoles.ts and SETUP.md's "Role model" section). Removing an
 * override just reverts that person to whatever their real SharePoint group
 * already gives them; it never changes real SharePoint permissions.
 */
export function ManageRolesPage() {
  const { email: myEmail } = useAuth();
  const [overrides, setOverrides] = useState<ListItem<AppRoleFields>[]>([]);
  const [native, setNative] = useState<{ owners: NativeSiteMember[]; members: NativeSiteMember[] } | null>(null);
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
      const [overrideItems, nativeGroups] = await Promise.all([
        listAppRoleOverrides(),
        listNativeSiteGroups().catch(() => null), // context-only — don't block the page if this fails
      ]);
      setOverrides(overrideItems);
      setNative(nativeGroups);
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
    <div className="app-shell">
      <AppTopbar backTo={{ to: "/", label: "My forms" }} />
      <div className="page page--wide">
        <h1>Manage roles</h1>
        <p>
          This overrides the app's own role model only — it does not change real SharePoint
          permissions. A change here takes effect for that person the next time they reload or
          sign back in.
        </p>

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
            <p>No overrides set — everyone's role is derived from their native SharePoint group.</p>
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

        {native && (
          <div className="panel">
            <h3>Current native SharePoint groups (context only)</h3>
            <p className="fill-field__help">
              These are read directly from the site's real Owners/Members groups — not affected
              by the overrides above, and not editable here.
            </p>
            <div className="field-row">
              <label>Owners</label>
              <span>{native.owners.length === 0 ? "—" : native.owners.map((o) => o.title).join(", ")}</span>
            </div>
            <div className="field-row">
              <label>Members</label>
              <span>{native.members.length === 0 ? "—" : native.members.map((m) => m.title).join(", ")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
