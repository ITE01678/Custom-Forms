import { graphFetchBinary } from "./graphClient";
import { graphScopes } from "../auth/msalConfig";
import { decodeGraphImageRef } from "../lib/graphImageRef";

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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
  if (cached) return cached;
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = graphFetchBinary(`/drives/${ref.driveId}/root:/${ref.itemPath}:/content`, {
    scopes: graphScopes.sites,
  }).then((blob) => {
    const blobUrl = URL.createObjectURL(blob);
    blobUrlCache.set(src, blobUrl);
    inflight.delete(src);
    return blobUrl;
  });
  inflight.set(src, promise);
  return promise;
}
