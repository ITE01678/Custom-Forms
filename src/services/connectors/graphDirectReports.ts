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
    // Matches the sibling graphProfileConnector's own guard for the same
    // case (empty resolved key) — a broken/misconfigured template
    // expression could resolve to "" with no respondent email to fall back
    // on either, and getDirectReports("") has no defined behavior worth
    // relying on.
    if (!managerEmail) return [];
    const reports = await getDirectReports(managerEmail);
    return reports as unknown as Record<string, unknown>[];
  },
};
