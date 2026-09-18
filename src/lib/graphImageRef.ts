/**
 * A stored "image reference" for a SharePoint-uploaded file, encoded as a
 * string so BrandingConfig/section/option fields can keep a plain `string`
 * shape (still accepting a pasted external https:// URL in the same field).
 * A real driveItem `webUrl` only renders as an <img src> for a browser that
 * already has its own SharePoint sign-in session cookie — which an
 * incognito/private window (how this app gets tested) never has — so
 * uploads are referenced this way instead and resolved to an authenticated
 * blob URL at render time (see services/imageCache.ts).
 */
const PREFIX = "graph-image://";

export function encodeGraphImageRef(driveId: string, itemPath: string): string {
  return `${PREFIX}${driveId}/${encodeURIComponent(itemPath)}`;
}

export function decodeGraphImageRef(ref: string): { driveId: string; itemPath: string } | null {
  if (!ref.startsWith(PREFIX)) return null;
  const rest = ref.slice(PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return null;
  return { driveId: rest.slice(0, slashIndex), itemPath: decodeURIComponent(rest.slice(slashIndex + 1)) };
}
