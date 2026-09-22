/**
 * Minimal allowlist-based HTML sanitizer for rich text produced by our own
 * RichTextEditor (form/section descriptions) — walks a parsed DOM tree (not
 * a regex) and keeps only safe tags/attributes, dropping everything else
 * (scripts, event handlers, iframes, links, arbitrary attributes/styles).
 * No external dependency needed for this narrow a use case: it only ever
 * needs to round-trip our own toolbar's output, not arbitrary user-pasted
 * HTML from the web. Used both when saving (defense) and again on every
 * render (defense in depth, in case a value ever entered storage some
 * other way — e.g. hand-edited in SharePoint).
 */

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "MARK", "UL", "OL", "LI", "BR", "P", "SPAN", "DIV"]);
const ALLOWED_STYLE_PROPS = new Set(["color", "background-color", "text-align", "font-family"]);
// Deliberately restrictive: blocks url(), javascript:, quotes, parens —
// anything beyond a plain color/keyword/font-name value.
const SAFE_STYLE_VALUE = /^[a-zA-Z0-9#,\-\s]+$/;

export function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeChildren(template.content);
  return template.innerHTML;
}

function sanitizeChildren(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toUnwrap: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (!ALLOWED_TAGS.has(node.tagName)) {
      toUnwrap.push(node);
    } else {
      sanitizeAttributes(node);
    }
    node = walker.nextNode() as Element | null;
  }
  // Unwrap disallowed elements (keep their text/children, drop the tag
  // itself) — reverse order so nested disallowed tags don't get orphaned
  // mid-removal.
  for (let i = toUnwrap.length - 1; i >= 0; i--) {
    const el = toUnwrap[i];
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

function sanitizeAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "style") {
      el.setAttribute("style", sanitizeStyle(attr.value));
    } else {
      el.removeAttribute(attr.name);
    }
  }
}

function sanitizeStyle(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [rawProp, rawValue] = decl.split(":");
      if (!rawProp || !rawValue) return false;
      const prop = rawProp.trim().toLowerCase();
      const value = rawValue.trim();
      return ALLOWED_STYLE_PROPS.has(prop) && SAFE_STYLE_VALUE.test(value);
    })
    .join("; ");
}
