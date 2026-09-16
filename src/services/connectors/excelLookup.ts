import { graphFetch, graphFetchAllPages } from "../graphClient";
import { resolveDriveIdByLibraryName } from "../sites";
import { graphScopes } from "../../auth/msalConfig";
import type { DataSourceConnector } from "./registry";

export interface ExcelLookupConfig {
  /** Document library within the "Forms" site holding the shared file — the
   *  admin uploads e.g. an HR roster workbook into a library of their choice. */
  libraryName: string;
  /** Path to the file within that library, e.g. "hr-roster.xlsx". */
  itemPath: string;
  /** Name of the Excel Table inside the workbook. */
  table: string;
  /** Column header to match the lookup key against. */
  keyColumn: string;
}

/**
 * Reads a DIFFERENT shared Excel file than the response workbooks — e.g. a
 * master HR roster spreadsheet someone maintains in SharePoint — matching
 * rows where `keyColumn` equals the resolved lookup key.
 */
export const excelLookupConnector: DataSourceConnector<ExcelLookupConfig> = {
  type: "excel-lookup",
  async resolve(config, params) {
    const driveId = await resolveDriveIdByLibraryName(config.libraryName);
    const base = `/drives/${driveId}/root:/${config.itemPath}:/workbook/tables('${config.table}')`;

    const columns = await graphFetch<{ value: { name: string }[] }>(`${base}/columns?$select=name`, {
      scopes: graphScopes.sites,
    });
    const headers = columns.value.map((c) => c.name);
    const keyIndex = headers.indexOf(config.keyColumn);
    if (keyIndex === -1) {
      throw new Error(`Column "${config.keyColumn}" not found in table "${config.table}".`);
    }

    const rows = await graphFetchAllPages<{ values: unknown[][] }>(`${base}/rows?$select=values`, {
      scopes: graphScopes.sites,
    });

    return rows
      .filter((r) => String(r.values[0][keyIndex] ?? "") === params.keyValue)
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r.values[0][i]])));
  },
};
