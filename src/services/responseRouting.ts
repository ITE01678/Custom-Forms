import { createListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { LIST_NAMES } from "./bootstrap";
import type { FormDefinition, ResponseRoutingState, RoutingHistoryEntry, RoutingStep } from "../formsSchema/types";

/**
 * Approval-chain state per response, kept in its own SharePoint List rather
 * than extra Excel columns — the response workbook's row shape never needs
 * to change (existing published forms/workbooks are unaffected), matching
 * how ResponseIndex/AuditLog already track response metadata outside Excel.
 */
export interface ResponseRoutingFields {
  Title: string; // mirrors ResponseId, for legibility in SharePoint's default view
  FormId: string;
  ResponseId: string;
  CurrentStepIndex: number;
  Status: string;
  HistoryJson: string;
  UpdatedAt: string;
}

function toState(item: ListItem<ResponseRoutingFields>): ResponseRoutingState {
  return {
    currentStepIndex: item.fields.CurrentStepIndex,
    status: item.fields.Status as ResponseRoutingState["status"],
    history: JSON.parse(item.fields.HistoryJson || "[]") as RoutingHistoryEntry[],
  };
}

export async function getRoutingState(
  formId: string,
  responseId: string
): Promise<{ itemId: string; state: ResponseRoutingState } | null> {
  const items = await queryListItems<ResponseRoutingFields>(LIST_NAMES.responseRouting, {
    filter: `fields/FormId eq '${odataQuote(formId)}' and fields/ResponseId eq '${odataQuote(responseId)}'`,
    top: 1,
  });
  const item = items[0];
  return item ? { itemId: item.id, state: toState(item) } : null;
}

/** Resolves a step's actual recipient email(s): a fixed designer-typed list,
 *  or the respondent's own answer to an "approverEmail"-type field. */
export function resolveStepRecipients(step: RoutingStep, answers: Record<string, unknown>): string[] {
  if (step.recipientSource === "designer") {
    return (step.recipients ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  const value = step.fieldId ? answers[step.fieldId] : undefined;
  return typeof value === "string" && value.trim() ? [value.trim().toLowerCase()] : [];
}

/** Creates the initial routing List item for a freshly submitted response —
 *  a no-op returning null when the form has no routing configured. */
export async function initRoutingState(form: FormDefinition, responseId: string): Promise<ResponseRoutingState | null> {
  const routing = form.routing;
  if (!routing || routing.mode === "none" || routing.steps.length === 0) return null;

  const now = new Date().toISOString();
  await createListItem<ResponseRoutingFields>(LIST_NAMES.responseRouting, {
    Title: responseId,
    FormId: form.id,
    ResponseId: responseId,
    CurrentStepIndex: 0,
    Status: "in-progress",
    HistoryJson: "[]",
    UpdatedAt: now,
  });

  return { currentStepIndex: 0, status: "in-progress", history: [] };
}

/** The step currently awaiting action — null once resolved, or if there's
 *  no routing configured at all. */
export function getCurrentStep(form: FormDefinition, state: ResponseRoutingState | undefined | null): RoutingStep | null {
  if (!form.routing || !state || state.status !== "in-progress") return null;
  return form.routing.steps[state.currentStepIndex] ?? null;
}

/**
 * Records an approve/reject action and computes the resulting state —
 * rejecting always stops the chain; approving advances to the next step
 * for "sequential" mode, or resolves the chain otherwise ("single"/
 * "multiple" are always one step, first-to-act). Pure — the caller
 * persists the result via `saveRoutingState`.
 */
export function advanceRoutingState(
  form: FormDefinition,
  current: ResponseRoutingState,
  actedBy: string,
  action: "approved" | "rejected",
  reason?: string
): ResponseRoutingState {
  // Without this, a routing step with more than one valid recipient (or an
  // approver with a stale tab still open after someone else already acted)
  // could apply a second decision on top of an already-resolved chain — e.g.
  // approver B clicking Approve after approver A already rejected would
  // silently flip a rejected response back to approved, with a
  // reject-then-approve history on the same step.
  if (current.status !== "in-progress") {
    throw new Error(`This response's approval has already been decided (${current.status}) — no further action is possible.`);
  }

  const step = form.routing?.steps[current.currentStepIndex];
  const entry: RoutingHistoryEntry = { stepId: step?.id ?? "", actedBy, action, at: new Date().toISOString(), reason };
  const history = [...current.history, entry];

  if (action === "rejected") {
    return { currentStepIndex: current.currentStepIndex, status: "rejected", history };
  }

  const isSequential = form.routing?.mode === "sequential";
  const hasNextStep = isSequential && current.currentStepIndex + 1 < (form.routing?.steps.length ?? 0);
  if (hasNextStep) {
    return { currentStepIndex: current.currentStepIndex + 1, status: "in-progress", history };
  }
  return { currentStepIndex: current.currentStepIndex, status: "approved", history };
}

export async function saveRoutingState(itemId: string, state: ResponseRoutingState): Promise<void> {
  await updateListItem<ResponseRoutingFields>(LIST_NAMES.responseRouting, itemId, {
    CurrentStepIndex: state.currentStepIndex,
    Status: state.status,
    HistoryJson: JSON.stringify(state.history),
    UpdatedAt: new Date().toISOString(),
  });
}
