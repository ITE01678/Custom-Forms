import * as XLSX from "xlsx";
import { graphFetch, graphFetchBinary, graphUploadBinaryViaSession } from "./graphClient";
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

export function workbookPath(formId: string): string {
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

/** A static choice field's `value` (often an opaque key like "option-1", or
 *  a connector's raw column value like an email) is meaningless to anyone
 *  opening the workbook directly — resolve it to the designer-facing label
 *  before it ever reaches a cell, matching Microsoft Forms' own export
 *  convention of always showing the visible choice text. Falls back to the
 *  raw value when there's no match: connector-driven choice answers are
 *  already label-based by the time they get here (see
 *  DynamicChoiceField.tsx), and a free-text "Other" answer never matches
 *  any option to begin with. */
function resolveOptionLabel(field: FormField, rawValue: string): string {
  return field.options?.find((o) => o.value === rawValue)?.label ?? rawValue;
}

/** Inverse of resolveOptionLabel, for reconstructing the original `value`
 *  from a cell that now holds the label — needed so editing an existing
 *  response can still correctly pre-select the right option (comparison
 *  there is against `option.value`). Only meaningful for static options;
 *  falls back to the raw (label) string otherwise, which is exactly what a
 *  connector-driven field's answer already needs — see DynamicChoiceField.tsx. */
function resolveOptionValue(field: FormField, rawLabel: string): string {
  return field.options?.find((o) => o.label === rawLabel)?.value ?? rawLabel;
}

function toCellValue(field: FormField, value: AnswerValue | undefined): string | number | boolean {
  if (value === undefined || value === null) return "";
  if (isRepeatingTableValue(value)) return JSON.stringify(value);
  // fileUpload stores structured JSON (like repeatingTable), not a cosmetic
  // string — a "pretty" rendering would lose the url/size needed to edit
  // the response later, since Excel is this app's system of record.
  if (field.type === "fileUpload" && isFileAttachmentArray(value)) return JSON.stringify(value);
  if (field.type === "singleChoice" && typeof value === "string") return resolveOptionLabel(field, value);
  if (field.type === "multiChoice" && Array.isArray(value)) {
    return (value as string[]).map((v) => resolveOptionLabel(field, v)).join(", ");
  }
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
    return typeof raw === "string"
      ? raw
          .split(", ")
          .filter(Boolean)
          .map((label) => resolveOptionValue(field, label))
      : [];
  }
  if (field.type === "singleChoice") {
    return typeof raw === "string" ? resolveOptionValue(field, raw) : String(raw);
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

/** The header row is the fixed meta columns plus one column per form field
 *  (its label, falling back to its id), in `flattenFields` order — matches
 *  Microsoft Forms' convention of using the actual question text as the
 *  Excel column header. */
function computeHeaderRow(form: FormDefinition): Row {
  return [...META_COLUMNS, ...flattenFields(form).map((f) => f.label || f.id)];
}

/** True for a row with no real content — SheetJS's own fallback shape for
 *  reading a corrupted/empty file (`[""]`), or a genuinely blank row. */
function isDegenerateRow(row: Row | undefined): boolean {
  return !row || (row.length <= 1 && (row[0] === "" || row[0] === undefined));
}

/** Defensive self-heal: if the sheet's first row isn't our real header
 *  (ResponseId as column 0), it's not safe to assume row 0 is a header at
 *  all — every reader downstream (getResponseRows' `.slice(1)`, the admin
 *  grid) treats row 0 as one regardless. This has been seen to happen for
 *  real: earlier corruption in this tenant produced workbooks whose only
 *  row was actual response data with no header at all, silently hiding
 *  every response from the admin view. Rebuild a correct header and keep
 *  any real (non-degenerate) rows as data, rather than trusting a
 *  possibly-missing or corrupted first row. */
function ensureHeaderRow(rows: Row[], form: FormDefinition): Row[] {
  if (rows[0]?.[0] === META_COLUMNS[0]) return rows;
  const dataRows = rows.filter((r) => !isDegenerateRow(r));
  return [computeHeaderRow(form), ...dataRows];
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
  // Defensive: aoa_to_sheet is expected to compute this automatically, but
  // explicitly setting it removes any doubt that a missing/incorrect
  // dimension is what's producing a sheet some downstream reader treats as
  // empty — cheap and harmless either way.
  if (!sheet["!ref"] && rows.length > 0) {
    const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 1);
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxCols - 1 } });
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Responses");
  // Despite the `type: "array"` option and the `as Uint8Array` assertion
  // below (a compile-time-only claim TypeScript doesn't verify), SheetJS's
  // actual runtime return value here is a raw ArrayBuffer, not a Uint8Array
  // view over one — confirmed the hard way: `out.byteLength` worked (both
  // ArrayBuffer and Uint8Array have it), but `out.slice().buffer` was
  // silently `undefined` (ArrayBuffer.prototype.slice() returns another
  // ArrayBuffer, which has no `.buffer` property of its own — only a
  // TypedArray view does), so every upload was sent with an undefined body.
  // Normalize once, here, so every downstream use (byteLength reads,
  // .slice().buffer for the upload) works consistently either way.
  const rawOut = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array | ArrayBuffer;
  const out = rawOut instanceof ArrayBuffer ? new Uint8Array(rawOut) : rawOut;

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

  // A plain `PUT .../content` was confirmed (via Graph's own post-write
  // item metadata) to silently corrupt this tenant's .xlsx uploads to size
  // 0 despite a 200 response and a new version — same class of Excel/WAC
  // brokenness already documented above for the Workbook REST API. The
  // upload-session route sidesteps whatever broken finalize step causes
  // that; see graphUploadBinaryViaSession's doc comment.
  await graphUploadBinaryViaSession(driveId, itemPath, out.slice().buffer, {
    scopes: graphScopes.sites,
    ifMatchEtag: ifMatchEtag ? toIfMatchValue(ifMatchEtag) : undefined,
  });

  // Temporary diagnostic logging — remove once the "blank workbook" issue is
  // confirmed fixed. Asks Graph directly what size/eTag it now has on record
  // for this item, independent of any content read — narrows whether a
  // "content comes back blank" symptom is a write that never truly
  // committed real bytes (this would show a wrong/tiny size here too) vs.
  // one where Graph's own metadata is correct but serving `/content` back
  // is what's broken (size here would match outputByteLength).
  try {
    const item = await graphFetch<{ size: number; eTag: string; lastModifiedDateTime: string }>(
      `/drives/${driveId}/root:/${itemPath}?$select=size,eTag,lastModifiedDateTime`,
      { scopes: graphScopes.sites }
    );
    // eslint-disable-next-line no-console
    console.info("[excel-debug] post-write item metadata", {
      itemPath,
      expectedByteLength: out.byteLength,
      graphReportedSize: item.size,
      eTag: item.eTag,
      lastModifiedDateTime: item.lastModifiedDateTime,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.info("[excel-debug] post-write item metadata fetch failed", err);
  }
}

/**
 * Read-modify-write with optimistic concurrency: downloads the current
 * rows + ETag, lets `mutate` compute the new rows (and any value it wants
 * to return to the caller) from them, uploads with `If-Match`, and retries
 * from a fresh download if another submit/edit won the race (412).
 */
class WriteVerificationError extends Error {}

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

      // Verify the write actually took effect before reporting success —
      // there is direct evidence in this tenant that a PUT can be accepted
      // (200, a new SharePoint file version) while the content that lands
      // is NOT what was uploaded (seen once as a completely blank sheet
      // with SharePoint's own default "Sheet1" name, not ours). Silently
      // trusting the PUT's success turns that into invisible data loss —
      // the respondent is told "submitted" and nothing is ever queued for
      // retry. Re-reading and comparing row counts converts that into a
      // real, visible, retryable failure instead.
      const verifyRows = await readWorkbookRows(driveId, itemPath);
      if (verifyRows.length !== nextRows.length) {
        throw new WriteVerificationError(
          `Write verification failed: expected ${nextRows.length} row(s) after saving, found ${verifyRows.length}. ` +
            `The upload was accepted but its content doesn't match what was sent — this has been seen before in ` +
            `this tenant's SharePoint. Not treating this as a successful save.`
        );
      }

      return result;
    } catch (err) {
      const isConflict = err instanceof GraphError && err.status === 412;
      const isVerificationMiss = err instanceof WriteVerificationError;
      // Temporary diagnostic logging — remove once the "blank workbook"
      // issue is confirmed fixed. writeWorkbookRows/graphUploadBinaryViaSession
      // can throw for reasons that were previously invisible (no log fired
      // between "writeWorkbookRows" and the next "readWorkbookRows" line) —
      // log every caught error explicitly, GraphError or not, so a real
      // failure (CORS, a rejected upload session, a network error) is never
      // silently indistinguishable from "didn't get this far yet".
      // eslint-disable-next-line no-console
      console.info("[excel-debug] withOptimisticUpdate caught error", {
        itemPath,
        attempt,
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : String(err),
        graphStatus: err instanceof GraphError ? err.status : undefined,
        graphBody: err instanceof GraphError ? err.body : undefined,
        willRetry: (isConflict || isVerificationMiss) && attempt < maxAttempts,
      });
      if ((!isConflict && !isVerificationMiss) || attempt === maxAttempts) throw err;
      // Someone else wrote first (conflict), or this write didn't actually
      // take effect (verification miss) — either way, loop and try again
      // from a fresh read rather than blindly retrying the identical bytes.
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
  const headerRow = computeHeaderRow(form);
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

  return withOptimisticUpdate(driveId, workbookPath(form.id), (rows) => {
    const repaired = ensureHeaderRow(rows, form);
    return {
      rows: [...repaired, newRow],
      // repaired still includes the header row (index 0) — the new row's
      // data-row index (header excluded) is its position before the push.
      result: repaired.length - 1,
    };
  });
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

  return withOptimisticUpdate(driveId, workbookPath(form.id), (rowsIn) => {
    const rows = ensureHeaderRow(rowsIn, form);
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
  let rows: Row[];
  try {
    rows = await readWorkbookRows(driveId, workbookPath(form.id));
  } catch (err) {
    // A stale ResponseIndex entry (e.g. pointing at a workbook that was
    // manually deleted and not yet recreated) shouldn't crash the page that
    // looks it up — treat "the workbook doesn't exist" the same way
    // workbookExists() already does elsewhere: as "no response", not an error.
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
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

/** Best-effort cleanup for a hard form delete — a 404 (nothing to delete)
 *  is not an error here, unlike everywhere else this module treats it. */
export async function deleteResponseWorkbookIfExists(formId: string): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  try {
    await graphFetch(`/drives/${driveId}/root:/${workbookPath(formId)}`, {
      method: "DELETE",
      scopes: graphScopes.sites,
    });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return;
    throw err;
  }
}

/** A plain driveItem webUrl, for an admin to open the file directly in
 *  SharePoint's own web UI in a new tab — safe for that (unlike rendering
 *  it inline, see graphClient.ts's doc comment on graphFetchBinary), since
 *  the browser already carries the signed-in user's own SharePoint session. */
export async function getResponseWorkbookWebUrl(formId: string): Promise<string | null> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  try {
    const item = await graphFetch<{ webUrl: string }>(
      `/drives/${driveId}/root:/${workbookPath(formId)}?$select=webUrl`,
      { scopes: graphScopes.sites }
    );
    return item.webUrl;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
}
