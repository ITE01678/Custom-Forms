import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { useSiteCapabilities } from "../../auth/CapabilityProvider";
import { createForm } from "../../services/forms";
import { Icon, type IconName } from "../common/Icon";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  allowed: boolean;
  /** Shown as a tooltip on the disabled (greyed-out) version — explains WHY
   *  it's locked rather than just hiding it, a smoother experience than an
   *  item that silently disappears depending on who's signed in. */
  requirement?: string;
}

/**
 * Persistent left-hand site navigation — every destination a signed-in user
 * can reach, gated by their resolved capabilities (formsSchema/capabilities.ts)
 * so a Member never sees a link to a page they'd just get bounced from.
 * Desktop-only by design (hidden under the existing 720px breakpoint) —
 * narrow screens fall back to the topbar's icon shortcuts for the same
 * destinations, same pattern most admin dashboards use rather than adding a
 * hamburger-toggle mechanism.
 */
export function Sidebar() {
  const { email, displayName } = useAuth();
  const { capabilities } = useSiteCapabilities();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!email || creating) return;
    setCreating(true);
    try {
      const stored = await createForm("Untitled form", { upn: email, displayName: displayName ?? undefined });
      navigate(`/builder/${stored.form.id}`);
    } catch {
      // Best-effort from the sidebar — Dashboard's own "+ Create a form"
      // button shows a proper inline error if this is a recurring problem;
      // this shortcut just silently no-ops rather than taking over the
      // whole sidebar with an error state.
    } finally {
      setCreating(false);
    }
  }

  const items: NavItem[] = [
    { to: "/", label: "Dashboard", icon: "home", allowed: true },
    {
      to: "/admin/connectors",
      label: "Data connectors",
      icon: "plug",
      allowed: capabilities.canManageConnectors,
      requirement: "Owner access required",
    },
    {
      to: "/admin/sync-health",
      label: "Sync health",
      icon: "pulse",
      allowed: capabilities.canViewTenantSyncHealth,
      requirement: "Owner access required",
    },
    { to: "/my-responses", label: "My responses", icon: "folder", allowed: true },
    {
      to: "/admin/roles",
      label: "Manage roles",
      icon: "lock",
      allowed: capabilities.canManageRoles,
      requirement: "Owner access required",
    },
  ];

  return (
    <nav className="app-sidebar" aria-label="Site navigation">
      <button
        className="app-sidebar__create"
        onClick={handleCreate}
        disabled={creating || !capabilities.canCreateForms}
        title={!capabilities.canCreateForms ? "Admin or Owner access required" : undefined}
      >
        <Icon name="plus" size={16} />
        {creating ? "Creating…" : "Create a form"}
      </button>

      <div className="app-sidebar__nav">
        {items.map((item) =>
          item.allowed ? (
            <Link
              key={item.to}
              to={item.to}
              className={`app-sidebar__link ${location.pathname === item.to ? "is-active" : ""}`}
            >
              <span className="app-sidebar__icon">
                <Icon name={item.icon} size={17} />
              </span>
              {item.label}
            </Link>
          ) : (
            <span key={item.to} className="app-sidebar__link is-disabled" title={item.requirement}>
              <span className="app-sidebar__icon">
                <Icon name={item.icon} size={17} />
              </span>
              {item.label}
              <span className="app-sidebar__lock">
                <Icon name="lock" size={13} />
              </span>
            </span>
          )
        )}
      </div>

      <div className="app-sidebar__footer">
        <span className="app-sidebar__role-pill">{capabilities.role}</span>
      </div>
    </nav>
  );
}
