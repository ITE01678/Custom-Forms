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
