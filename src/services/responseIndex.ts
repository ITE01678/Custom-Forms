import { createListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { LIST_NAMES } from "./bootstrap";

/**
 * FormId+ResponseId -> Excel row index — a CACHE, never the source of truth
 * for whether a response exists (that's the workbook itself). Self-healing
 * update logic in services/excel.ts corrects this if it drifts (e.g. someone
 * manually re-sorts the sheet).
 */
export interface ResponseIndexFields {
  Title: string; // mirrors ResponseId for legibility in SharePoint's default view
  FormId: string;
  ResponseId: string;
  SubmitterEmail: string;
  RowIndex: number;
  VerifiedAt: string;
}

export async function getIndexByResponseId(
  formId: string,
  responseId: string
): Promise<ListItem<ResponseIndexFields> | null> {
  const items = await queryListItems<ResponseIndexFields>(LIST_NAMES.responseIndex, {
    filter: `fields/FormId eq '${odataQuote(formId)}' and fields/ResponseId eq '${odataQuote(responseId)}'`,
    top: 1,
  });
  return items[0] ?? null;
}

/** Submitter email is the primary key for "do I already have a response?" —
 *  this is the lookup the existing-response gate uses. */
export async function getIndexBySubmitter(
  formId: string,
  submitterEmail: string
): Promise<ListItem<ResponseIndexFields> | null> {
  const items = await queryListItems<ResponseIndexFields>(LIST_NAMES.responseIndex, {
    filter: `fields/FormId eq '${odataQuote(formId)}' and fields/SubmitterEmail eq '${odataQuote(submitterEmail)}'`,
    top: 1,
  });
  return items[0] ?? null;
}

export async function upsertIndex(params: {
  formId: string;
  responseId: string;
  submitterEmail: string;
  rowIndex: number;
}): Promise<void> {
  const existing = await getIndexByResponseId(params.formId, params.responseId);
  const now = new Date().toISOString();
  if (existing) {
    await updateListItem<ResponseIndexFields>(LIST_NAMES.responseIndex, existing.id, {
      RowIndex: params.rowIndex,
      VerifiedAt: now,
    });
  } else {
    await createListItem<ResponseIndexFields>(LIST_NAMES.responseIndex, {
      Title: params.responseId,
      FormId: params.formId,
      ResponseId: params.responseId,
      SubmitterEmail: params.submitterEmail,
      RowIndex: params.rowIndex,
      VerifiedAt: now,
    });
  }
}
