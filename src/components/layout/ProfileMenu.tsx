import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { useSiteCapabilities } from "../../auth/CapabilityProvider";
import { listAllForms } from "../../services/forms";
import { getUnresolved } from "../../services/syncQueue";
import { listAppRoleOverrides } from "../../services/siteRoles";
import { initialsOf } from "../../lib/initials";

interface SiteStats {
  totalForms: number;
  pendingSync: number;
  roleOverrides: number;
}

/** Click-to-open profile panel — name/email/role for everyone, plus a
 *  Site-Owner-only "site conditions" summary (total forms, responses
 *  pending sync, role overrides set) fetched lazily on first open, not
 *  eagerly on every page load. */
export function ProfileMenu() {
  const { email, displayName, logout } = useAuth();
  const { capabilities } = useSiteCapabilities();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open || !capabilities.isSiteOwner || stats || loadingStats) return;
    setLoadingStats(true);
    setStatsError(false);
    Promise.all([listAllForms(), getUnresolved(), listAppRoleOverrides()])
      .then(([forms, pending, overrides]) => {
        setStats({ totalForms: forms.length, pendingSync: pending.length, roleOverrides: overrides.length });
      })
      .catch(() => setStatsError(true))
      .finally(() => setLoadingStats(false));
  }, [open, capabilities.isSiteOwner, stats, loadingStats]);

  const name = displayName ?? email ?? "?";
  const initials = initialsOf(name) || "?";

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        type="button"
        className="icon-btn profile-menu__trigger"
        data-tooltip="Profile"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open && (
        <div className="profile-menu__panel" role="menu">
          <div className="profile-menu__header">
            <div className="profile-menu__avatar" aria-hidden="true">
              {initials}
            </div>
            <div>
              <div className="profile-menu__name">{name}</div>
              <div className="profile-menu__email">{email}</div>
            </div>
          </div>

          <div className="profile-menu__role">
            Role: <span className={`status-pill status-pill--${capabilities.role}`}>{capabilities.role}</span>
          </div>

          {capabilities.isSiteOwner && (
            <div className="profile-menu__stats">
              <h4>Site conditions</h4>
              {loadingStats ? (
                <p>Loading…</p>
              ) : statsError ? (
                <p className="error-text">Couldn't load site stats.</p>
              ) : stats ? (
                <ul>
                  <li>{stats.totalForms} form{stats.totalForms === 1 ? "" : "s"} total</li>
                  <li>{stats.pendingSync} response{stats.pendingSync === 1 ? "" : "s"} pending sync</li>
                  <li>{stats.roleOverrides} role override{stats.roleOverrides === 1 ? "" : "s"} set</li>
                </ul>
              ) : null}
            </div>
          )}

          <button className="profile-menu__signout" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
