import { graphFetch } from "./graphClient";

/**
 * Resolves the SharePoint "Forms" site's id/drive id via Graph, so the rest of
 * the app (Excel workbook access, list CRUD in later phases) never has to
 * hardcode or re-resolve them. Configure via env vars once the site exists
 * (see SETUP.md) — resolution is done lazily and cached in-memory per session,
 * mirroring the Employee Portal's resolved-Config.txt values but computed at
 * runtime instead of pasted in by hand.
 */

const SITE_HOSTNAME = import.meta.env.VITE_SHAREPOINT_HOSTNAME as string | undefined; // e.g. "jupiterkolkata.sharepoint.com"
const SITE_PATH = import.meta.env.VITE_SHAREPOINT_SITE_PATH as string | undefined; // e.g. "/sites/Forms"

interface SiteInfo {
  siteId: string;
  driveId: string;
}

let cached: SiteInfo | null = null;

async function resolveSiteId(): Promise<string> {
  if (!SITE_HOSTNAME || !SITE_PATH) {
    throw new Error(
      "VITE_SHAREPOINT_HOSTNAME / VITE_SHAREPOINT_SITE_PATH are not set — " +
        "create the 'Forms' SharePoint site first (see SETUP.md) and add these to .env.local."
    );
  }
  const site = await graphFetch<{ id: string }>(`/sites/${SITE_HOSTNAME}:${SITE_PATH}`);
  return site.id;
}

async function resolveDriveId(siteId: string): Promise<string> {
  const drive = await graphFetch<{ id: string }>(`/sites/${siteId}/drive?$select=id`);
  return drive.id;
}

export async function getFormsSite(): Promise<SiteInfo> {
  if (cached) return cached;
  const siteId = await resolveSiteId();
  const driveId = await resolveDriveId(siteId);
  cached = { siteId, driveId };
  return cached;
}

/** Resolves a SharePoint List's id by its display name within the Forms site. */
export async function resolveListId(listName: string): Promise<string> {
  const { siteId } = await getFormsSite();
  const list = await graphFetch<{ id: string }>(
    `/sites/${siteId}/lists/${encodeURIComponent(listName)}?$select=id`
  );
  return list.id;
}

const driveIdByLibraryCache = new Map<string, string>();

/**
 * Document libraries (e.g. "ResponseWorkbooks", "FormVersions") are each their
 * own drive, distinct from the site's default drive returned by
 * `getFormsSite()`. Resolves and caches by library display name.
 */
export async function resolveDriveIdByLibraryName(libraryName: string): Promise<string> {
  const cached = driveIdByLibraryCache.get(libraryName);
  if (cached) return cached;

  const { siteId } = await getFormsSite();
  const drives = await graphFetch<{ value: { id: string; name: string }[] }>(
    `/sites/${siteId}/drives?$select=id,name`
  );
  const match = drives.value.find((d) => d.name === libraryName);
  if (!match) {
    throw new Error(
      `No document library named "${libraryName}" found on the Forms site — ` +
        `it should have been created by services/bootstrap.ts on first load.`
    );
  }
  driveIdByLibraryCache.set(libraryName, match.id);
  return match.id;
}
