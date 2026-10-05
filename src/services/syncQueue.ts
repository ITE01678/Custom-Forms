import { createListItem, deleteListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { LIST_NAMES } from "./bootstrap";
import { getFormById, getFormVersion } from "./forms";
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
  try {
    const stored = await getFormById(item.fields.FormId);
    if (!stored) throw new Error(`Form ${item.fields.FormId} no longer exists.`);
    const response = JSON.parse(item.fields.PayloadJson) as FormResponse;

    // Must resolve the EXACT version this response's answers were captured
    // against, not whatever the form's current/latest draft happens to be —
    // otherwise a form edit/republish that lands while this item sits stuck
    // (renaming/regenerating a choice field's options is the common case)
    // makes resolveOptionLabel's lookup miss, silently writing the raw
    // internal option value (e.g. "option-4-aa71") instead of its label. Same
    // pattern FillPage/ResponseDetailPage/ApprovePage already use for editing
    // an existing response. Falls back to the current form only if that exact
    // version snapshot is gone (shouldn't normally happen — versions are
    // immutable once published).
    const pinnedForm = (await getFormVersion(item.fields.FormId, response.formVersion)) ?? stored.form;

    let rowIndex: number;
    if (item.fields.Operation === "insert") {
      const existing = await findRowIndexByResponseId(pinnedForm, response.id);
      if (existing === null) {
        // appendResponseRow returns the index it just wrote directly — no
        // separate re-read needed (and no risk of that re-read racing a
        // just-completed upload; see excel.ts's doc comment on it).
        rowIndex = await appendResponseRow(pinnedForm, response);
      } else {
        rowIndex = existing; // already landed on a prior attempt — just re-index, don't duplicate
      }
    } else {
      const hint = (await findRowIndexByResponseId(pinnedForm, response.id)) ?? 0;
      rowIndex = await updateResponseRow(pinnedForm, response, hint, item.fields.SubmitterEmail);
    }

    await upsertIndex({
      formId: item.fields.FormId,
      responseId: response.id,
      submitterEmail: item.fields.SubmitterEmail,
      rowIndex,
    });
    await markDone(item.id);
  } catch (err) {
    // Both callers (the admin's manual Sync Health retry button, and
    // AuthGate's silent auto-retry-on-load) previously just logged this and
    // moved on — the SyncQueue item itself was never updated, so a retry
    // that failed again looked, to anyone checking Sync Health, identical to
    // one that had never been retried at all: same stale Attempts count,
    // same stale LastError from the original submit. Recording it here once,
    // rather than duplicating this in both callers, keeps it accurate
    // regardless of which path triggered the retry.
    await markFailed(
      item.id,
      item.fields.Attempts + 1,
      err instanceof Error ? err.message : String(err)
    ).catch(() => {
      // Best-effort — if recording the failure itself fails (e.g. the same
      // transient Graph issue), don't mask the original error with this one.
    });
    throw err;
  }
}
