import { createListItem, deleteListItem, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIBRARY_NAMES, LIST_NAMES } from "./bootstrap";
import { deleteResponseWorkbookIfExists, ensureWorkbookForForm, getResponseRows } from "./excel";
import { deleteAllForForm } from "./syncQueue";
import { resolveDriveIdByLibraryName } from "./sites";
import { graphFetch, graphUploadBinary } from "./graphClient";
import { GraphError } from "./graphErrors";
import { graphScopes } from "../auth/msalConfig";
import { slugify } from "../lib/slug";
import type { FormDefinition } from "../formsSchema/types";

interface FormsListFields {
  Title: string;
  FormId: string;
  Slug: string;
  Status: string;
  OwnerEmail: string;
  OwnerDisplayName?: string;
  CurrentDraftVersion: number;
  LatestPublishedVersion: number | null;
  DraftSchemaJson: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface StoredForm {
  itemId: string; // SharePoint List item id — needed for updates, never used as a business key
  form: FormDefinition;
}

function toStoredForm(item: ListItem<FormsListFields>): StoredForm {
  return { itemId: item.id, form: JSON.parse(item.fields.DraftSchemaJson) as FormDefinition };
}

export async function listMyForms(ownerEmail: string): Promise<StoredForm[]> {
  await ensureFormsSiteStructure();
  const items = await queryListItems<FormsListFields>(LIST_NAMES.forms, {
    filter: `fields/OwnerEmail eq '${ownerEmail}'`,
  });
  return items.map(toStoredForm);
}

export async function getFormById(formId: string): Promise<StoredForm | null> {
  await ensureFormsSiteStructure();
  const items = await queryListItems<FormsListFields>(LIST_NAMES.forms, {
    filter: `fields/FormId eq '${formId}'`,
    top: 1,
  });
  return items[0] ? toStoredForm(items[0]) : null;
}

export async function getFormBySlug(slug: string): Promise<FormDefinition | null> {
  await ensureFormsSiteStructure();
  const items = await queryListItems<FormsListFields>(LIST_NAMES.forms, {
    filter: `fields/Slug eq '${slug}'`,
    top: 1,
  });
  return items[0] ? toStoredForm(items[0]).form : null;
}

export async function createForm(
  title: string,
  owner: { upn: string; displayName?: string }
): Promise<StoredForm> {
  await ensureFormsSiteStructure();
  const now = new Date().toISOString();
  const slug = slugify(title);

  const form: FormDefinition = {
    id: crypto.randomUUID(),
    slug,
    status: "draft",
    currentDraftVersion: 1,
    latestPublishedVersion: null,
    title,
    owner,
    createdAt: now,
    updatedAt: now,
    branding: {
      confirmation: { mode: "message", message: "Thanks! Your response has been recorded." },
    },
    editPolicy: { mode: "none" },
    sharing: { slug, requireAuth: true },
    settings: { responseAccess: "anyoneInOrg", showProgressBar: true },
    sections: [],
  };

  const item = await createListItem<FormsListFields>(LIST_NAMES.forms, {
    Title: form.title,
    FormId: form.id,
    Slug: form.slug,
    Status: form.status,
    OwnerEmail: owner.upn,
    OwnerDisplayName: owner.displayName ?? "",
    CurrentDraftVersion: form.currentDraftVersion,
    LatestPublishedVersion: null,
    DraftSchemaJson: JSON.stringify(form),
    CreatedAt: now,
    UpdatedAt: now,
  });

  return { itemId: item.id, form };
}

/** Persists an edited draft — bumps `currentDraftVersion` on every save
 *  (per the plan's versioning rule), leaving `latestPublishedVersion`
 *  untouched until the next Publish. */
export async function saveDraft(stored: StoredForm, updates: Partial<FormDefinition>): Promise<StoredForm> {
  const now = new Date().toISOString();
  const form: FormDefinition = {
    ...stored.form,
    ...updates,
    currentDraftVersion: stored.form.currentDraftVersion + 1,
    updatedAt: now,
  };

  await updateListItem<FormsListFields>(LIST_NAMES.forms, stored.itemId, {
    Title: form.title,
    Slug: form.slug,
    Status: form.status,
    CurrentDraftVersion: form.currentDraftVersion,
    DraftSchemaJson: JSON.stringify(form),
    UpdatedAt: now,
  });

  return { itemId: stored.itemId, form };
}

/**
 * Snapshots the current draft into an immutable
 * FormVersions/{formId}/v{n}.json, flips status to "published", and ensures
 * the response workbook exists — every later response pins itself to the
 * version it was created under (see formsSchema/types.ts's FormResponse).
 */
export async function publishForm(stored: StoredForm): Promise<StoredForm> {
  const now = new Date().toISOString();
  const nextVersion = (stored.form.latestPublishedVersion ?? 0) + 1;

  const published: FormDefinition = {
    ...stored.form,
    status: "published",
    latestPublishedVersion: nextVersion,
    updatedAt: now,
  };

  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.formVersions);
  const snapshotPath = `${published.id}/v${nextVersion}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(published)).buffer;
  await graphUploadBinary(`/drives/${driveId}/root:/${snapshotPath}:/content`, bytes, {
    contentType: "application/json",
    scopes: graphScopes.sites,
  });

  await updateListItem<FormsListFields>(LIST_NAMES.forms, stored.itemId, {
    Status: published.status,
    LatestPublishedVersion: published.latestPublishedVersion,
    DraftSchemaJson: JSON.stringify(published),
    UpdatedAt: now,
  });

  await ensureWorkbookForForm(published);

  return { itemId: stored.itemId, form: published };
}

/**
 * Reads back an immutable published snapshot — used when editing an existing
 * response, which must always be re-rendered against the exact version it
 * was originally submitted under, never whatever is currently published
 * (otherwise a schema edit could corrupt in-flight/historical responses).
 */
export async function getFormVersion(formId: string, version: number): Promise<FormDefinition | null> {
  await ensureFormsSiteStructure();
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.formVersions);
  try {
    return await graphFetch<FormDefinition>(`/drives/${driveId}/root:/${formId}/v${version}.json:/content`, {
      scopes: graphScopes.sites,
    });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
}

/** A plain driveItem webUrl to a form's latest published snapshot — for an
 *  admin to open it directly in SharePoint. Null if never published. */
export async function getFormVersionWebUrl(form: FormDefinition): Promise<string | null> {
  if (!form.latestPublishedVersion) return null;
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.formVersions);
  try {
    const item = await graphFetch<{ webUrl: string }>(
      `/drives/${driveId}/root:/${form.id}/v${form.latestPublishedVersion}.json?$select=webUrl`,
      { scopes: graphScopes.sites }
    );
    return item.webUrl;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
}

/** Takes a form out of the active list without destroying anything — the
 *  only option once it has responses (see deleteForm). Reversible in
 *  principle (nothing here prevents flipping status back), though there's
 *  no "unarchive" action in the UI yet. */
export async function archiveForm(stored: StoredForm): Promise<StoredForm> {
  const now = new Date().toISOString();
  const form: FormDefinition = { ...stored.form, status: "archived", updatedAt: now };

  await updateListItem<FormsListFields>(LIST_NAMES.forms, stored.itemId, {
    Status: form.status,
    DraftSchemaJson: JSON.stringify(form),
    UpdatedAt: now,
  });

  return { itemId: stored.itemId, form };
}

/** Best-effort: deletes the FormVersions/{formId}/ folder (all published
 *  snapshots) recursively. A 404 (nothing published yet) is not an error. */
async function deleteFormVersionsFolderIfExists(formId: string): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.formVersions);
  try {
    await graphFetch(`/drives/${driveId}/root:/${formId}`, { method: "DELETE", scopes: graphScopes.sites });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return;
    throw err;
  }
}

/**
 * Permanently deletes a form — its Forms List item, response workbook,
 * published snapshots, and SyncQueue entries. Only allowed with zero
 * responses: a form anyone has actually answered can't be hard-deleted
 * (their data would vanish with no audit trail), so archiveForm is the
 * only option once responses exist — enforced here, not just in the UI,
 * since this is a destructive, irreversible operation.
 */
export async function deleteForm(stored: StoredForm): Promise<void> {
  const responseCount = (await getResponseRows(stored.form)).length;
  if (responseCount > 0) {
    throw new Error(
      `This form has ${responseCount} response(s) — it can't be deleted. Archive it instead to remove it ` +
        `from the active list without losing its responses.`
    );
  }

  await deleteListItem(LIST_NAMES.forms, stored.itemId);
  await deleteResponseWorkbookIfExists(stored.form.id);
  await deleteFormVersionsFolderIfExists(stored.form.id);
  await deleteAllForForm(stored.form.id);
}
