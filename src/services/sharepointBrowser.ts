import { graphFetch } from "./graphClient";
import { getFormsSite } from "./sites";
import { LIBRARY_NAMES, LIST_NAMES } from "./bootstrap";
import { graphScopes } from "../auth/msalConfig";

/**
 * Read-only browsing helpers over the Forms site's own document libraries,
 * Lists, and Excel workbooks — lets the Connectors builder UI offer a picker
 * ("choose the file/list/table you mean") instead of hand-typed JSON config,
 * without introducing any new permission scope (same Sites.Manage.All token
 * already used everywhere else in this app).
 */

const APP_OWNED_LIBRARIES = new Set<string>(Object.values(LIBRARY_NAMES));
const APP_OWNED_LISTS = new Set<string>(Object.values(LIST_NAMES));

export interface BrowsableLibrary {
  id: string;
  name: string;
}

/** Document libraries a user could reasonably point a connector at — the
 *  app's own internal libraries (ResponseWorkbooks, FormVersions,
 *  Attachments) are filtered out since they hold generated data, not
 *  reference/master data someone uploaded on purpose. */
export async function listReferenceLibraries(): Promise<BrowsableLibrary[]> {
  const { siteId } = await getFormsSite();
  const drives = await graphFetch<{ value: { id: string; name: string }[] }>(
    `/sites/${siteId}/drives?$select=id,name`,
    { scopes: graphScopes.sites }
  );
  return drives.value.filter((d) => !APP_OWNED_LIBRARIES.has(d.name));
}

export interface BrowsableFile {
  name: string;
  path: string; // relative to the library root — what excel-lookup's itemPath expects
}

/** Top-level .xlsx files in a library's root — matches the flat "upload your
 *  master file directly into the library" layout SETUP.md walks through. */
export async function listExcelFiles(driveId: string): Promise<BrowsableFile[]> {
  const result = await graphFetch<{ value: { name: string; file?: unknown }[] }>(
    `/drives/${driveId}/root/children?$select=name,file`,
    { scopes: graphScopes.sites }
  );
  return result.value
    .filter((item) => item.file && item.name.toLowerCase().endsWith(".xlsx"))
    .map((item) => ({ name: item.name, path: item.name }));
}

/** Named Excel Tables inside one workbook — excel-lookup reads a Table, not
 *  a raw range, so this is exactly what the connector config needs. */
export async function listWorkbookTables(driveId: string, itemPath: string): Promise<string[]> {
  const result = await graphFetch<{ value: { name: string }[] }>(
    `/drives/${driveId}/root:/${itemPath}:/workbook/tables?$select=name`,
    { scopes: graphScopes.sites }
  );
  return result.value.map((t) => t.name);
}

/** Column headers of one Excel Table — populates the "key column" dropdown
 *  so it can't be typo'd against the real sheet. */
export async function listTableColumns(driveId: string, itemPath: string, tableName: string): Promise<string[]> {
  const result = await graphFetch<{ value: { name: string }[] }>(
    `/drives/${driveId}/root:/${itemPath}:/workbook/tables('${tableName}')/columns?$select=name`,
    { scopes: graphScopes.sites }
  );
  return result.value.map((c) => c.name);
}

export interface BrowsableList {
  id: string;
  name: string;
}

/** SharePoint Lists a connector could query — the app's own operational
 *  Lists (Forms, SyncQueue, etc.) are filtered out for the same reason as
 *  APP_OWNED_LIBRARIES above. */
export async function listReferenceLists(): Promise<BrowsableList[]> {
  const { siteId } = await getFormsSite();
  const result = await graphFetch<{ value: { id: string; displayName: string; list?: { hidden?: boolean } }[] }>(
    `/sites/${siteId}/lists?$select=id,displayName,list`,
    { scopes: graphScopes.sites }
  );
  return result.value
    .filter((l) => !l.list?.hidden && !APP_OWNED_LISTS.has(l.displayName))
    .map((l) => ({ id: l.id, name: l.displayName }));
}

/** Column display names of one SharePoint List — populates the "filter
 *  column" dropdown for the sharepoint-list-query connector. Built-in
 *  system columns (read-only or hidden) are filtered out since they're
 *  never useful as a lookup key. */
export async function listListColumns(listId: string): Promise<string[]> {
  const { siteId } = await getFormsSite();
  const result = await graphFetch<{ value: { name: string; hidden?: boolean; readOnly?: boolean }[] }>(
    `/sites/${siteId}/lists/${listId}/columns?$select=name,hidden,readOnly`,
    { scopes: graphScopes.sites }
  );
  return result.value.filter((c) => !c.hidden && !c.readOnly).map((c) => c.name);
}
