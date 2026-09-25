import { graphFetchBinary } from "./graphClient";
import { graphScopes } from "../auth/msalConfig";
import { decodeGraphImageRef } from "../lib/graphImageRef";

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Blob URLs are never revoked otherwise — this cache is intentionally
// shared across the whole session (so the same image isn't re-downloaded
// every time it's re-rendered across different pages), which means a
// per-component unmount can't safely revoke one either without risking
// breaking some OTHER still-mounted component using the same cached URL.
// Bounding total cache size with simple LRU eviction (Map preserves
// insertion order; re-inserting on every access bumps recency) is what
// keeps a long admin session browsing many forms/responses/images from
// growing this without limit — confirmed nothing anywhere calls
// URL.revokeObjectURL today.
const MAX_CACHED_IMAGES = 50;

function cacheUrl(key: string, url: string): void {
  blobUrlCache.delete(key);
  blobUrlCache.set(key, url);
  while (blobUrlCache.size > MAX_CACHED_IMAGES) {
    const oldestKey = blobUrlCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestUrl = blobUrlCache.get(oldestKey);
    blobUrlCache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

/**
 * Resolves a stored image value to something an <img>/CSS background can
 * actually load: a plain http(s) URL is returned as-is (pasted external
 * image), a graph-image:// reference is downloaded through our own
 * authenticated Graph call and turned into a same-session blob URL —
 * cached so the same image isn't re-downloaded on every re-render.
 */
export async function resolveDisplayUrl(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  const ref = decodeGraphImageRef(src);
  if (!ref) return src;

  const cached = blobUrlCache.get(src);
  if (cached) {
    cacheUrl(src, cached); // bump recency
    return cached;
  }
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = graphFetchBinary(`/drives/${ref.driveId}/root:/${ref.itemPath}:/content`, {
    // Plain driveItem content GET — the Excel Workbook API's tenant quirk
    // (which needed the broader Sites.ReadWrite.All scope) is specific to
    // /workbook/... calls; services/excel.ts's own comments confirm plain
    // /content GET/PUT already works fine under Sites.Manage.All alone
    // throughout this app (templates, attachments, version snapshots).
    // Sites.ReadWrite.All is the newer, less-exercised scope and more
    // likely to still need an interactive consent prompt on some sessions —
    // stick to the well-exercised scope here (this call is also
    // non-interactive by default; see graphFetchBinary/getDelegatedToken).
    scopes: graphScopes.sites,
  }).then(
    (blob) => {
      const blobUrl = URL.createObjectURL(blob);
      cacheUrl(src, blobUrl);
      inflight.delete(src);
      return blobUrl;
    },
    (err) => {
      inflight.delete(src);
      throw err;
    }
  );
  inflight.set(src, promise);
  return promise;
}
