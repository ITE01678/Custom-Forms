import { getUserProfile } from "../users";
import type { DataSourceConnector } from "./registry";

/**
 * Looks up ANOTHER user's directory profile by email (unlike the simpler
 * `graph-autofill` fillMode, which only ever reads the respondent's own
 * profile) — e.g. resolving a manager's or a named colleague's details.
 * No config needed; the lookup key IS the email to look up.
 */
export const graphProfileConnector: DataSourceConnector = {
  type: "graph-profile",
  async resolve(_config, params) {
    if (!params.keyValue) return [];
    const profile = await getUserProfile(params.keyValue);
    return [profile as unknown as Record<string, unknown>];
  },
};
