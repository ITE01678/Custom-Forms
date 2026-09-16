import type { BranchRule, FormDefinition, FormField, FormSection } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";
import { ConditionBuilder } from "./ConditionBuilder";

interface Props {
  form: FormDefinition;
}

function earlierFields(form: FormDefinition, section: FormSection): FormField[] {
  return [...form.sections]
    .filter((s) => s.order < section.order)
    .sort((a, b) => a.order - b.order)
    .flatMap((s) => s.fields);
}

const END_OF_FORM = "__end__";

export function BranchingPanel({ form }: Props) {
  const { updateSection } = useFormBuilderStore();
  const sortedSections = [...form.sections].sort((a, b) => a.order - b.order);

  if (sortedSections.length < 2) {
    return (
      <div className="panel">
        <h3>Branching</h3>
        <p>Add at least two sections to set up conditional visibility or branch rules between them.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Branching</h3>
      <p>
        Show or skip a whole section based on earlier answers, or send respondents down a
        different path — like MS Forms' "Add branching," but changeable after the fact since
        responses here can be edited.
      </p>

      {sortedSections.map((section, i) => {
        const fields = earlierFields(form, section);
        const otherSections = sortedSections.filter((s) => s.id !== section.id);

        function addRule() {
          if (fields.length === 0) return;
          const rule: BranchRule = {
            id: crypto.randomUUID(),
            when: { field: fields[0].id, operator: "isNotEmpty" },
            goTo: otherSections[0]?.id ?? section.id,
          };
          updateSection(section.id, { branchRules: [...(section.branchRules ?? []), rule] });
        }

        function updateRule(ruleId: string, updates: Partial<BranchRule>) {
          updateSection(section.id, {
            branchRules: (section.branchRules ?? []).map((r) => (r.id === ruleId ? { ...r, ...updates } : r)),
          });
        }

        function removeRule(ruleId: string) {
          updateSection(section.id, { branchRules: (section.branchRules ?? []).filter((r) => r.id !== ruleId) });
        }

        return (
          <div key={section.id} className="section-editor">
            <h4>{section.title}</h4>

            {i > 0 && (
              <>
                <p style={{ marginBottom: "0.3rem", fontWeight: 600 }}>Only show this section if…</p>
                {fields.length === 0 ? (
                  <p className="error-text">No earlier fields available — this section always shows.</p>
                ) : (
                  <ConditionBuilder
                    condition={section.visibility}
                    availableFields={fields}
                    onChange={(condition) => updateSection(section.id, { visibility: condition })}
                  />
                )}
              </>
            )}

            <p style={{ marginTop: "1rem", marginBottom: "0.3rem", fontWeight: 600 }}>
              After this section, branch to…
            </p>
            {(section.branchRules ?? []).map((rule) => (
              <div key={rule.id} className="branch-rule">
                <div style={{ flex: 1 }}>
                  <ConditionBuilder
                    condition={rule.when}
                    availableFields={[...fields, ...section.fields]}
                    onChange={(condition) => condition && updateRule(rule.id, { when: condition })}
                  />
                </div>
                <span>go to</span>
                <select value={rule.goTo} onChange={(e) => updateRule(rule.id, { goTo: e.target.value })}>
                  {otherSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeRule(rule.id)} title="Remove rule">
                  ✕
                </button>
              </div>
            ))}
            <button onClick={addRule} disabled={fields.length === 0 && section.fields.length === 0}>
              + Add branch rule
            </button>

            <div className="field-row" style={{ marginTop: "0.75rem" }}>
              <label>Otherwise, continue to</label>
              <select
                value={section.defaultNext ?? END_OF_FORM}
                onChange={(e) =>
                  updateSection(section.id, {
                    defaultNext: e.target.value === END_OF_FORM ? undefined : e.target.value,
                  })
                }
              >
                <option value={END_OF_FORM}>Next section in order</option>
                {otherSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
