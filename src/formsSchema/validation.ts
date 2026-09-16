import type { AnswerValue, FormField, RepeatingTableValue } from "./types";

export interface FieldError {
  fieldId: string;
  message: string;
}

function isRepeatingTableValue(v: AnswerValue): v is RepeatingTableValue {
  return !!v && typeof v === "object" && "rows" in v;
}

/** Validates one field's answer against its `validation` rules. Returns an
 *  error message, or null if valid. Shared by the runtime (client + a
 *  re-validation pass before submit) and the builder's live preview. */
export function validateField(field: FormField, value: AnswerValue): string | null {
  const rules = field.validation;
  if (!rules) return null;

  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (isRepeatingTableValue(value) && value.rows.length === 0);

  if (rules.required && isEmpty) {
    return rules.customMessage ?? `${field.label} is required.`;
  }
  if (isEmpty) return null; // nothing further to check on an optional, empty field

  if (typeof value === "string") {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return rules.customMessage ?? `${field.label} must be at least ${rules.minLength} characters.`;
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return rules.customMessage ?? `${field.label} must be at most ${rules.maxLength} characters.`;
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      return rules.customMessage ?? `${field.label} is not in the expected format.`;
    }
  }

  if (typeof value === "number") {
    if (rules.min !== undefined && value < rules.min) {
      return rules.customMessage ?? `${field.label} must be at least ${rules.min}.`;
    }
    if (rules.max !== undefined && value > rules.max) {
      return rules.customMessage ?? `${field.label} must be at most ${rules.max}.`;
    }
  }

  return null;
}

/** Validates every currently-visible field in a set, returning all errors. */
export function validateFields(
  fields: FormField[],
  answers: Record<string, AnswerValue>
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of fields) {
    const message = validateField(field, answers[field.id] ?? null);
    if (message) errors.push({ fieldId: field.id, message });
  }
  return errors;
}
