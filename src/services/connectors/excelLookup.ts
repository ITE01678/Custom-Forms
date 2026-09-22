import * as XLSX from "xlsx";
import { graphFetchBinary } from "../graphClient";
import { resolveDriveIdByLibraryName } from "../sites";
import { graphScopes } from "../../auth/msalConfig";
import type { DataSourceConnector } from "./registry";

export interface ExcelLookupConfig {
  /** Document library within the "Forms" site holding the shared file — the
   *  admin uploads e.g. an HR roster workbook into a library of their choice. */
  libraryName: string;
  /** Path to the file within that library, e.g. "hr-roster.xlsx". */
  itemPath: string;
  /** Worksheet name — optional; defaults to the file's first sheet if
   *  omitted or if it doesn't match any sheet in the file. Historically
   *  this named a formal Excel "Table" object via Graph's Workbook API;
   *  that API doesn't work in this tenant for any file (see excel.ts's
   *  top-of-file comment), so this now just reads the sheet's raw cell
   *  grid directly — a plain range with a header row in row 1 works fine,
   *  no Insert → Table step required. */
  table?: string;
  /** Column header to match the lookup key against. */
  keyColumn: string;
}

type Row = (string | number | boolean)[];

/**
 * Reads a DIFFERENT shared Excel file than the response workbooks — e.g. a
 * master HR roster spreadsheet someone maintains in SharePoint — matching
 * rows where `keyColumn` equals the resolved lookup key. Downloaded as plain
 * file bytes and parsed client-side (SheetJS), the same approach
 * services/excel.ts uses for response workbooks and for the same reason:
 * Graph's Excel Workbook REST API (`/workbook/...`) cannot negotiate a
 * session for any file in this tenant, confirmed identically here (a
 * completely different file, reached through the connector picker rather
 * than the response-workbook flow) as it was for response workbooks.
 */
export const excelLookupConnector: DataSourceConnector<ExcelLookupConfig> = {
  type: "excel-lookup",
  async resolve(config, params) {
    const driveId = await resolveDriveIdByLibraryName(config.libraryName);
    const blob = await graphFetchBinary(`/drives/${driveId}/root:/${config.itemPath}:/content`, {
      scopes: graphScopes.sites,
    });
    const bytes = await blob.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(bytes), { type: "array" });

    const sheetName = config.table && workbook.SheetNames.includes(config.table) ? config.table : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found in "${config.itemPath}".`);

    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "" });
    const headers = (rows[0] ?? []).map((h) => String(h));
    const keyIndex = headers.indexOf(config.keyColumn);
    if (keyIndex === -1) {
      throw new Error(`Column "${config.keyColumn}" not found in sheet "${sheetName}".`);
    }

    return rows
      .slice(1)
      .filter((r) => String(r[keyIndex] ?? "") === params.keyValue)
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  },
};
