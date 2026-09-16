import { createListItem, deleteListItem, queryListItems, updateListItem } from "./lists";
import { LIST_NAMES } from "./bootstrap";
import type { AnswerValue } from "../formsSchema/types";

/**
 * "Save and finish later" — a respondent's in-progress answers, resumable
 * across devices since it's stored in SharePoint rather than localStorage
 * (consistent with the rest of the app's zero-client-state philosophy).
 * Keyed by (formId, submitterEmail) — same primary-key convention as
 * everything else in this app.
 */
export interface DraftFields {
  Title: string; // mirrors SubmitterEmail, for legibility in SharePoint's default view
  FormId: string;
  SubmitterEmail: string;
  FormVersion: number;
  AnswersJson: string;
  VisitedSectionIdsJson: string;
  UpdatedAt: string;
}

export interface SavedDraft {
  itemId: string;
  formVersion: number;
  answers: Record<string, AnswerValue>;
  visitedSectionIds: string[];
  updatedAt: string;
}

export async function getDraft(formId: string, email: string): Promise<SavedDraft | null> {
  const items = await queryListItems<DraftFields>(LIST_NAMES.drafts, {
    filter: `fields/FormId eq '${formId}' and fields/SubmitterEmail eq '${email}'`,
    top: 1,
  });
  const item = items[0];
  if (!item) return null;
  return {
    itemId: item.id,
    formVersion: item.fields.FormVersion,
    answers: JSON.parse(item.fields.AnswersJson || "{}"),
    visitedSectionIds: JSON.parse(item.fields.VisitedSectionIdsJson || "[]"),
    updatedAt: item.fields.UpdatedAt,
  };
}

export async function saveDraft(params: {
  formId: string;
  submitterEmail: string;
  formVersion: number;
  answers: Record<string, AnswerValue>;
  visitedSectionIds: string[];
}): Promise<void> {
  const existing = await getDraft(params.formId, params.submitterEmail);
  const now = new Date().toISOString();
  const fields: DraftFields = {
    Title: params.submitterEmail,
    FormId: params.formId,
    SubmitterEmail: params.submitterEmail,
    FormVersion: params.formVersion,
    AnswersJson: JSON.stringify(params.answers),
    VisitedSectionIdsJson: JSON.stringify(params.visitedSectionIds),
    UpdatedAt: now,
  };
  if (existing) {
    await updateListItem<DraftFields>(LIST_NAMES.drafts, existing.itemId, fields);
  } else {
    await createListItem<DraftFields>(LIST_NAMES.drafts, fields);
  }
}

/** Called once a draft becomes a real submission — the draft's job is done. */
export async function deleteDraft(formId: string, email: string): Promise<void> {
  const existing = await getDraft(formId, email);
  if (existing) await deleteListItem(LIST_NAMES.drafts, existing.itemId);
}
