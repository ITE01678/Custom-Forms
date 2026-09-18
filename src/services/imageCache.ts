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
    // Sites.Manage.All alone has already proven insufficient for at least
    // one class of Graph sub-resource access in this tenant (the Excel
    // Workbook API) — use the broader excel scope set here too rather than
    // assuming a plain driveItem content read is unaffected.
    scopes: graphScopes.excel,
  }).then(
    (blob) => {
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(src, blobUrl);
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
