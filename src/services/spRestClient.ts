import { graphFetch } from "./graphClient";
import { spRestScopes } from "../auth/msalConfig";

/**
 * SharePoint's classic REST API (`_api/...`) — a SEPARATE OAuth resource
 * audience from Microsoft Graph, used only by services/siteRoles.ts to read
 * which native SharePoint permission group (Owners/Members) the signed-in
 * user belongs to. Graph v1.0 has no endpoint for that, so this exists purely
 * to fill that one gap — everything else in the app stays on Graph.
 *
 * Reuses graphFetch's hardened token-acquisition/retry/error-typing wrapper
 * via GraphRequestOptions.baseUrl rather than duplicating that logic.
 */

const SITE_HOSTNAME = import.meta.env.VITE_SHAREPOINT_HOSTNAME as string | undefined;
const SITE_PATH = import.meta.env.VITE_SHAREPOINT_SITE_PATH as string | undefined;
const SP_REST_BASE = SITE_HOSTNAME && SITE_PATH ? `https://${SITE_HOSTNAME}${SITE_PATH}/_api` : undefined;

export async function spRestFetch<T>(path: string, opts: { method?: "GET" | "POST" } = {}): Promise<T> {
  if (!SP_REST_BASE) {
    throw new Error(
      "VITE_SHAREPOINT_HOSTNAME / VITE_SHAREPOINT_SITE_PATH are not set — " +
        "can't resolve the SharePoint REST API base (see SETUP.md)."
    );
  }
  return graphFetch<T>(`${SP_REST_BASE}${path}`, {
    absoluteUrl: true,
    method: opts.method ?? "GET",
    scopes: spRestScopes.site,
    // odata=nodata strips SharePoint REST's verbose __metadata wrapper —
    // plain, flat JSON, same shape the rest of this app already expects.
    headers: { Accept: "application/json;odata=nodata" },
  });
}
