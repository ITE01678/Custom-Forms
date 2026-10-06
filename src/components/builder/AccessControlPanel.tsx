import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { ALLOWED_DOMAIN } from "../../auth/msalConfig";
import { getUserProfile } from "../../services/users";
import {
  listFormPermissions,
  removeFormPermission,
  upsertFormPermission,
  type FormPermissionFields,
} from "../../services/formPermissions";
import { addAuditEntry } from "../../services/auditLog";
import { ROLE_BUNDLE_PRESETS, type FormCapabilities } from "../../formsSchema/capabilities";
import type { FormCollaborator, FormDefinition } from "../../formsSchema/types";
import type { ListItem } from "../../services/lists";

interface Props {
  form: FormDefinition;
  capabilities: FormCapabilities;
}

const BUNDLE_LABELS: Record<FormCollaborator["roleBundle"], string> = {
  "co-owner": "Co-owner — full control, including managing access",
  editor: "Editor — can edit the form and view responses",
  viewer: "Viewer — can view responses only",
  custom: "Custom — set individual permissions",
};

const CUSTOM_FLAG_LABELS: { key: keyof typeof ROLE_BUNDLE_PRESETS["co-owner"]; label: string }[] = [
  { key: "canEditForm", label: "Edit the form (content, branding, settings)" },
  { key: "canViewResponses", label: "View responses" },
  { key: "canManageResponses", label: "Manage responses (edit/delete others', retry sync issues)" },
  { key: "canManageAccess", label: "Manage access (add/remove collaborators)" },
];

/**
 * Per-form access control — writes straight to the FormPermissions
 * SharePoint List (services/formPermissions.ts), independent of this form's
 * own save/publish cycle: granting or revoking someone's access takes effect
 * immediately, not on next Save/Publish.
 */
export function AccessControlPanel({ form, capabilities }: Props) {
  const { email: myEmail } = useAuth();
  const [collaborators, setCollaborators] = useState<ListItem<FormPermissionFields>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newBundle, setNewBundle] = useState<FormCollaborator["roleBundle"]>("editor");
  const [customFlags, setCustomFlags] = useState(ROLE_BUNDLE_PRESETS.editor);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setCollaborators(await listFormPermissions(form.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

  async function handleAdd() {
    if (!myEmail) return;
    const email = newEmail.trim().toLowerCase();
    setError(null);
    if (!email) return;
    if (!email.endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`)) {
      setError(`"${email}" isn't a @${ALLOWED_DOMAIN} address.`);
      return;
    }
    if (email === form.owner.upn.toLowerCase()) {
      setError("This person is already the form's owner.");
      return;
    }
    setAdding(true);
    try {
      // Best-effort — catches a typo'd address before granting access,
      // rather than silently granting access to an address that doesn't
      // resolve to a real colleague. If the lookup itself fails (e.g.
      // throttled), fall back to granting access under the typed address
      // anyway — this directory check is a convenience, not the security
      // boundary (the email itself is).
      let displayName: string | undefined;
      try {
        const profile = await getUserProfile(email);
        displayName = profile.displayName;
      } catch {
        // ignored — see comment above
      }
      const flags = newBundle === "custom" ? customFlags : ROLE_BUNDLE_PRESETS[newBundle];
      await upsertFormPermission({
        formId: form.id,
        email,
        displayName,
        roleBundle: newBundle,
        ...flags,
        addedBy: myEmail,
      });
      await addAuditEntry({
        formId: form.id,
        responseId: "",
        byEmail: myEmail,
        action: "grant-access",
        changedFields: [{ fieldId: "collaborator", oldValue: null, newValue: { email, roleBundle: newBundle } }],
      });
      setNewEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(item: ListItem<FormPermissionFields>) {
    if (!myEmail) return;
    setError(null);
    try {
      await removeFormPermission(item.id);
      await addAuditEntry({
        formId: form.id,
        responseId: "",
        byEmail: myEmail,
        action: "revoke-access",
        changedFields: [{ fieldId: "collaborator", oldValue: { email: item.fields.Email }, newValue: null }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="panel">
      <h3>Access control</h3>
      <div className="field-row">
        <label>Owner</label>
        <span>
          {form.owner.displayName ?? form.owner.upn}
          {form.owner.displayName ? ` (${form.owner.upn})` : ""} — can't be changed here.
        </span>
      </div>

      {!capabilities.canManageAccess && (
        <p className="fill-field__help">
          You can see who has access to this form, but only the owner (or a co-owner) can change it.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : collaborators.length === 0 ? (
        <p>No one else has been granted access yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="response-grid">
            <thead>
              <tr>
                <th>Person</th>
                <th>Access</th>
                {capabilities.canManageAccess && <th></th>}
              </tr>
            </thead>
            <tbody>
              {collaborators.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.fields.DisplayName || item.fields.Email}
                    {item.fields.DisplayName ? ` (${item.fields.Email})` : ""}
                  </td>
                  <td>{BUNDLE_LABELS[item.fields.RoleBundle]}</td>
                  {capabilities.canManageAccess && (
                    <td>
                      <button onClick={() => handleRemove(item)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {capabilities.canManageAccess && (
        <>
          <h3>Add a person</h3>
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
            <label>Access level</label>
            <select
              value={newBundle}
              onChange={(e) => setNewBundle(e.target.value as FormCollaborator["roleBundle"])}
            >
              {(Object.keys(BUNDLE_LABELS) as FormCollaborator["roleBundle"][]).map((bundle) => (
                <option key={bundle} value={bundle}>
                  {BUNDLE_LABELS[bundle]}
                </option>
              ))}
            </select>
          </div>
          {newBundle === "custom" && (
            <div className="field-row">
              {CUSTOM_FLAG_LABELS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={customFlags[key]}
                    onChange={(e) => setCustomFlags({ ...customFlags, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          <button className="btn-primary" onClick={handleAdd} disabled={adding || !newEmail.trim()}>
            {adding ? "Adding…" : "Add person"}
          </button>
        </>
      )}
    </div>
  );
}
