import { useEffect, useState } from "react";
import {
  listExcelFiles,
  listListColumns,
  listReferenceLibraries,
  listReferenceLists,
  listTableColumns,
  listWorkbookTables,
  type BrowsableFile,
  type BrowsableLibrary,
  type BrowsableList,
} from "../../services/sharepointBrowser";
import type { ConnectorType } from "../../formsSchema/types";

interface Props {
  type: ConnectorType;
  onConfigChange: (config: Record<string, unknown>) => void;
}

/** Cascading pickers over what's already in the Forms SharePoint site —
 *  library → file → table → key column (excel-lookup), or list → filter
 *  column (sharepoint-list-query) — so connectors are configured by
 *  browsing instead of hand-typing JSON that has to exactly match real
 *  SharePoint names. Falls back to nothing (the raw JSON box) for connector
 *  types that aren't file/list backed. */
export function ConnectorSourcePicker({ type, onConfigChange }: Props) {
  if (type === "excel-lookup") return <ExcelLookupPicker onConfigChange={onConfigChange} />;
  if (type === "sharepoint-list-query") return <ListQueryPicker onConfigChange={onConfigChange} />;
  return null;
}

function ExcelLookupPicker({ onConfigChange }: { onConfigChange: (config: Record<string, unknown>) => void }) {
  const [libraries, setLibraries] = useState<BrowsableLibrary[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [files, setFiles] = useState<BrowsableFile[]>([]);
  const [itemPath, setItemPath] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [keyColumn, setKeyColumn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listReferenceLibraries().then(setLibraries).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    setFiles([]);
    setItemPath("");
    setTables([]);
    setTable("");
    setColumns([]);
    setKeyColumn("");
    if (!libraryId) return;
    setLoading(true);
    listExcelFiles(libraryId)
      .then(setFiles)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [libraryId]);

  useEffect(() => {
    setTables([]);
    setTable("");
    setColumns([]);
    setKeyColumn("");
    if (!libraryId || !itemPath) return;
    setLoading(true);
    listWorkbookTables(libraryId, itemPath)
      .then(setTables)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [libraryId, itemPath]);

  useEffect(() => {
    setColumns([]);
    setKeyColumn("");
    if (!libraryId || !itemPath || !table) return;
    setLoading(true);
    listTableColumns(libraryId, itemPath, table)
      .then(setColumns)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [libraryId, itemPath, table]);

  useEffect(() => {
    const library = libraries.find((l) => l.id === libraryId);
    if (!library || !itemPath || !table || !keyColumn) return;
    onConfigChange({ libraryName: library.name, itemPath, table, keyColumn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId, itemPath, table, keyColumn]);

  return (
    <div className="connector-picker">
      {error && <p className="error-text">{error}</p>}
      <div className="field-row">
        <label>Library</label>
        <select value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
          <option value="">Choose…</option>
          {libraries.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {libraryId && (
        <div className="field-row">
          <label>File</label>
          <select value={itemPath} onChange={(e) => setItemPath(e.target.value)}>
            <option value="">{loading ? "Loading…" : "Choose…"}</option>
            {files.map((f) => (
              <option key={f.path} value={f.path}>
                {f.name}
              </option>
            ))}
          </select>
          {!loading && files.length === 0 && (
            <p className="fill-field__help">No .xlsx files found at the root of this library.</p>
          )}
        </div>
      )}
      {itemPath && (
        <div className="field-row">
          <label>Table</label>
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">{loading ? "Loading…" : "Choose…"}</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {!loading && tables.length === 0 && (
            <p className="fill-field__help">
              No named Excel Tables in this file — select the data range and Insert → Table first.
            </p>
          )}
        </div>
      )}
      {table && (
        <div className="field-row">
          <label>Key column (matched against the lookup key)</label>
          <select value={keyColumn} onChange={(e) => setKeyColumn(e.target.value)}>
            <option value="">{loading ? "Loading…" : "Choose…"}</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function ListQueryPicker({ onConfigChange }: { onConfigChange: (config: Record<string, unknown>) => void }) {
  const [lists, setLists] = useState<BrowsableList[]>([]);
  const [listId, setListId] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [filterColumn, setFilterColumn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listReferenceLists().then(setLists).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    setColumns([]);
    setFilterColumn("");
    if (!listId) return;
    setLoading(true);
    listListColumns(listId)
      .then(setColumns)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [listId]);

  useEffect(() => {
    const list = lists.find((l) => l.id === listId);
    if (!list || !filterColumn) return;
    onConfigChange({ listName: list.name, filterColumn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, filterColumn]);

  return (
    <div className="connector-picker">
      {error && <p className="error-text">{error}</p>}
      <div className="field-row">
        <label>List</label>
        <select value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">Choose…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {lists.length === 0 && (
          <p className="fill-field__help">
            No SharePoint Lists found besides this app's own — create one first and add it to the site.
          </p>
        )}
      </div>
      {listId && (
        <div className="field-row">
          <label>Filter column (matched against the lookup key)</label>
          <select value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)}>
            <option value="">{loading ? "Loading…" : "Choose…"}</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
