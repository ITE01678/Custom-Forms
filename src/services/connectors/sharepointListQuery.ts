import { queryListItems } from "../lists";
import type { DataSourceConnector } from "./registry";

export interface SharePointListQueryConfig {
  /** List name within the "Forms" site. */
  listName: string;
  /** Column to filter on, matched against the resolved lookup key. */
  filterColumn: string;
}

/**
 * Reads a SharePoint List (in the Forms site) as a data source — e.g. a team
 * roster maintained as a List instead of an Excel file.
 */
export const sharepointListQueryConnector: DataSourceConnector<SharePointListQueryConfig> = {
  type: "sharepoint-list-query",
  async resolve(config, params) {
    if (!params.keyValue) return [];
    const items = await queryListItems<Record<string, unknown>>(config.listName, {
      filter: `fields/${config.filterColumn} eq '${params.keyValue}'`,
    });
    return items.map((item) => item.fields);
  },
};
