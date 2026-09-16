import { createListItem, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIBRARY_NAMES, LIST_NAMES } from "./bootstrap";
import { ensureWorkbookForForm } from "./excel";
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
