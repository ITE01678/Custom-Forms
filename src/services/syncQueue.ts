import { createListItem, deleteListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { LIST_NAMES } from "./bootstrap";
import { getFormById } from "./forms";
import { appendResponseRow, findRowIndexByResponseId, updateResponseRow } from "./excel";
import { upsertIndex } from "./responseIndex";
import type { FormResponse } from "../formsSchema/types";

/**
 * The no-server durability layer described in the plan: written BEFORE each
 * Excel write attempt, so a response is never lost even if the Excel call
 * itself fails or times out — there's no cron worker here (no server to run
 * one on), so reconciliation happens client-side: on next load for the
 * submitter's own items (Phase 3), and via an admin "Sync Health" page for
 * anything still stuck (Phase 3).
 */

export type SyncOperation = "insert" | "update";
export type SyncStatus = "pending" | "done" | "failed";

export interface SyncQueueFields {
  Title: string; // mirrors ResponseId, purely so the item is legible in SharePoint's default view
  ResponseId: string;
  FormId: string;
  SubmitterEmail: string;
  Operation: SyncOperation;
  PayloadJson: string;
  Status: SyncStatus;
  Attempts: number;
  LastError?: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export async function enqueueWrite(params: {
  formId: string;
  responseId: string;
  submitterEmail: string;
  operation: SyncOperation;
  payload: unknown;
}): Promise<string> {
  const now = new Date().toISOString();
  const item = await createListItem<SyncQueueFields>(LIST_NAMES.syncQueue, {
    Title: params.responseId,
    ResponseId: params.responseId,
    FormId: params.formId,
    SubmitterEmail: params.submitterEmail,
    Operation: params.operation,
    PayloadJson: JSON.stringify(params.payload),
    Status: "pending",
    Attempts: 0,
    CreatedAt: now,
    UpdatedAt: now,
  });
  return item.id;
}

export async function markDone(itemId: string): Promise<void> {
  await updateListItem<SyncQueueFields>(LIST_NAMES.syncQueue, itemId, {
    Status: "done",
    UpdatedAt: new Date().toISOString(),
  });
}

export async function markFailed(itemId: string, attempts: number, error: string): Promise<void> {
  await updateListItem<SyncQueueFields>(LIST_NAMES.syncQueue, itemId, {
    Status: "failed",
    Attempts: attempts,
    LastError: error.slice(0, 4000),
    UpdatedAt: new Date().toISOString(),
  });
}

/** Tenant-wide stragglers for the admin "Sync Health" page (Phase 3). */
export async function getUnresolved() {
  return queryListItems<SyncQueueFields>(LIST_NAMES.syncQueue, {
    filter: "fields/Status ne 'done'",
  });
}

/** The current user's own stragglers, for silent self-retry on load (Phase 3). */
export async function getPendingForUser(email: string) {
  return queryListItems<SyncQueueFields>(LIST_NAMES.syncQueue, {
    filter: `fields/SubmitterEmail eq '${odataQuote(email)}' and fields/Status ne 'done'`,
  });
}

/** One form's stragglers — the per-form filtered view linked from the
 *  builder page, so an admin doesn't have to scan the tenant-wide list. */
export async function getUnresolvedForForm(formId: string) {
  return queryListItems<SyncQueueFields>(LIST_NAMES.syncQueue, {
    filter: `fields/FormId eq '${odataQuote(formId)}' and fields/Status ne 'done'`,
  });
}

/** Best-effort cleanup for a hard form delete — removes every SyncQueue
 *  entry for this form regardless of status, so a deleted form doesn't
 *  leave orphaned "failed"/"pending" rows pointing at nothing. */
export async function deleteAllForForm(formId: string): Promise<void> {
  const items = await queryListItems<SyncQueueFields>(LIST_NAMES.syncQueue, {
    filter: `fields/FormId eq '${odataQuote(formId)}'`,
  });
  await Promise.all(items.map((item) => deleteListItem(LIST_NAMES.syncQueue, item.id)));
}

/**
 * Retries a stuck SyncQueue item's Excel write — the manual recovery action
 * on the admin "Sync Health" page (there's no cron worker to do this
 * automatically, since there's no server). Re-derives the row index via a
 * full-table scan rather than trusting any previously cached index, since a
 * failed item's index was, by definition, never confirmed.
 */
export async function retryItem(item: ListItem<SyncQueueFields>): Promise<void> {
  const stored = await getFormById(item.fields.FormId);
  if (!stored) throw new Error(`Form ${item.fields.FormId} no longer exists.`);
  const response = JSON.parse(item.fields.PayloadJson) as FormResponse;

  let rowIndex: number;
  if (item.fields.Operation === "insert") {
    const existing = await findRowIndexByResponseId(stored.form, response.id);
    if (existing === null) {
      // appendResponseRow returns the index it just wrote directly — no
      // separate re-read needed (and no risk of that re-read racing a
      // just-completed upload; see excel.ts's doc comment on it).
      rowIndex = await appendResponseRow(stored.form, response);
    } else {
      rowIndex = existing; // already landed on a prior attempt — just re-index, don't duplicate
    }
  } else {
    const hint = (await findRowIndexByResponseId(stored.form, response.id)) ?? 0;
    rowIndex = await updateResponseRow(stored.form, response, hint, item.fields.SubmitterEmail);
  }

  await upsertIndex({
    formId: item.fields.FormId,
    responseId: response.id,
    submitterEmail: item.fields.SubmitterEmail,
    rowIndex,
  });
  await markDone(item.id);
}
