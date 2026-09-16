import { graphFetch, graphFetchAllPages } from "./graphClient";
import { getFormsSite, resolveListId } from "./sites";

export interface ListItem<TFields> {
  /** SharePoint's own item id (string) — internal only, never used as a business key. */
  id: string;
  fields: TFields;
}

const listIdCache = new Map<string, string>();

async function getListId(listName: string): Promise<string> {
  const cached = listIdCache.get(listName);
  if (cached) return cached;
  const id = await resolveListId(listName);
  listIdCache.set(listName, id);
  return id;
}

export interface QueryOptions {
  /** OData $filter, e.g. "fields/FormId eq 'abc'". Non-indexed-column filters
   *  need the HonorNonIndexedQueriesWarningMayFailRandomly header, added automatically. */
  filter?: string;
  top?: number;
}

export async function queryListItems<TFields>(
  listName: string,
  opts: QueryOptions = {}
): Promise<ListItem<TFields>[]> {
  const { siteId } = await getFormsSite();
  const listId = await getListId(listName);
  const params = new URLSearchParams();
  params.set("expand", "fields");
  if (opts.filter) params.set("$filter", opts.filter);
  if (opts.top) params.set("$top", String(opts.top));

  return graphFetchAllPages<ListItem<TFields>>(
    `/sites/${siteId}/lists/${listId}/items?${params.toString()}`,
    { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } }
  );
}

export async function getListItem<TFields>(listName: string, itemId: string): Promise<ListItem<TFields>> {
  const { siteId } = await getFormsSite();
  const listId = await getListId(listName);
  return graphFetch<ListItem<TFields>>(`/sites/${siteId}/lists/${listId}/items/${itemId}?expand=fields`);
}

export async function createListItem<TFields extends object>(
  listName: string,
  fields: TFields
): Promise<ListItem<TFields>> {
  const { siteId } = await getFormsSite();
  const listId = await getListId(listName);
  return graphFetch<ListItem<TFields>>(`/sites/${siteId}/lists/${listId}/items`, {
    method: "POST",
    body: { fields },
  });
}

export async function updateListItem<TFields extends object>(
  listName: string,
  itemId: string,
  fields: Partial<TFields>
): Promise<void> {
  const { siteId } = await getFormsSite();
  const listId = await getListId(listName);
  await graphFetch(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
    method: "PATCH",
    body: fields,
  });
}

export async function deleteListItem(listName: string, itemId: string): Promise<void> {
  const { siteId } = await getFormsSite();
  const listId = await getListId(listName);
  await graphFetch(`/sites/${siteId}/lists/${listId}/items/${itemId}`, { method: "DELETE" });
}
