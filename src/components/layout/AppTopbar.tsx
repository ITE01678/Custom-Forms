import { Link } from "react-router-dom";
import { useSiteCapabilities } from "../../auth/CapabilityProvider";
import { ProfileMenu } from "./ProfileMenu";

interface Props {
  /** Optional breadcrumb back-link shown next to the brand, e.g. "← My forms". */
  backTo?: { to: string; label: string };
}

/** Shared top bar for every signed-in page — brand/logo (click navigates
 *  home) + optional back-link on the left, icon shortcuts + profile on the
 *  right. The same destinations also live in the full-text Sidebar; these
 *  are quick-access icons with a hover tooltip, not a replacement for it. */
export function AppTopbar({ backTo }: Props) {
  const { capabilities } = useSiteCapabilities();

  return (
    <header className="app-topbar">
      <div className="app-topbar__left">
        <Link to="/" className="app-topbar__brand">
          <img src={`${import.meta.env.BASE_URL}jupiter-logo.png`} alt="Jupiter" className="app-topbar__logo" />
          <span>Custom Forms</span>
        </Link>
        {backTo && (
          <Link to={backTo.to} className="app-topbar__back">
            ← {backTo.label}
          </Link>
        )}
      </div>
      <div className="app-topbar__user">
        <Link to="/my-responses" className="icon-btn" data-tooltip="My responses">
          🗂️
        </Link>
        {capabilities.canManageRoles ? (
          <Link to="/admin/roles" className="icon-btn" data-tooltip="Manage roles">
            🔐
          </Link>
        ) : (
          <span className="icon-btn is-disabled" data-tooltip="Manage roles — Owner access required">
            🔐
          </span>
        )}
        <ProfileMenu />
      </div>
    </header>
  );
}
