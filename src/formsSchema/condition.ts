/**
 * A small, hand-rolled condition evaluator (deliberately not a generic library
 * like json-logic-js) — see the plan's rationale: rules are always authored
 * through a fixed builder UI over an enumerable operator set, so a bespoke,
 * fully-typed evaluator is simpler and safer than an open-ended one.
 */

export type Operator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "notContains"
  | "isEmpty"
  | "isNotEmpty"
  | "in"
  | "notIn"
  | "lengthEq"
  | "lengthGt"
  | "lengthGte"
  | "lengthLt"
  | "lengthLte";

export interface Predicate {
  field: string; // fieldId
  operator: Operator;
  value?: string | number | boolean | string[];
}

export type ConditionNode = Predicate | { and: ConditionNode[] } | { or: ConditionNode[] } | { not: ConditionNode };

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function evaluatePredicate(predicate: Predicate, actual: unknown): boolean {
  const { operator, value } = predicate;

  switch (operator) {
    case "isEmpty":
      return isEmptyValue(actual);
    case "isNotEmpty":
      return !isEmptyValue(actual);
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "gt":
      return typeof actual === "number" && typeof value === "number" && actual > value;
    case "gte":
      return typeof actual === "number" && typeof value === "number" && actual >= value;
    case "lt":
      return typeof actual === "number" && typeof value === "number" && actual < value;
    case "lte":
      return typeof actual === "number" && typeof value === "number" && actual <= value;
    case "contains":
      return typeof actual === "string" && typeof value === "string" && actual.includes(value);
    case "notContains":
      return typeof actual === "string" && typeof value === "string" && !actual.includes(value);
    case "in":
      return Array.isArray(value) && typeof actual === "string" && value.includes(actual);
    case "notIn":
      return Array.isArray(value) && typeof actual === "string" && !value.includes(actual);
    case "lengthEq":
      return typeof actual === "string" && typeof value === "number" && actual.length === value;
    case "lengthGt":
      return typeof actual === "string" && typeof value === "number" && actual.length > value;
    case "lengthGte":
      return typeof actual === "string" && typeof value === "number" && actual.length >= value;
    case "lengthLt":
      return typeof actual === "string" && typeof value === "number" && actual.length < value;
    case "lengthLte":
      return typeof actual === "string" && typeof value === "number" && actual.length <= value;
    default:
      return false;
  }
}

export function evaluateCondition(node: ConditionNode, answers: Record<string, unknown>): boolean {
  if ("and" in node) return node.and.every((n) => evaluateCondition(n, answers));
  if ("or" in node) return node.or.some((n) => evaluateCondition(n, answers));
  if ("not" in node) return !evaluateCondition(node.not, answers);
  return evaluatePredicate(node, answers[node.field]);
}
