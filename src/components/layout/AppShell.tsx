import type { ReactNode } from "react";
import { AppTopbar } from "./AppTopbar";
import { Sidebar } from "./Sidebar";

interface Props {
  backTo?: { to: string; label: string };
  children: ReactNode;
}

/**
 * The shared chrome for every signed-in "manage" page (Dashboard, Builder,
 * admin pages, My responses) — topbar across the full width, a persistent
 * left nav below it, and the page's own content to the right. NOT used by
 * the live fill-out runtime (/f/:slug and friends) — those stay a
 * distraction-free, per-form-branded experience, unrelated to this app's
 * own navigation chrome.
 */
export function AppShell({ backTo, children }: Props) {
  return (
    <div className="app-shell">
      <AppTopbar backTo={backTo} />
      <div className="app-shell__body">
        <Sidebar />
        <div className="app-shell__main">{children}</div>
      </div>
    </div>
  );
}
