import { createListItem, deleteListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIST_NAMES } from "./bootstrap";
import type { FormCollaborator } from "../formsSchema/types";

/**
 * Per-form collaborator grants — the "Access control" builder panel writes
 * here. Deliberately its own SharePoint List, not a field inside
 * DraftSchemaJson: "which forms am I on" has to answer in one $filter-by-
 * Email query (same shape ResponseIndex already gives for "which forms have
 * I submitted to"), and granting/revoking access has to be an instant write
 * independent of the draft/publish cycle. See formsSchema/capabilities.ts for
 * how a row here combines with SiteRole into one FormCapabilities result.
 */
export interface FormPermissionFields {
  Title: string; // mirrors Email, for legibility in SharePoint's default view
  FormId: string;
  Email: string; // lowercased — the filterable key
  DisplayName?: string;
  RoleBundle: FormCollaborator["roleBundle"];
  CanEditForm: boolean;
  CanViewResponses: boolean;
  CanManageResponses: boolean;
  CanManageAccess: boolean;
  AddedBy: string;
  AddedAt: string;
}

function toCollaborator(fields: FormPermissionFields): FormCollaborator {
  return {
    email: fields.Email,
    displayName: fields.DisplayName || undefined,
    roleBundle: fields.RoleBundle,
    canEditForm: !!fields.CanEditForm,
    canViewResponses: !!fields.CanViewResponses,
    canManageResponses: !!fields.CanManageResponses,
    canManageAccess: !!fields.CanManageAccess,
    addedBy: fields.AddedBy,
    addedAt: fields.AddedAt,
  };
}

/** Every collaborator granted access to one specific form — powers the
 *  builder's Access tab and useFormCapabilities. */
export async function listFormPermissions(formId: string): Promise<ListItem<FormPermissionFields>[]> {
  await ensureFormsSiteStructure();
  return queryListItems<FormPermissionFields>(LIST_NAMES.formPermissions, {
    filter: `fields/FormId eq '${odataQuote(formId)}'`,
  });
}

/** Every form a given email has been granted collaborator access to —
 *  powers Dashboard's "Shared with you" grid. Cross-form by design, same
 *  shape as ResponseIndex's SubmitterEmail-only query for My Responses. */
export async function listFormPermissionsForEmail(email: string): Promise<ListItem<FormPermissionFields>[]> {
  await ensureFormsSiteStructure();
  return queryListItems<FormPermissionFields>(LIST_NAMES.formPermissions, {
    filter: `fields/Email eq '${odataQuote(email.toLowerCase())}'`,
  });
}

export async function getFormCollaborators(formId: string): Promise<FormCollaborator[]> {
  const items = await listFormPermissions(formId);
  return items.map((item) => toCollaborator(item.fields));
}

/** Adds or updates a collaborator's grant on a form — upsert keyed on
 *  (FormId, Email), same idiom as responseIndex.ts's upsertIndex, so adding
 *  the same person twice edits their existing grant instead of creating a
 *  duplicate row with ambiguous precedence. */
export async function upsertFormPermission(params: {
  formId: string;
  email: string;
  displayName?: string;
  roleBundle: FormCollaborator["roleBundle"];
  canEditForm: boolean;
  canViewResponses: boolean;
  canManageResponses: boolean;
  canManageAccess: boolean;
  addedBy: string;
}): Promise<void> {
  await ensureFormsSiteStructure();
  const email = params.email.toLowerCase();
  const existing = await queryListItems<FormPermissionFields>(LIST_NAMES.formPermissions, {
    filter: `fields/FormId eq '${odataQuote(params.formId)}' and fields/Email eq '${odataQuote(email)}'`,
    top: 1,
  });
  const fields: FormPermissionFields = {
    Title: email,
    FormId: params.formId,
    Email: email,
    DisplayName: params.displayName,
    RoleBundle: params.roleBundle,
    CanEditForm: params.canEditForm,
    CanViewResponses: params.canViewResponses,
    CanManageResponses: params.canManageResponses,
    CanManageAccess: params.canManageAccess,
    AddedBy: params.addedBy,
    AddedAt: new Date().toISOString(),
  };
  if (existing[0]) {
    await updateListItem<FormPermissionFields>(LIST_NAMES.formPermissions, existing[0].id, fields);
  } else {
    await createListItem<FormPermissionFields>(LIST_NAMES.formPermissions, fields);
  }
}

export async function removeFormPermission(itemId: string): Promise<void> {
  await deleteListItem(LIST_NAMES.formPermissions, itemId);
}
