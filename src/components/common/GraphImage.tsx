import { useResolvedImageUrl } from "../../hooks/useResolvedImageUrl";

interface Props {
  src: string | undefined;
  alt: string;
  className?: string;
}

/** Drop-in replacement for <img> wherever the src might be a SharePoint
 *  upload reference (graph-image://…) instead of a plain external URL —
 *  see lib/graphImageRef.ts for why plain SharePoint webUrls don't render
 *  directly. Renders nothing until resolved; on failure shows a visible
 *  error instead of silently staying blank forever, since a stuck-blank
 *  image and a still-loading one are otherwise indistinguishable. */
export function GraphImage({ src, alt, className }: Props) {
  const { url, error } = useResolvedImageUrl(src);
  if (error) return <span className="graph-image-error" title={error}>⚠ Couldn't load image</span>;
  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
