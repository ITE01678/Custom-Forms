import { useEffect, useState } from "react";
import { resolveDisplayUrl } from "../services/imageCache";

export interface ResolvedImage {
  url: string | undefined;
  error: string | undefined;
}

/** Resolves a stored image value (external URL or graph-image:// reference)
 *  to something actually loadable — see services/imageCache.ts. Surfaces a
 *  failure explicitly instead of leaving the caller unable to tell "still
 *  loading" apart from "will never load." */
export function useResolvedImageUrl(src: string | undefined): ResolvedImage {
  const [state, setState] = useState<ResolvedImage>({ url: undefined, error: undefined });

  useEffect(() => {
    setState({ url: undefined, error: undefined });
    if (!src) return;
    let cancelled = false;
    resolveDisplayUrl(src).then(
      (url) => {
        if (!cancelled) setState({ url, error: undefined });
      },
      (err) => {
        if (!cancelled) setState({ url: undefined, error: err instanceof Error ? err.message : String(err) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  return state;
}
