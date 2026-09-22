import { sanitizeHtml } from "../../lib/sanitizeHtml";

interface Props {
  html: string;
  className?: string;
}

/** Renders sanitized rich text (form/section descriptions) — sanitizes
 *  again on every render (not just at save time), so a value that somehow
 *  entered storage some other way (hand-edited in SharePoint, an older
 *  plain-text value, ...) is always safe to render as-is. Plain text with
 *  no markup renders correctly too, so this is backward compatible with
 *  every description written before rich text existed. */
export function RichText({ html, className }: Props) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
