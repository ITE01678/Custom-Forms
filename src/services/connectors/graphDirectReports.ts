import { getDirectReports } from "../users";
import type { DataSourceConnector } from "./registry";

/**
 * The "team roster" connector for scenarios like the Team Outing form: the
 * lookup key is the manager's email (defaults to the respondent themselves
 * if no key is given), returning each direct report as a row.
 */
export const graphDirectReportsConnector: DataSourceConnector = {
  type: "graph-directReports",
  async resolve(_config, params, ctx) {
    const managerEmail = params.keyValue || ctx.currentUserEmail;
    const reports = await getDirectReports(managerEmail);
    return reports as unknown as Record<string, unknown>[];
  },
};
