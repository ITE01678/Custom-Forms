import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";

interface Props {
  /** Optional breadcrumb back-link shown next to the brand, e.g. "← My forms". */
  backTo?: { to: string; label: string };
}

/** Shared top bar for every signed-in page (Dashboard, Builder, admin pages) —
 *  brand + optional back-link on the left, identity + sign-out on the right. */
export function AppTopbar({ backTo }: Props) {
  const { email, displayName, logout } = useAuth();

  return (
    <header className="app-topbar">
      <div className="app-topbar__left">
        <Link to="/" className="app-topbar__brand">
          Custom Forms
        </Link>
        {backTo && (
          <Link to={backTo.to} className="app-topbar__back">
            ← {backTo.label}
          </Link>
        )}
      </div>
      <div className="app-topbar__user">
        <span>{displayName ?? email}</span>
        <button onClick={() => logout()}>Sign out</button>
      </div>
    </header>
  );
}
