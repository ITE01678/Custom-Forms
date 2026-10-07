import type { ReactNode, SVGProps } from "react";

/**
 * A small, hand-drawn line-icon set — replaces the emoji used in the
 * sidebar/topbar/dashboard-card/page-header chrome built this session.
 * Deliberately NOT a new dependency (no icon library/font): each glyph is
 * plain inline SVG, kept geometrically simple (lines, circles, rects) for
 * a consistent, crisp look regardless of the viewer's OS emoji font —
 * which was the actual complaint (platform emoji render "cartoonish/
 * bulky" and inconsistently across OSes).
 *
 * Deliberately scoped to the chrome introduced this session, not a sweep
 * of every emoji in the app (RichTextEditor's toolbar, PreviewModal's
 * device toggle, the Login page's feature cards, etc. all predate this
 * change and are a separate, much larger undertaking).
 */
export type IconName =
  | "home"
  | "plus"
  | "plug"
  | "pulse"
  | "folder"
  | "lock"
  | "chart"
  | "document"
  | "palette"
  | "branch"
  | "link"
  | "settings"
  | "clipboard"
  | "check"
  | "edit";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  plug: (
    <>
      <path d="M9 2.5v4M15 2.5v4" />
      <path d="M7 6.5h10v3.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5V6.5Z" />
      <path d="M12 15v4.5M9 21.5h6" />
    </>
  ),
  pulse: <path d="M3 12h4l1.8-5 4 10L15 12h6" />,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7Z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 1 1 8 0V11" />
    </>
  ),
  chart: <path d="M4 20V11M10 20V4M16 20v-6M3 20h18" />,
  document: (
    <>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 8.9 10.4c.1-.9-.6-1.6-1.5-1.6h-1.6a2.3 2.3 0 0 1-2.3-2.3c0-.6.2-1.1.5-1.6.3-.4.5-.9.4-1.4C16.2 4.2 14.3 3 12 3Z" />
      <circle cx="7.8" cy="11" r="1.1" />
      <circle cx="9.8" cy="7.2" r="1.1" />
      <circle cx="14.6" cy="7.2" r="1.1" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 6.3h3.5A4.5 4.5 0 0 1 16 10.8V11M8 17.7h3.5A4.5 4.5 0 0 0 16 13.2V13" />
    </>
  ),
  link: (
    <>
      <rect x="3" y="9.5" width="9" height="5" rx="2.5" transform="rotate(-45 7.5 12)" />
      <rect x="12" y="9.5" width="9" height="5" rx="2.5" transform="rotate(-45 16.5 12)" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M4.2 12H1.8M22.2 12h-2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
      <path d="M9 11.5h6M9 15.5h6" />
    </>
  ),
  check: <path d="M4 12.5 9 17.5 20 6" />,
  edit: (
    <>
      <path d="M4 20 5 16 16 5l3 3L8 19l-4 1Z" />
      <path d="M14 7l3 3" />
    </>
  ),
};

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
