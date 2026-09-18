import { useEffect, useState } from "react";
import { resolveDisplayUrl } from "../services/imageCache";

/** Resolves a stored image value (external URL or graph-image:// reference)
 *  to something actually loadable — see services/imageCache.ts. */
export function useResolvedImageUrl(src: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  useEffect(() => {
    setResolved(undefined);
    if (!src) return;
    let cancelled = false;
    resolveDisplayUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return resolved;
}
