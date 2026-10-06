import { graphFetch } from "./graphClient";
import { GraphError } from "./graphErrors";
import { getFormsSite } from "./sites";
import { graphScopes } from "../auth/msalConfig";

/**
 * Creates the SharePoint Lists/libraries this app needs inside the "Forms"
 * site, if they don't already exist — so SETUP.md only has to say "create a
 * site named Forms", not "hand-create seven lists with exact columns."
 * Idempotent: safe to call on every app load (checked in-memory once per
 * session via `ensured`).
 */

interface ColumnDef {
  name: string;
  text?: { allowMultipleLines?: boolean };
  number?: Record<string, never>;
  /** Graph "boolean" columnDefinition facet (Yes/No column) — used for
   *  FormPermissions' Can* flags. If a tenant ever rejects {"boolean":{}} on
   *  list-column creation (unconfirmed against a live tenant as of writing),
   *  switch these four columns to `number: {}` storing 0/1 instead — same
   *  semantics, just coerce in formPermissions.ts's field mapping. */
  boolean?: Record<string, never>;
}

let ensured = false;
let ensuring: Promise<void> | null = null;

async function listExists(siteId: string, displayName: string): Promise<boolean> {
  try {
    await graphFetch(`/sites/${siteId}/lists/${encodeURIComponent(displayName)}?$select=id`, {
      scopes: graphScopes.sites,
    });
    return true;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return false;
    throw err;
  }
}

async function createGenericList(siteId: string, displayName: string, columns: ColumnDef[]): Promise<void> {
  await graphFetch(`/sites/${siteId}/lists`, {
    method: "POST",
    body: {
      displayName,
      list: { template: "genericList" },
      columns,
    },
    scopes: graphScopes.sites,
  });
}

async function createDocumentLibrary(siteId: string, displayName: string): Promise<void> {
  await graphFetch(`/sites/${siteId}/lists`, {
    method: "POST",
    body: {
      displayName,
      list: { template: "documentLibrary" },
    },
    scopes: graphScopes.sites,
  });
}

async function ensureList(siteId: string, displayName: string, columns: ColumnDef[]): Promise<void> {
  if (await listExists(siteId, displayName)) return;
  await createGenericList(siteId, displayName, columns);
}

async function ensureLibrary(siteId: string, displayName: string): Promise<void> {
  if (await listExists(siteId, displayName)) return;
  await createDocumentLibrary(siteId, displayName);
}

const FORMS_LIST_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "Slug", text: {} },
  { name: "Status", text: {} },
  { name: "OwnerEmail", text: {} },
  { name: "OwnerDisplayName", text: {} },
  { name: "CurrentDraftVersion", number: {} },
  { name: "LatestPublishedVersion", number: {} },
  { name: "DraftSchemaJson", text: { allowMultipleLines: true } },
  { name: "CreatedAt", text: {} },
  { name: "UpdatedAt", text: {} },
];

const SYNC_QUEUE_COLUMNS: ColumnDef[] = [
  { name: "ResponseId", text: {} },
  { name: "FormId", text: {} },
  { name: "SubmitterEmail", text: {} },
  { name: "Operation", text: {} },
  { name: "PayloadJson", text: { allowMultipleLines: true } },
  { name: "Status", text: {} },
  { name: "Attempts", number: {} },
  { name: "LastError", text: { allowMultipleLines: true } },
  { name: "CreatedAt", text: {} },
  { name: "UpdatedAt", text: {} },
];

const RESPONSE_INDEX_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "ResponseId", text: {} },
  { name: "SubmitterEmail", text: {} },
  { name: "RowIndex", number: {} },
  { name: "VerifiedAt", text: {} },
];

const AUDIT_LOG_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "ResponseId", text: {} },
  { name: "ByEmail", text: {} },
  { name: "Action", text: {} },
  { name: "ChangedFieldsJson", text: { allowMultipleLines: true } },
  { name: "At", text: {} },
  { name: "Reason", text: { allowMultipleLines: true } },
];

const CONNECTOR_CONFIGS_COLUMNS: ColumnDef[] = [
  { name: "Name", text: {} },
  { name: "ConnectorType", text: {} },
  { name: "ConfigJson", text: { allowMultipleLines: true } },
  { name: "SecretRef", text: {} },
  { name: "CreatedBy", text: {} },
  { name: "CreatedAt", text: {} },
];

const DRAFTS_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "SubmitterEmail", text: {} },
  { name: "FormVersion", number: {} },
  { name: "AnswersJson", text: { allowMultipleLines: true } },
  { name: "VisitedSectionIdsJson", text: { allowMultipleLines: true } },
  { name: "UpdatedAt", text: {} },
];

/** One row per response that has an approval-routing chain configured —
 *  kept as its own List (like ResponseIndex/AuditLog) rather than extra
 *  Excel columns, so the response workbook's row shape never needs to
 *  change and existing published forms/workbooks are unaffected. */
const RESPONSE_ROUTING_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "ResponseId", text: {} },
  { name: "CurrentStepIndex", number: {} },
  { name: "Status", text: {} },
  { name: "HistoryJson", text: { allowMultipleLines: true } },
  { name: "UpdatedAt", text: {} },
];

/** One row per (FormId, Email) collaborator grant — the per-form
 *  access-control module (services/formPermissions.ts). A dedicated List,
 *  not a DraftSchemaJson field, specifically so "which forms am I on"
 *  answers in one $filter-by-Email query (same shape ResponseIndex already
 *  gives for "which forms have I submitted to") and so granting/revoking
 *  access never touches the draft/publish cycle. */
const FORM_PERMISSIONS_COLUMNS: ColumnDef[] = [
  { name: "FormId", text: {} },
  { name: "Email", text: {} },
  { name: "DisplayName", text: {} },
  { name: "RoleBundle", text: {} },
  { name: "CanEditForm", boolean: {} },
  { name: "CanViewResponses", boolean: {} },
  { name: "CanManageResponses", boolean: {} },
  { name: "CanManageAccess", boolean: {} },
  { name: "AddedBy", text: {} },
  { name: "AddedAt", text: {} },
];

/** One row per email with a site-wide role override (services/siteRoles.ts).
 *  Absence of a row means "derive the role from native SharePoint Owners/
 *  Members group membership instead" — purely additive, never required for
 *  the app's pre-existing owner-only model to keep working. */
const APP_ROLES_COLUMNS: ColumnDef[] = [
  { name: "Email", text: {} },
  { name: "Role", text: {} },
  { name: "SetBy", text: {} },
  { name: "SetAt", text: {} },
  { name: "Note", text: { allowMultipleLines: true } },
];

export const LIST_NAMES = {
  forms: "Forms",
  syncQueue: "SyncQueue",
  responseIndex: "ResponseIndex",
  auditLog: "AuditLog",
  connectorConfigs: "ConnectorConfigs",
  drafts: "Drafts",
  responseRouting: "ResponseRouting",
  formPermissions: "FormPermissions",
  appRoles: "AppRoles",
} as const;

export const LIBRARY_NAMES = {
  responseWorkbooks: "ResponseWorkbooks",
  formVersions: "FormVersions",
  attachments: "Attachments",
} as const;

/** Ensures the site structure this app needs exists, including FormPermissions
 *  (per-form collaborator grants) and AppRoles (site-wide role overrides) —
 *  both additive to the pre-existing owner-only model, not a replacement. */
export async function ensureFormsSiteStructure(): Promise<void> {
  if (ensured) return;
  // Concurrent cold-load callers (several parts of the app call this
  // independently, e.g. listMyForms and getFormById can both fire before
  // either resolves) used to each see `ensured === false` and race to
  // create the same lists — SharePoint list display names must be unique
  // per site, so the loser of that race got a 400 back from Graph,
  // surfacing as a broken page purely from timing on a fresh tenant's very
  // first load. Sharing the in-flight promise makes every concurrent
  // caller await the SAME attempt instead of starting their own.
  if (ensuring) return ensuring;

  ensuring = (async () => {
    const { siteId } = await getFormsSite();

    await Promise.all([
      ensureList(siteId, LIST_NAMES.forms, FORMS_LIST_COLUMNS),
      ensureList(siteId, LIST_NAMES.syncQueue, SYNC_QUEUE_COLUMNS),
      ensureList(siteId, LIST_NAMES.responseIndex, RESPONSE_INDEX_COLUMNS),
      ensureList(siteId, LIST_NAMES.auditLog, AUDIT_LOG_COLUMNS),
      ensureList(siteId, LIST_NAMES.connectorConfigs, CONNECTOR_CONFIGS_COLUMNS),
      ensureList(siteId, LIST_NAMES.drafts, DRAFTS_COLUMNS),
      ensureList(siteId, LIST_NAMES.responseRouting, RESPONSE_ROUTING_COLUMNS),
      ensureList(siteId, LIST_NAMES.formPermissions, FORM_PERMISSIONS_COLUMNS),
      ensureList(siteId, LIST_NAMES.appRoles, APP_ROLES_COLUMNS),
      ensureLibrary(siteId, LIBRARY_NAMES.responseWorkbooks),
      ensureLibrary(siteId, LIBRARY_NAMES.formVersions),
      ensureLibrary(siteId, LIBRARY_NAMES.attachments),
    ]);

    ensured = true;
  })();

  try {
    await ensuring;
  } finally {
    ensuring = null;
  }
}
