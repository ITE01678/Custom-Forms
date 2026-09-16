import type { FieldType, FormField } from "../../formsSchema/types";
import type { ConditionNode, Operator, Predicate } from "../../formsSchema/condition";

interface Props {
  condition: ConditionNode | undefined;
  availableFields: FormField[];
  onChange: (condition: ConditionNode | undefined) => void;
}

interface FlatState {
  combinator: "and" | "or";
  predicates: Predicate[];
}

function isPredicate(n: ConditionNode): n is Predicate {
  return "field" in n;
}

function toFlatState(node: ConditionNode | undefined): FlatState {
  if (!node) return { combinator: "and", predicates: [] };
  if ("and" in node) return { combinator: "and", predicates: node.and.filter(isPredicate) };
  if ("or" in node) return { combinator: "or", predicates: node.or.filter(isPredicate) };
  if ("not" in node) return { combinator: "and", predicates: [] }; // this simple builder doesn't author `not` — start fresh rather than lose data silently in a confusing way
  return { combinator: "and", predicates: [node] };
}

function toNode(state: FlatState): ConditionNode | undefined {
  if (state.predicates.length === 0) return undefined;
  if (state.predicates.length === 1) return state.predicates[0];
  return state.combinator === "and" ? { and: state.predicates } : { or: state.predicates };
}

const OPERATORS_BY_TYPE: Record<FieldType, { value: Operator; label: string }[]> = {
  shortText: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "notContains", label: "doesn't contain" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  longText: [
    { value: "contains", label: "contains" },
    { value: "notContains", label: "doesn't contain" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  singleChoice: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  multiChoice: [
    { value: "eq", label: "is exactly" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  rating: [
    { value: "eq", label: "=" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
  ],
  date: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  dateTime: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  fileUpload: [
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
  repeatingTable: [
    { value: "isEmpty", label: "is empty" },
    { value: "isNotEmpty", label: "is not empty" },
  ],
};

const NO_VALUE_OPERATORS = new Set<Operator>(["isEmpty", "isNotEmpty"]);

export function ConditionBuilder({ condition, availableFields, onChange }: Props) {
  const state = toFlatState(condition);

  function commit(next: FlatState) {
    onChange(toNode(next));
  }

  function updatePredicate(index: number, updates: Partial<Predicate>) {
    const predicates = state.predicates.map((p, i) => (i === index ? { ...p, ...updates } : p));
    commit({ ...state, predicates });
  }

  function addPredicate() {
    const first = availableFields[0];
    if (!first) return;
    commit({
      ...state,
      predicates: [...state.predicates, { field: first.id, operator: OPERATORS_BY_TYPE[first.type][0].value }],
    });
  }

  function removePredicate(index: number) {
    commit({ ...state, predicates: state.predicates.filter((_, i) => i !== index) });
  }

  if (availableFields.length === 0) {
    return <p className="error-text">No earlier fields to base a condition on — add fields to an earlier section first.</p>;
  }

  return (
    <div>
      {state.predicates.length > 1 && (
        <div className="condition-row">
          <span>Match</span>
          <select
            value={state.combinator}
            onChange={(e) => commit({ ...state, combinator: e.target.value as "and" | "or" })}
          >
            <option value="and">all</option>
            <option value="or">any</option>
          </select>
          <span>of the following:</span>
        </div>
      )}

      {state.predicates.map((predicate, i) => {
        const field = availableFields.find((f) => f.id === predicate.field) ?? availableFields[0];
        const operators = OPERATORS_BY_TYPE[field.type] ?? OPERATORS_BY_TYPE.shortText;
        const needsValue = !NO_VALUE_OPERATORS.has(predicate.operator);

        return (
          <div className="condition-row" key={i}>
            <select
              value={predicate.field}
              onChange={(e) => {
                const newField = availableFields.find((f) => f.id === e.target.value);
                const newOperators = newField ? OPERATORS_BY_TYPE[newField.type] : operators;
                updatePredicate(i, { field: e.target.value, operator: newOperators[0].value, value: undefined });
              }}
            >
              {availableFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={predicate.operator}
              onChange={(e) => updatePredicate(i, { operator: e.target.value as Operator, value: undefined })}
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {needsValue &&
              (field.type === "singleChoice" || field.type === "multiChoice" ? (
                <select
                  value={typeof predicate.value === "string" ? predicate.value : ""}
                  onChange={(e) => updatePredicate(i, { value: e.target.value })}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "number" || field.type === "rating" ? (
                <input
                  type="number"
                  value={typeof predicate.value === "number" ? predicate.value : ""}
                  onChange={(e) => updatePredicate(i, { value: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              ) : field.type === "date" || field.type === "dateTime" ? (
                <input
                  type="date"
                  value={typeof predicate.value === "string" ? predicate.value : ""}
                  onChange={(e) => updatePredicate(i, { value: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  value={typeof predicate.value === "string" ? predicate.value : ""}
                  onChange={(e) => updatePredicate(i, { value: e.target.value })}
                />
              ))}

            <button onClick={() => removePredicate(i)} title="Remove condition">
              ✕
            </button>
          </div>
        );
      })}

      <button onClick={addPredicate}>+ Add condition</button>
    </div>
  );
}
