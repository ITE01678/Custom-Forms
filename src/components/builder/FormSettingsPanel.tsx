import type { FormDefinition, FormSettings } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";

interface Props {
  form: FormDefinition;
}

/** MS-Forms-style general settings: who can respond, an accept-responses
 *  window, shuffled question order, and the progress bar toggle. */
export function FormSettingsPanel({ form }: Props) {
  const { updateForm } = useFormBuilderStore();

  function setSettings(updates: Partial<FormSettings>) {
    updateForm({ settings: { ...form.settings, ...updates } });
  }

  return (
    <div className="panel">
      <h3>Who can respond</h3>
      <div className="field-row">
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input
            type="radio"
            name="response-access"
            checked={form.settings.responseAccess === "anyoneInOrg"}
            onChange={() => setSettings({ responseAccess: "anyoneInOrg" })}
          />
          Anyone signed in with an official @{form.owner.upn.split("@")[1] ?? "your-org"} account
        </label>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input
            type="radio"
            name="response-access"
            checked={form.settings.responseAccess === "specificPeople"}
            onChange={() => setSettings({ responseAccess: "specificPeople" })}
          />
          Only specific people
        </label>
      </div>
      {form.settings.responseAccess === "specificPeople" && (
        <div className="field-row">
          <label htmlFor="allowed-emails">Allowed email addresses (comma-separated)</label>
          <textarea
            id="allowed-emails"
            value={(form.settings.allowedEmails ?? []).join(", ")}
            onChange={(e) =>
              setSettings({
                allowedEmails: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}

      <h3>Accepting responses</h3>
      <div className="field-row" style={{ flexDirection: "row", gap: "1rem" }}>
        <div>
          <label htmlFor="opens-at">Opens</label>
          <input
            id="opens-at"
            type="datetime-local"
            value={form.settings.opensAt ?? ""}
            onChange={(e) => setSettings({ opensAt: e.target.value || undefined })}
          />
        </div>
        <div>
          <label htmlFor="closes-at">Closes</label>
          <input
            id="closes-at"
            type="datetime-local"
            value={form.settings.closesAt ?? ""}
            onChange={(e) => setSettings({ closesAt: e.target.value || undefined })}
          />
        </div>
      </div>
      <p className="fill-field__help">Leave either blank for no limit.</p>
      {form.settings.opensAt &&
        form.settings.closesAt &&
        new Date(form.settings.opensAt).getTime() > new Date(form.settings.closesAt).getTime() && (
          <p className="error-text">"Closes" is before "Opens" — this form would never accept responses.</p>
        )}

      <h3>Presentation</h3>
      <div className="field-row">
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={form.settings.showProgressBar}
            onChange={(e) => setSettings({ showProgressBar: e.target.checked })}
          />
          Show a progress bar
        </label>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={!!form.settings.shuffleSections}
            onChange={(e) => setSettings({ shuffleSections: e.target.checked })}
          />
          Shuffle section order per respondent
        </label>
      </div>
    </div>
  );
}
