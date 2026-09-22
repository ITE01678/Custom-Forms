import * as XLSX from "xlsx";
import { graphFetch, graphFetchBinary, graphUploadBinary } from "./graphClient";
import { GraphError } from "./graphErrors";
import { resolveDriveIdByLibraryName } from "./sites";
import { LIBRARY_NAMES } from "./bootstrap";
import { graphScopes } from "../auth/msalConfig";
import type {
  AnswerValue,
  FileAttachment,
  FormDefinition,
  FormField,
  FormResponse,
  RepeatingTableValue,
} from "../formsSchema/types";

/**
 * Response workbooks are read/written as PLAIN FILE BYTES via a normal
 * driveItem `/content` GET+PUT — never through Graph's Excel Workbook REST
 * API (`/workbook/...`). That API is backed by Office Online Server ("WAC")
 * and, in this tenant, cannot negotiate a session for ANY operation against
 * this data — proven by the fact that even an explicit
 * `/workbook/createSession` call (the strongest form of the API) fails
 * identically to every stateless call that was tried before it. Content
 * GET/PUT has no such dependency (confirmed working throughout this app for
 * template uploads, attachments, and form-version snapshots), so this
 * downloads the file, parses/mutates it with a client-side spreadsheet
 * library (SheetJS), and re-uploads it — with an ETag-conditioned PUT
 * (`If-Match`) and retry-on-conflict so two people editing/submitting at
 * once can't silently clobber each other.
 */

/** Must match scripts/generate-response-template.mjs's META_COLUMNS. */
export const META_COLUMNS = [
  "ResponseId",
  "SubmitterEmail",
  "SubmittedAt",
  "LastEditedBy",
  "LastEditedAt",
  "EditCount",
  "Status",
] as const;

function workbookPath(formId: string): string {
  return `${formId}.xlsx`;
}

/** All fields across all sections, in a stable order (section.order, then
 *  field.order) — this order determines Excel column order and MUST stay
 *  consistent between workbook creation and every later row write. */
export function flattenFields(form: FormDefinition): FormField[] {
  return [...form.sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((s) => [...s.fields].sort((a, b) => a.order - b.order));
}

function isRepeatingTableValue(v: AnswerValue): v is RepeatingTableValue {
  return !!v && typeof v === "object" && !Array.isArray(v) && "rows" in v;
}

function isFileAttachmentArray(v: AnswerValue): v is FileAttachment[] {
  return Array.isArray(v) && (v.length === 0 ? false : typeof v[0] === "object");
}

function toCellValue(field: FormField, value: AnswerValue | undefined): string | number | boolean {
  if (value === undefined || value === null) return "";
  if (isRepeatingTableValue(value)) return JSON.stringify(value);
  // fileUpload stores structured JSON (like repeatingTable), not a cosmetic
  // string — a "pretty" rendering would lose the url/size needed to edit
  // the response later, since Excel is this app's system of record.
  if (field.type === "fileUpload" && isFileAttachmentArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return value.join(", "); // multiChoice — flat Excel cells can't hold arrays
  return value;
}

/** Inverse of toCellValue — reconstructs an answer from a raw Excel cell,
 *  using the field's type to know how to decode it (Excel cells are always
 *  scalar, so multiChoice/repeatingTable/fileUpload need their own
 *  round-trip encoding). */
function fromCellValue(field: FormField, raw: unknown): AnswerValue {
  if (raw === "" || raw === null || raw === undefined) {
    return field.type === "multiChoice" || field.type === "fileUpload" ? [] : null;
  }
  if (field.type === "multiChoice") {
    return typeof raw === "string" ? raw.split(", ").filter(Boolean) : [];
  }
  if (field.type === "fileUpload") {
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as FileAttachment[]) : [];
    } catch {
      return [];
    }
  }
  if (field.type === "repeatingTable") {
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as RepeatingTableValue) : null;
    } catch {
      return null;
    }
  }
  if (field.type === "number" || field.type === "rating") {
    return typeof raw === "number" ? raw : Number(raw);
  }
  return typeof raw === "boolean" ? raw : String(raw);
}

let templateBytesCache: ArrayBuffer | null = null;

async function getTemplateBytes(): Promise<ArrayBuffer> {
  if (templateBytesCache) return templateBytesCache;
  // Base-relative (no leading slash) so this resolves correctly whether the
  // app is served from domain root or a subpath (e.g. GitHub Pages project
  // sites at /<repo>/) — import.meta.env.BASE_URL is Vite's resolved `base`.
  const res = await fetch(`${import.meta.env.BASE_URL}templates/response-template.xlsx`);
  if (!res.ok) {
    throw new Error(
      "Could not load public/templates/response-template.xlsx — run " +
        "`node scripts/generate-response-template.mjs` if it's missing."
    );
  }
  templateBytesCache = await res.arrayBuffer();
  // Temporary diagnostic logging — remove once the "blank workbook" issue is
  // confirmed fixed.
  // eslint-disable-next-line no-console
  console.info("[excel-debug] getTemplateBytes", {
    status: res.status,
    contentType: res.headers.get("Content-Type"),
    byteLength: templateBytesCache.byteLength,
  });
  return templateBytesCache;
}

async function workbookExists(driveId: string, formId: string): Promise<boolean> {
  try {
    await graphFetch(`/drives/${driveId}/root:/${workbookPath(formId)}?$select=id`, {
      scopes: graphScopes.sites,
    });
    return true;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return false;
    throw err;
  }
}

async function getItemETag(driveId: string, itemPath: string): Promise<string> {
  const item = await graphFetch<{ eTag: string }>(`/drives/${driveId}/root:/${itemPath}?$select=eTag`, {
    scopes: graphScopes.sites,
  });
  return item.eTag;
}

type Row = (string | number | boolean)[];

async function readWorkbookRows(driveId: string, itemPath: string): Promise<Row[]> {
  const blob = await graphFetchBinary(`/drives/${driveId}/root:/${itemPath}:/content`, {
    scopes: graphScopes.sites,
  });
  const bytes = await blob.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(bytes), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "" });
  // Temporary diagnostic logging — remove once the "blank workbook" issue is
  // confirmed fixed. Pinpoints exactly what a read actually saw: how many
  // bytes came back, what sheet(s) SheetJS found in them, and how many rows
  // it parsed out — so a report of "no data" can be traced to a specific
  // step instead of guessed at.
  // eslint-disable-next-line no-console
  console.info("[excel-debug] readWorkbookRows", {
    itemPath,
    byteLength: bytes.byteLength,
    sheetNames: workbook.SheetNames,
    sheetRef: sheet?.["!ref"] ?? "(none)",
    rowCount: rows.length,
    firstRow: rows[0],
  });
  return rows;
}

/** HTTP's If-Match header requires an entity-tag wrapped in literal double
 *  quotes (e.g. `"abc123"`), but Graph's `eTag` JSON *value* doesn't
 *  reliably come back with those quote characters already included in the
 *  string — add them if missing, rather than risk every conditional write
 *  spuriously failing as a 412 "conflict" against nothing (which, chained
 *  through the retry loop below, would eventually exhaust attempts and
 *  make even a brand new, uncontested write silently never land). */
function toIfMatchValue(etag: string): string {
  return etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`;
}

async function writeWorkbookRows(
  driveId: string,
  itemPath: string,
  rows: Row[],
  ifMatchEtag?: string
): Promise<void> {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Responses");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;

  // Temporary diagnostic logging — remove once the "blank workbook" issue is
  // confirmed fixed. See readWorkbookRows's matching log for why.
  // eslint-disable-next-line no-console
  console.info("[excel-debug] writeWorkbookRows", {
    itemPath,
    inputRowCount: rows.length,
    sheetRef: sheet["!ref"] ?? "(none)",
    outputByteLength: out.byteLength,
    ifMatchEtag: ifMatchEtag ?? "(none)",
  });

  await graphUploadBinary(`/drives/${driveId}/root:/${itemPath}:/content`, out.slice().buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    scopes: graphScopes.sites,
    headers: ifMatchEtag ? { "If-Match": toIfMatchValue(ifMatchEtag) } : undefined,
  });
}

/**
 * Read-modify-write with optimistic concurrency: downloads the current
 * rows + ETag, lets `mutate` compute the new rows (and any value it wants
 * to return to the caller) from them, uploads with `If-Match`, and retries
 * from a fresh download if another submit/edit won the race (412).
 */
async function withOptimisticUpdate<T>(
  driveId: string,
  itemPath: string,
  mutate: (rows: Row[]) => { rows: Row[]; result: T }
): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [etag, rows] = await Promise.all([getItemETag(driveId, itemPath), readWorkbookRows(driveId, itemPath)]);
    const { rows: nextRows, result } = mutate(rows);
    // Temporary diagnostic logging — remove once the "blank workbook" issue
    // is confirmed fixed.
    // eslint-disable-next-line no-console
    console.info("[excel-debug] withOptimisticUpdate attempt", {
      itemPath,
      attempt,
      etag,
      rowsBeforeMutate: rows.length,
      rowsAfterMutate: nextRows.length,
    });
    try {
      await writeWorkbookRows(driveId, itemPath, nextRows, etag);
      return result;
    } catch (err) {
      const isConflict = err instanceof GraphError && err.status === 412;
      if (!isConflict || attempt === maxAttempts) throw err;
      // someone else wrote first — loop and reapply `mutate` against the
      // now-current rows rather than blindly retrying the same write.
    }
  }
  throw new Error("Could not save — too many concurrent edits, please try again.");
}

/**
 * Creates this form's response workbook (a copy of the blank template,
 * uploaded into the ResponseWorkbooks library) the first time it's needed —
 * normally right after Publish. Idempotent: a no-op if the workbook already
 * exists. The header row is the template's fixed meta columns plus one
 * column per form field, in `flattenFields` order.
 */
export async function ensureWorkbookForForm(form: FormDefinition): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  if (await workbookExists(driveId, form.id)) return;

  const templateBytes = await getTemplateBytes();
  const templateWorkbook = XLSX.read(new Uint8Array(templateBytes), { type: "array" });
  const templateSheet = templateWorkbook.Sheets[templateWorkbook.SheetNames[0]];
  const templateRows = XLSX.utils.sheet_to_json<Row>(templateSheet, { header: 1, defval: "" });

  // Column header is the human-readable label for anyone opening the sheet
  // directly — cosmetic only. Row writes are always positional (full row
  // array in flattenFields order), so a label collision doesn't corrupt
  // data, but duplicate labels across fields in one form should still be
  // avoided in the builder (not yet enforced — noted as a known gap).
  const headerRow: Row = [...META_COLUMNS, ...flattenFields(form).map((f) => f.label || f.id)];
  const rows: Row[] = [headerRow, ...templateRows.slice(1)];

  // Temporary diagnostic logging — remove once the "blank workbook" issue is
  // confirmed fixed.
  // eslint-disable-next-line no-console
  console.info("[excel-debug] ensureWorkbookForForm", {
    formId: form.id,
    templateSheetNames: templateWorkbook.SheetNames,
    templateRowCount: templateRows.length,
    headerRow,
    finalRowCount: rows.length,
  });

  await writeWorkbookRows(driveId, workbookPath(form.id), rows);
}

/**
 * Appends one brand-new response as a row, returning its data-row index
 * (0 = first response, header excluded — same convention `getRowAtIndex`
 * uses elsewhere). Returned directly from the same read-modify-write that
 * performed the append, rather than making the caller re-download and
 * re-scan the file afterward: a fresh read immediately after an upload
 * risks returning momentarily-stale content (ordinary eventual-consistency
 * lag, not an error), which previously could make `findRowIndexByResponseId`
 * report "not found" for a response that had, in fact, just been written —
 * silently skipping `upsertIndex` and making that response invisible to
 * every view that looks it up by id (the approval-routing pages especially).
 * See `updateResponseRow` below for editing an existing response
 * (index-cache + self-heal strategy, which still needs a fresh read).
 */
export async function appendResponseRow(form: FormDefinition, response: FormResponse): Promise<number> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  const metaValues: Row = [
    response.id,
    response.respondentUpn,
    response.submittedAt ?? "",
    "",
    "",
    0,
    "Submitted",
  ];
  const fieldValues = flattenFields(form).map((f) => toCellValue(f, response.answers[f.id]));
  const newRow: Row = [...metaValues, ...fieldValues];

  return withOptimisticUpdate(driveId, workbookPath(form.id), (rows) => ({
    rows: [...rows, newRow],
    // rows here still includes the header row (index 0) — the new row's
    // data-row index (header excluded) is its position before the push.
    result: rows.length - 1,
  }));
}

/** Full-table scan for the row whose ResponseId (column 0) matches — the
 *  self-heal path when the cached row index has drifted (someone manually
 *  sorted/edited the sheet). Only triggered on a verification mismatch, not
 *  on every update. */
export async function findRowIndexByResponseId(form: FormDefinition, responseId: string): Promise<number | null> {
  const rows = await getResponseRows(form);
  const idx = rows.findIndex((r) => r.values[0] === responseId);
  return idx === -1 ? null : idx;
}

/**
 * Updates an existing response's row, addressed by index (0 = the first
 * data row, after the header). Verifies the cached index still points at
 * the right ResponseId first; if it doesn't (someone manually sorted/edited
 * the sheet), re-locates it via a full scan and corrects the index. Writes
 * the full row (never a partial patch, so meta + field columns stay
 * consistent as one atomic write). Returns the (possibly corrected) row
 * index, for the caller to re-cache.
 */
export async function updateResponseRow(
  form: FormDefinition,
  response: FormResponse,
  cachedRowIndex: number,
  editorEmail: string
): Promise<number> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  const fieldValues = flattenFields(form).map((f) => toCellValue(f, response.answers[f.id]));

  return withOptimisticUpdate(driveId, workbookPath(form.id), (rows) => {
    let rowIndex = cachedRowIndex;
    let current = rows[rowIndex + 1] as Row | undefined;
    if (!current || current[0] !== response.id) {
      const found = rows.findIndex((r, i) => i > 0 && r[0] === response.id) - 1;
      if (found < 0) {
        throw new Error(`Response ${response.id} not found in the workbook — cannot update.`);
      }
      rowIndex = found;
      current = rows[rowIndex + 1] as Row | undefined;
    }

    const prevEditCount = typeof current?.[5] === "number" ? current[5] : 0;
    const originalSubmittedAt = (current?.[2] as string) || response.submittedAt || "";

    const metaValues: Row = [
      response.id,
      response.respondentUpn,
      originalSubmittedAt,
      editorEmail,
      new Date().toISOString(),
      prevEditCount + 1,
      "Edited",
    ];
    const newRow: Row = [...metaValues, ...fieldValues];

    const nextRows = [...rows];
    nextRows[rowIndex + 1] = newRow;
    return { rows: nextRows, result: rowIndex };
  });
}

/** Reconstructs a full FormResponse from a workbook row — used by the
 *  existing-response gate (edit mode) and the admin response detail view. */
export async function getResponseByRowIndex(form: FormDefinition, rowIndex: number): Promise<FormResponse | null> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  const rows = await readWorkbookRows(driveId, workbookPath(form.id));
  const raw = rows[rowIndex + 1] as Row | undefined;
  if (!raw) return null;

  const fields = flattenFields(form);
  const answers: Record<string, AnswerValue> = {};
  fields.forEach((f, i) => {
    answers[f.id] = fromCellValue(f, raw[META_COLUMNS.length + i]);
  });

  const editCount = typeof raw[5] === "number" ? raw[5] : 0;

  return {
    id: String(raw[0]),
    formId: form.id,
    formVersion: form.latestPublishedVersion ?? form.currentDraftVersion,
    respondentUpn: String(raw[1]),
    answers,
    status: "submitted",
    submittedAt: String(raw[2] || ""),
    updatedAt: String((editCount > 0 ? raw[4] : raw[2]) || ""),
    editHistory: [],
  };
}

export interface ResponseRow {
  values: (string | number | boolean | null)[];
}

/** Raw rows for the admin response grid — column order matches
 *  META_COLUMNS + flattenFields(form). */
export async function getResponseRows(form: FormDefinition): Promise<ResponseRow[]> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  if (!(await workbookExists(driveId, form.id))) return [];

  const rows = await readWorkbookRows(driveId, workbookPath(form.id));
  return rows.slice(1).map((values) => ({ values }));
}

export function responseGridColumns(form: FormDefinition): string[] {
  return [...META_COLUMNS, ...flattenFields(form).map((f) => f.label || f.id)];
}
