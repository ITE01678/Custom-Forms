import type { FormDefinition, RoutingConfig, RoutingStep } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";
import { flattenFields } from "../../services/excel";

interface Props {
  form: FormDefinition;
}

/** Toggleable list of section checkboxes — reused for "who fills what" at
 *  each stage. Empty/all-checked both mean "no restriction," so an admin
 *  ticking every box and one leaving it untouched behave identically. */
function SectionChecklist({
  form,
  selectedIds,
  onChange,
}: {
  form: FormDefinition;
  selectedIds: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const sorted = [...form.sections].sort((a, b) => a.order - b.order);
  const selected = new Set(selectedIds ?? []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className="routing-section-checklist">
      {sorted.map((s) => (
        <label key={s.id} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
          {s.title || "(untitled section)"}
        </label>
      ))}
    </div>
  );
}

const MODE_LABELS: Record<RoutingConfig["mode"], string> = {
  none: "No routing — a response is just recorded, like normal",
  single: "Send to one approver",
  multiple: "Send to several people — first to act completes it",
  sequential: "Send through an approval chain, one stage at a time",
};

function newStep(): RoutingStep {
  return { id: crypto.randomUUID(), recipientSource: "designer", recipients: [] };
}

/** "Send to" approval routing config — sibling to EditPolicyPanel, same
 *  radio-group-over-enum + conditionally-rendered sub-panel shape. */
export function RoutingPanel({ form }: Props) {
  const { updateForm } = useFormBuilderStore();
  const routing: RoutingConfig = form.routing ?? { mode: "none", steps: [] };
  const approverFields = flattenFields(form).filter((f) => f.type === "approverEmail");

  function setRouting(updates: Partial<RoutingConfig>) {
    updateForm({ routing: { ...routing, ...updates } });
  }

  function setMode(mode: RoutingConfig["mode"]) {
    if (mode === "none") {
      setRouting({ mode, steps: [] });
    } else if (mode === "sequential") {
      setRouting({ mode, steps: routing.steps.length > 0 ? routing.steps : [newStep()] });
    } else {
      // single/multiple always use exactly one step
      setRouting({ mode, steps: routing.steps.length > 0 ? [routing.steps[0]] : [newStep()] });
    }
  }

  function updateStep(index: number, updates: Partial<RoutingStep>) {
    const steps = routing.steps.map((s, i) => (i === index ? { ...s, ...updates } : s));
    setRouting({ steps });
  }

  function addStep() {
    setRouting({ steps: [...routing.steps, newStep()] });
  }

  function removeStep(index: number) {
    setRouting({ steps: routing.steps.filter((_, i) => i !== index) });
  }

  return (
    <div className="panel">
      <h3>Send to / approval routing</h3>
      <p>
        Route a submitted response to one or more people for review — each gets a link to a
        pre-filled, editable copy of the response, and can approve or reject it.
      </p>

      <div className="field-row">
        {(Object.keys(MODE_LABELS) as RoutingConfig["mode"][]).map((mode) => (
          <label key={mode} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
            <input type="radio" name="routing-mode" checked={routing.mode === mode} onChange={() => setMode(mode)} />
            {MODE_LABELS[mode]}
          </label>
        ))}
      </div>

      {routing.mode === "sequential" && form.sections.length > 1 && (
        <div className="field-row">
          <label>Which sections can the original respondent fill in first?</label>
          <p className="fill-field__help">
            Leave every box unchecked (or check them all) for no restriction — the respondent can
            fill in the whole form, as normal.
          </p>
          <SectionChecklist
            form={form}
            selectedIds={routing.initialSectionIds}
            onChange={(ids) => setRouting({ initialSectionIds: ids })}
          />
        </div>
      )}

      {routing.mode !== "none" && (
        <div className="routing-steps">
          {routing.steps.map((step, i) => (
            <div className="routing-step" key={step.id}>
              {routing.mode === "sequential" && <div className="routing-step__number">Stage {i + 1}</div>}

              {routing.mode === "sequential" && form.sections.length > 1 && (
                <div className="field-row">
                  <label>Which sections can this stage edit?</label>
                  <p className="fill-field__help">
                    Leave unchecked/all-checked for no restriction — sections handled at an
                    earlier stage still show here for context, read-only.
                  </p>
                  <SectionChecklist
                    form={form}
                    selectedIds={step.editableSectionIds}
                    onChange={(ids) => updateStep(i, { editableSectionIds: ids })}
                  />
                </div>
              )}

              <div className="field-row">
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={step.recipientSource === "respondent-field"}
                    onChange={(e) =>
                      updateStep(i, {
                        recipientSource: e.target.checked ? "respondent-field" : "designer",
                        fieldId: e.target.checked ? approverFields[0]?.id : undefined,
                      })
                    }
                  />
                  Let the respondent choose who reviews this
                </label>
              </div>

              {step.recipientSource === "respondent-field" ? (
                approverFields.length === 0 ? (
                  <p className="error-text">
                    Add an "Approver email" field to the form first — the respondent picks a
                    reviewer by answering it.
                  </p>
                ) : (
                  <div className="field-row">
                    <label>Which field</label>
                    <select value={step.fieldId ?? ""} onChange={(e) => updateStep(i, { fieldId: e.target.value })}>
                      {approverFields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                <div className="field-row">
                  <label>Recipient email(s), comma-separated</label>
                  <textarea
                    value={(step.recipients ?? []).join(", ")}
                    onChange={(e) =>
                      updateStep(i, {
                        recipients: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  {(step.recipients ?? []).length === 0 && (
                    <p className="error-text">
                      No recipients — every response submitted through this stage would sit
                      awaiting approval forever, with nobody able to open it.
                    </p>
                  )}
                </div>
              )}

              {routing.mode === "sequential" && routing.steps.length > 1 && (
                <button onClick={() => removeStep(i)}>Remove stage</button>
              )}
            </div>
          ))}

          {routing.mode === "sequential" && <button onClick={addStep}>+ Add stage</button>}
        </div>
      )}
    </div>
  );
}
