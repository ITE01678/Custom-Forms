import { useResolvedImageUrl } from "../../hooks/useResolvedImageUrl";

interface Props {
  src: string | undefined;
  alt: string;
  className?: string;
}

/** Drop-in replacement for <img> wherever the src might be a SharePoint
 *  upload reference (graph-image://…) instead of a plain external URL —
 *  see lib/graphImageRef.ts for why plain SharePoint webUrls don't render
 *  directly. Renders nothing until resolved, rather than a broken-image icon. */
export function GraphImage({ src, alt, className }: Props) {
  const resolvedSrc = useResolvedImageUrl(src);
  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} className={className} />;
}
