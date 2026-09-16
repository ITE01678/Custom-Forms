import { graphFetch } from "./graphClient";
import { GraphError } from "./graphErrors";
import { getFormsSite } from "./sites";

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
}

let ensured = false;

async function listExists(siteId: string, displayName: string): Promise<boolean> {
  try {
    await graphFetch(`/sites/${siteId}/lists/${encodeURIComponent(displayName)}?$select=id`);
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
  });
}

async function createDocumentLibrary(siteId: string, displayName: string): Promise<void> {
  await graphFetch(`/sites/${siteId}/lists`, {
    method: "POST",
    body: {
      displayName,
      list: { template: "documentLibrary" },
    },
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

export const LIST_NAMES = {
  forms: "Forms",
  syncQueue: "SyncQueue",
  responseIndex: "ResponseIndex",
  auditLog: "AuditLog",
  connectorConfigs: "ConnectorConfigs",
  drafts: "Drafts",
} as const;

export const LIBRARY_NAMES = {
  responseWorkbooks: "ResponseWorkbooks",
  formVersions: "FormVersions",
  attachments: "Attachments",
} as const;

/** Ensures the site structure this app needs exists. FormPermissions is
 *  deferred until per-form sharing/collaboration needs it beyond the
 *  owner-only model used so far. */
export async function ensureFormsSiteStructure(): Promise<void> {
  if (ensured) return;
  const { siteId } = await getFormsSite();

  await Promise.all([
    ensureList(siteId, LIST_NAMES.forms, FORMS_LIST_COLUMNS),
    ensureList(siteId, LIST_NAMES.syncQueue, SYNC_QUEUE_COLUMNS),
    ensureList(siteId, LIST_NAMES.responseIndex, RESPONSE_INDEX_COLUMNS),
    ensureList(siteId, LIST_NAMES.auditLog, AUDIT_LOG_COLUMNS),
    ensureList(siteId, LIST_NAMES.connectorConfigs, CONNECTOR_CONFIGS_COLUMNS),
    ensureList(siteId, LIST_NAMES.drafts, DRAFTS_COLUMNS),
    ensureLibrary(siteId, LIBRARY_NAMES.responseWorkbooks),
    ensureLibrary(siteId, LIBRARY_NAMES.formVersions),
    ensureLibrary(siteId, LIBRARY_NAMES.attachments),
  ]);

  ensured = true;
}
