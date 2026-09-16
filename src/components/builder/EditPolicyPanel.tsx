import type { EditPolicyConfig, FormDefinition } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";

interface Props {
  form: FormDefinition;
}

const MODE_LABELS: Record<EditPolicyConfig["mode"], string> = {
  none: "No edits — once submitted, a response is final (like MS Forms)",
  "self-edit": "Respondents can edit their own response",
  "admin-only": "Only form owners/admins can edit a response",
  "self-and-admin": "Both respondents and admins can edit",
};

export function EditPolicyPanel({ form }: Props) {
  const { updateForm } = useFormBuilderStore();

  function setPolicy(updates: Partial<EditPolicyConfig>) {
    updateForm({ editPolicy: { ...form.editPolicy, ...updates } });
  }

  const allowsSelfEdit = form.editPolicy.mode === "self-edit" || form.editPolicy.mode === "self-and-admin";

  return (
    <div className="panel">
      <h3>Response edit policy</h3>
      <p>
        Unlike MS Forms, this app can let people come back and change a response they already
        submitted — the primary key is always their official email, and every change is recorded
        in an audit trail admins can see.
      </p>

      <div className="field-row">
        {(Object.keys(MODE_LABELS) as EditPolicyConfig["mode"][]).map((mode) => (
          <label key={mode} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
            <input
              type="radio"
              name="edit-policy-mode"
              checked={form.editPolicy.mode === mode}
              onChange={() => setPolicy({ mode })}
            />
            {MODE_LABELS[mode]}
          </label>
        ))}
      </div>

      {allowsSelfEdit && (
        <>
          <div className="field-row">
            <label>Self-edit window</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <select
                value={form.editPolicy.selfEditWindow?.type ?? "unlimited"}
                onChange={(e) =>
                  setPolicy({
                    selfEditWindow: {
                      type: e.target.value as "unlimited" | "days",
                      days: form.editPolicy.selfEditWindow?.days ?? 7,
                    },
                  })
                }
              >
                <option value="unlimited">Unlimited</option>
                <option value="days">Limited to N days after submission</option>
              </select>
              {form.editPolicy.selfEditWindow?.type === "days" && (
                <input
                  type="number"
                  min={1}
                  style={{ width: "5rem" }}
                  value={form.editPolicy.selfEditWindow?.days ?? 7}
                  onChange={(e) =>
                    setPolicy({ selfEditWindow: { type: "days", days: Number(e.target.value) } })
                  }
                />
              )}
            </div>
          </div>

          <div className="field-row">
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={!!form.editPolicy.requireReasonForEdit}
                onChange={(e) => setPolicy({ requireReasonForEdit: e.target.checked })}
              />
              Require a reason when editing
            </label>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={!!form.editPolicy.notifyAdminOnEdit}
                onChange={(e) => setPolicy({ notifyAdminOnEdit: e.target.checked })}
              />
              Flag edited responses for admin review
            </label>
          </div>
        </>
      )}
    </div>
  );
}
