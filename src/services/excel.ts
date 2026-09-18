import { graphFetch, graphUploadBinary } from "./graphClient";
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

const TABLE = "Responses";

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
  return templateBytesCache;
}

async function workbookExists(driveId: string, formId: string): Promise<boolean> {
  try {
    await graphFetch(`/drives/${driveId}/root:/${workbookPath(formId)}?$select=id`, {
      scopes: graphScopes.excel,
    });
    return true;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return false;
    throw err;
  }
}

async function addTableColumn(driveId: string, formId: string, name: string): Promise<void> {
  await graphFetch(`/drives/${driveId}/root:/${workbookPath(formId)}:/workbook/tables('${TABLE}')/columns/add`, {
    method: "POST",
    body: { name },
    scopes: graphScopes.excel,
  });
}

/**
 * Creates this form's response workbook (a copy of the blank template,
 * uploaded into the ResponseWorkbooks library) the first time it's needed —
 * normally right after Publish. Idempotent: a no-op if the workbook already
 * exists. Adds one Excel column per form field, in `flattenFields` order,
 * after the template's fixed meta columns.
 */
export async function ensureWorkbookForForm(form: FormDefinition): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  if (await workbookExists(driveId, form.id)) return;

  const bytes = await getTemplateBytes();
  await graphUploadBinary(`/drives/${driveId}/root:/${workbookPath(form.id)}:/content`, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    scopes: graphScopes.excel,
  });

  for (const field of flattenFields(form)) {
    // Column header is the human-readable label for anyone opening the sheet
    // directly — cosmetic only. Row writes are always positional (full row
    // array in flattenFields order), so a label collision doesn't corrupt
    // data, but duplicate labels across fields in one form should still be
    // avoided in the builder (not yet enforced — noted as a known gap).
    await addTableColumn(driveId, form.id, field.label || field.id);
  }
}

/** Appends one brand-new response as a row. See `updateResponseRow` below
 *  for editing an existing response (index-cache + self-heal strategy). */
export async function appendResponseRow(form: FormDefinition, response: FormResponse): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  const metaValues: (string | number)[] = [
    response.id,
    response.respondentUpn,
    response.submittedAt ?? "",
    "",
    "",
    0,
    "Submitted",
  ];
  const fieldValues = flattenFields(form).map((f) => toCellValue(f, response.answers[f.id]));

  await graphFetch(`/drives/${driveId}/root:/${workbookPath(form.id)}:/workbook/tables('${TABLE}')/rows`, {
    method: "POST",
    body: { values: [[...metaValues, ...fieldValues]] },
    scopes: graphScopes.excel,
  });
}

async function getRowAtIndex(driveId: string, formId: string, rowIndex: number): Promise<unknown[] | null> {
  try {
    const result = await graphFetch<{ values: unknown[][] }>(
      `/drives/${driveId}/root:/${workbookPath(formId)}:/workbook/tables('${TABLE}')/rows/itemAt(index=${rowIndex})?$select=values`,
      { scopes: graphScopes.excel }
    );
    return result.values[0] ?? null;
  } catch (err) {
    // itemAt on an out-of-range index errors (400/404 depending on tenant) —
    // treat any of those as "not there," not a hard failure.
    if (err instanceof GraphError && (err.status === 400 || err.status === 404)) return null;
    throw err;
  }
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
 * Updates an existing response's row. Graph can only update a table row by
 * index, not by key, so this: (1) reads the cached index, (2) verifies that
 * row's ResponseId still matches, (3) if not, re-locates it via a full scan
 * and corrects the index, then (4) writes the full row (never a partial
 * patch, so meta + field columns stay consistent as one atomic write).
 * Returns the (possibly corrected) row index, for the caller to re-cache.
 */
export async function updateResponseRow(
  form: FormDefinition,
  response: FormResponse,
  cachedRowIndex: number,
  editorEmail: string
): Promise<number> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);

  let rowIndex = cachedRowIndex;
  let current = await getRowAtIndex(driveId, form.id, rowIndex);
  if (!current || current[0] !== response.id) {
    const found = await findRowIndexByResponseId(form, response.id);
    if (found === null) {
      throw new Error(`Response ${response.id} not found in the workbook — cannot update.`);
    }
    rowIndex = found;
    current = await getRowAtIndex(driveId, form.id, rowIndex);
  }

  const prevEditCount = typeof current?.[5] === "number" ? current[5] : 0;
  const originalSubmittedAt = (current?.[2] as string) || response.submittedAt || "";

  const metaValues: (string | number)[] = [
    response.id,
    response.respondentUpn,
    originalSubmittedAt,
    editorEmail,
    new Date().toISOString(),
    prevEditCount + 1,
    "Edited",
  ];
  const fieldValues = flattenFields(form).map((f) => toCellValue(f, response.answers[f.id]));

  await graphFetch(
    `/drives/${driveId}/root:/${workbookPath(form.id)}:/workbook/tables('${TABLE}')/rows/itemAt(index=${rowIndex})`,
    {
      method: "PATCH",
      body: { values: [[...metaValues, ...fieldValues]] },
      scopes: graphScopes.excel,
    }
  );

  return rowIndex;
}

/** Reconstructs a full FormResponse from a workbook row — used by the
 *  existing-response gate (edit mode) and the admin response detail view. */
export async function getResponseByRowIndex(form: FormDefinition, rowIndex: number): Promise<FormResponse | null> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.responseWorkbooks);
  const raw = await getRowAtIndex(driveId, form.id, rowIndex);
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

  const result = await graphFetch<{ value: { values: unknown[][] }[] }>(
    `/drives/${driveId}/root:/${workbookPath(form.id)}:/workbook/tables('${TABLE}')/rows?$select=values`,
    { scopes: graphScopes.excel }
  );
  return result.value.map((r) => ({ values: r.values[0] as ResponseRow["values"] }));
}

export function responseGridColumns(form: FormDefinition): string[] {
  return [...META_COLUMNS, ...flattenFields(form).map((f) => f.label || f.id)];
}
