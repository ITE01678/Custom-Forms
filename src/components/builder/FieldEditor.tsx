import type { ConnectorType, FormField } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";

export interface ConnectorOption {
  id: string;
  name: string;
  type: ConnectorType;
}

interface Props {
  sectionId: string;
  field: FormField;
  isFirst: boolean;
  isLast: boolean;
  connectorOptions: ConnectorOption[];
}

const CHOICE_TYPES = new Set(["singleChoice", "multiChoice"]);
const TEXT_TYPES = new Set(["shortText", "longText"]);

const PATTERN_PRESETS: { label: string; pattern?: string }[] = [
  { label: "No format restriction" },
  { label: "Email address", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
  { label: "Phone number", pattern: "^[0-9+()\\-\\s]{7,}$" },
  { label: "Numbers only", pattern: "^[0-9]+$" },
];

const GRAPH_PROPERTIES: { value: string; label: string }[] = [
  { value: "department", label: "Department" },
  { value: "employeeId", label: "Employee ID" },
  { value: "jobTitle", label: "Job title" },
  { value: "displayName", label: "Full name" },
  { value: "mail", label: "Email" },
  { value: "officeLocation", label: "Office location" },
];

export function FieldEditor({ sectionId, field, isFirst, isLast, connectorOptions }: Props) {
  const { updateField, removeField, duplicateField, moveField } = useFormBuilderStore();

  const set = (updates: Partial<FormField>) => updateField(sectionId, field.id, updates);
  const setValidation = (updates: Partial<NonNullable<FormField["validation"]>>) =>
    set({ validation: { ...field.validation, ...updates } });

  const isChoice = CHOICE_TYPES.has(field.type);
  const isText = TEXT_TYPES.has(field.type);
  const isNumber = field.type === "number";
  const isFileUpload = field.type === "fileUpload";
  const isAutofill = field.fillMode !== "manual";

  return (
    <div className={`field-editor ${isAutofill ? "field-editor--autofill" : ""}`}>
      <div className="field-editor__row">
        <span className="field-editor__type">{field.type}</span>
        {isAutofill && (
          <span className="autofill-badge">
            <span className="autofill-badge__dot" />
            auto
          </span>
        )}
        <input
          className="field-editor__label"
          value={field.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Question"
        />
        <label className="field-editor__required">
          <input
            type="checkbox"
            checked={!!field.validation?.required}
            onChange={(e) => setValidation({ required: e.target.checked })}
          />
          Required
        </label>
        <button onClick={() => duplicateField(sectionId, field.id)} title="Duplicate field">
          ⧉
        </button>
        <button onClick={() => moveField(sectionId, field.id, "up")} disabled={isFirst} title="Move up">
          ↑
        </button>
        <button onClick={() => moveField(sectionId, field.id, "down")} disabled={isLast} title="Move down">
          ↓
        </button>
        <button onClick={() => removeField(sectionId, field.id)} title="Remove field">
          ✕
        </button>
      </div>

      {isChoice && (
        <>
          <div className="field-editor__options">
            {(field.options ?? []).map((opt, i) => (
              <div key={opt.value} className="field-editor__option">
                <input
                  value={opt.label}
                  onChange={(e) => {
                    const options = [...(field.options ?? [])];
                    options[i] = { ...opt, label: e.target.value };
                    set({ options });
                  }}
                />
                <button
                  onClick={() => set({ options: (field.options ?? []).filter((_, j) => j !== i) })}
                  title="Remove option"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                set({
                  options: [
                    ...(field.options ?? []),
                    {
                      value: `option-${(field.options?.length ?? 0) + 1}-${crypto.randomUUID().slice(0, 4)}`,
                      label: "New option",
                    },
                  ],
                })
              }
            >
              + Add option
            </button>
          </div>

          <div className="field-editor__toggles">
            <label>
              <input type="checkbox" checked={!!field.allowOther} onChange={(e) => set({ allowOther: e.target.checked })} />
              Add "Other" option
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!field.shuffleOptions}
                onChange={(e) => set({ shuffleOptions: e.target.checked })}
              />
              Shuffle option order
            </label>
          </div>
        </>
      )}

      {isText && (
        <div className="field-editor__validation-row">
          <label>
            Min length{" "}
            <input
              type="number"
              min={0}
              value={field.validation?.minLength ?? ""}
              onChange={(e) => setValidation({ minLength: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>
            Max length{" "}
            <input
              type="number"
              min={0}
              value={field.validation?.maxLength ?? ""}
              onChange={(e) => setValidation({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>
            Format{" "}
            <select
              value={PATTERN_PRESETS.find((p) => p.pattern === field.validation?.pattern)?.label ?? PATTERN_PRESETS[0].label}
              onChange={(e) => {
                const preset = PATTERN_PRESETS.find((p) => p.label === e.target.value);
                setValidation({ pattern: preset?.pattern });
              }}
            >
              {PATTERN_PRESETS.map((p) => (
                <option key={p.label}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {isNumber && (
        <div className="field-editor__validation-row">
          <label>
            Min{" "}
            <input
              type="number"
              value={field.validation?.min ?? ""}
              onChange={(e) => setValidation({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>
            Max{" "}
            <input
              type="number"
              value={field.validation?.max ?? ""}
              onChange={(e) => setValidation({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      {isFileUpload && (
        <div className="field-editor__validation-row">
          <label>
            Max files{" "}
            <input
              type="number"
              min={1}
              value={field.validation?.maxFiles ?? 1}
              onChange={(e) => setValidation({ maxFiles: Number(e.target.value) || 1 })}
            />
          </label>
          <label>
            Max size (MB){" "}
            <input
              type="number"
              min={1}
              value={field.validation?.maxFileSizeMb ?? 25}
              onChange={(e) => setValidation({ maxFileSizeMb: Number(e.target.value) || 25 })}
            />
          </label>
          <label>
            Allowed types{" "}
            <input
              type="text"
              value={field.validation?.fileTypes?.join(", ") ?? ""}
              onChange={(e) =>
                setValidation({
                  fileTypes: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="pdf, docx, png (blank = any)"
            />
          </label>
        </div>
      )}

      {field.type === "repeatingTable" && (
        <RepeatingTableSettings field={field} connectorOptions={connectorOptions} onChange={set} />
      )}

      {field.type !== "repeatingTable" && (
      <>
      <div className="field-editor__validation-row">
        <label>
          Fill mode{" "}
          <select
            value={field.fillMode}
            onChange={(e) => {
              const fillMode = e.target.value as FormField["fillMode"];
              if (fillMode === "manual") {
                set({ fillMode, readOnly: false, graphAutofill: undefined, connectorAutofill: undefined });
              } else if (fillMode === "graph-autofill") {
                set({
                  fillMode,
                  readOnly: true,
                  graphAutofill: field.graphAutofill ?? { source: "self-profile", graphProperty: "department" },
                });
              } else {
                set({
                  fillMode,
                  readOnly: true,
                  connectorAutofill:
                    field.connectorAutofill ??
                    (connectorOptions[0]
                      ? {
                          connectorId: connectorOptions[0].id,
                          connectorType: connectorOptions[0].type,
                          lookupKeyExpression: "{{respondent.department}}",
                          outputMapping: [{ key: "value", label: field.label, type: "text" }],
                          expectMultipleRows: false,
                          emptyResultBehavior: "showMessage",
                          errorBehavior: "showWarningAllowManualOverride",
                        }
                      : undefined),
                });
              }
            }}
          >
            <option value="manual">Manual — respondent types it</option>
            <option value="graph-autofill">Auto-fill from your Microsoft profile</option>
            <option value="connector-autofill">Auto-fill from a data source connector</option>
          </select>
        </label>
      </div>

      {field.fillMode === "graph-autofill" && (
        <div className="field-editor__validation-row">
          <label>
            Profile property{" "}
            <select
              value={field.graphAutofill?.graphProperty ?? "department"}
              onChange={(e) =>
                set({
                  graphAutofill: {
                    source: "self-profile",
                    graphProperty: e.target.value,
                    allowManualOverride: field.graphAutofill?.allowManualOverride,
                  },
                })
              }
            >
              {GRAPH_PROPERTIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={field.graphAutofill?.allowManualOverride !== false}
              onChange={(e) =>
                field.graphAutofill &&
                set({ graphAutofill: { ...field.graphAutofill, allowManualOverride: e.target.checked } })
              }
            />
            Let respondent switch to manual entry
          </label>
        </div>
      )}

      {field.fillMode === "connector-autofill" && (
        <div className="field-editor__validation-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {connectorOptions.length === 0 ? (
            <p className="error-text">
              No connectors configured yet — add one under "Data source connectors" from the dashboard first.
            </p>
          ) : (
            <>
              <label>
                Connector{" "}
                <select
                  value={field.connectorAutofill?.connectorId ?? ""}
                  onChange={(e) => {
                    const opt = connectorOptions.find((c) => c.id === e.target.value);
                    if (!opt || !field.connectorAutofill) return;
                    set({ connectorAutofill: { ...field.connectorAutofill, connectorId: opt.id, connectorType: opt.type } });
                  }}
                >
                  {connectorOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lookup key{" "}
                <input
                  type="text"
                  value={field.connectorAutofill?.lookupKeyExpression ?? ""}
                  onChange={(e) =>
                    field.connectorAutofill &&
                    set({ connectorAutofill: { ...field.connectorAutofill, lookupKeyExpression: e.target.value } })
                  }
                  placeholder="{{respondent.department}} or {{fields.someFieldId}}"
                />
              </label>
              <label>
                Source field to use{" "}
                <input
                  type="text"
                  value={field.connectorAutofill?.outputMapping[0]?.key ?? ""}
                  onChange={(e) =>
                    field.connectorAutofill &&
                    set({
                      connectorAutofill: {
                        ...field.connectorAutofill,
                        outputMapping: [{ key: e.target.value, label: field.label, type: "text" }],
                      },
                    })
                  }
                  placeholder="e.g. displayName, mail, department"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={field.connectorAutofill?.allowManualOverride !== false}
                  onChange={(e) =>
                    field.connectorAutofill &&
                    set({ connectorAutofill: { ...field.connectorAutofill, allowManualOverride: e.target.checked } })
                  }
                />
                Let respondent switch to manual entry
              </label>
            </>
          )}
        </div>
      )}
      </>
      )}

      <input
        className="field-editor__help"
        value={field.helpText ?? ""}
        onChange={(e) => set({ helpText: e.target.value })}
        placeholder="Help text (optional)"
      />
    </div>
  );
}

interface RepeatingTableSettingsProps {
  field: FormField;
  connectorOptions: ConnectorOption[];
  onChange: (updates: Partial<FormField>) => void;
}

/** repeatingTable fields are always connector-sourced (e.g. a team roster) —
 *  this configures the connector + lookup key + output columns in one place,
 *  rather than sharing the scalar fillMode selector above. */
function RepeatingTableSettings({ field, connectorOptions, onChange }: RepeatingTableSettingsProps) {
  const columns = field.columns ?? [];
  const autofill = field.connectorAutofill;

  function updateAutofill(updates: Partial<NonNullable<FormField["connectorAutofill"]>>) {
    if (!autofill) return;
    onChange({ connectorAutofill: { ...autofill, ...updates } });
  }

  if (connectorOptions.length === 0) {
    return (
      <p className="error-text">
        No connectors configured yet — add one under "Data source connectors" from the dashboard first.
      </p>
    );
  }

  return (
    <div className="field-editor__validation-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <label>
        Connector{" "}
        <select
          value={autofill?.connectorId ?? ""}
          onChange={(e) => {
            const opt = connectorOptions.find((c) => c.id === e.target.value);
            if (!opt) return;
            onChange({
              connectorAutofill: {
                connectorId: opt.id,
                connectorType: opt.type,
                lookupKeyExpression: autofill?.lookupKeyExpression ?? "{{respondent.department}}",
                outputMapping: columns.map((c) => ({ key: c.key, label: c.label, type: c.type })),
                expectMultipleRows: true,
                emptyResultBehavior: autofill?.emptyResultBehavior ?? "showMessage",
                errorBehavior: autofill?.errorBehavior ?? "showWarningAllowManualOverride",
              },
            });
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          {connectorOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Lookup key{" "}
        <input
          type="text"
          value={autofill?.lookupKeyExpression ?? ""}
          onChange={(e) => updateAutofill({ lookupKeyExpression: e.target.value })}
          placeholder="{{respondent.department}} or {{fields.someFieldId}}"
        />
      </label>

      <div>
        <strong>Columns</strong> (must match the connector's output field names)
        {columns.map((col, i) => (
          <div key={i} className="field-editor__option">
            <input
              value={col.label}
              placeholder="Column label"
              onChange={(e) => {
                const next = [...columns];
                next[i] = { ...col, label: e.target.value };
                onChange({ columns: next });
              }}
            />
            <input
              value={col.key}
              placeholder="Connector output key"
              onChange={(e) => {
                const next = [...columns];
                next[i] = { ...col, key: e.target.value };
                onChange({
                  columns: next,
                  connectorAutofill: autofill
                    ? { ...autofill, outputMapping: next.map((c) => ({ key: c.key, label: c.label, type: c.type })) }
                    : undefined,
                });
              }}
            />
            <button onClick={() => onChange({ columns: columns.filter((_, j) => j !== i) })} title="Remove column">
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ columns: [...columns, { key: `col${columns.length + 1}`, label: "New column", type: "text" }] })}
        >
          + Add column
        </button>
      </div>

      <label>
        If no rows found{" "}
        <select
          value={autofill?.emptyResultBehavior ?? "showMessage"}
          onChange={(e) => updateAutofill({ emptyResultBehavior: e.target.value as never })}
        >
          <option value="showEmptyTable">Show an empty table</option>
          <option value="hideField">Hide the field</option>
          <option value="showMessage">Show a message</option>
        </select>
      </label>
      <label>
        If the connector fails{" "}
        <select
          value={autofill?.errorBehavior ?? "showWarningAllowManualOverride"}
          onChange={(e) => updateAutofill({ errorBehavior: e.target.value as never })}
        >
          <option value="blockSubmit">Block submission</option>
          <option value="showWarningAllowManualOverride">Warn, let respondent enter rows manually</option>
          <option value="showErrorAllowRetry">Show an error with a retry button</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={autofill?.allowManualOverride !== false}
          onChange={(e) => updateAutofill({ allowManualOverride: e.target.checked })}
        />
        Let respondent switch to a manual grid anytime
      </label>
    </div>
  );
}
