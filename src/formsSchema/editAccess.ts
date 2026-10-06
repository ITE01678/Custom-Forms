import type { FormDefinition, FormResponse } from "./types";

/**
 * Moved verbatim out of pages/fill/FillPage.tsx — pure, no I/O, so both the
 * single-form fill route and the cross-form My Responses page share one
 * definition of "is this still inside its self-edit window."
 */
export function isWithinSelfEditWindow(response: FormResponse, form: FormDefinition): boolean {
  const window = form.editPolicy.selfEditWindow;
  if (!window || window.type === "unlimited") return true;
  if (!response.submittedAt || !window.days) return true;
  const deadline = new Date(response.submittedAt).getTime() + window.days * 24 * 60 * 60 * 1000;
  return Date.now() <= deadline;
}

/** The same `editable` boolean FillPage.tsx computed inline. Callers still
 *  own the one piece of I/O this depends on — whether the response has an
 *  active approval-routing chain — since that's a List lookup, not pure
 *  logic; FillPage's own doc comment (preserved at its call site) explains
 *  why that check can't be skipped even when the form's CURRENT routing
 *  config has since changed. */
export function canSelfEdit(params: { form: FormDefinition; response: FormResponse; hasActiveRouting: boolean }): boolean {
  const { mode } = params.form.editPolicy;
  const selfCanEditMode = mode === "self-edit" || mode === "self-and-admin";
  return selfCanEditMode && !params.hasActiveRouting && isWithinSelfEditWindow(params.response, params.form);
}
