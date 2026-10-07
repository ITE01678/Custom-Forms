import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { useSiteCapabilities } from "../../auth/CapabilityProvider";
import { listAllForms } from "../../services/forms";
import { getUnresolved } from "../../services/syncQueue";
import { listAppRoleOverrides } from "../../services/siteRoles";
import { listConnectorConfigs } from "../../services/connectorConfigs";
import { getSiteStorageQuota } from "../../services/sites";
import { initialsOf } from "../../lib/initials";
import { Icon } from "../common/Icon";

interface SiteStats {
  totalForms: number;
  publishedForms: number;
  draftForms: number;
  archivedForms: number;
  connectors: number;
  pendingSync: number;
  roleOverrides: number;
  storageUsedBytes: number;
  storageTotalBytes: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Click-to-open profile panel — name/email/role for everyone, plus an
 *  "App & SharePoint report" for Owners AND Admins (form counts by status,
 *  connectors configured, responses pending sync, SharePoint storage used)
 *  — role overrides stay an Owner-only line within it, since that's the one
 *  piece that's specifically about managing OTHER people's access. Fetched
 *  lazily on first open, not eagerly on every page load. */
export function ProfileMenu() {
  const { email, displayName, logout } = useAuth();
  const { capabilities } = useSiteCapabilities();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const canSeeReport = capabilities.isSiteOwner || capabilities.role === "admin";

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open || !canSeeReport || stats || loadingStats) return;
    setLoadingStats(true);
    setStatsError(false);
    // Role overrides are Owner-specific context, so an Admin skips that one
    // call entirely rather than fetching something they won't be shown.
    Promise.all([
      listAllForms(),
      getUnresolved(),
      listConnectorConfigs(),
      getSiteStorageQuota(),
      capabilities.isSiteOwner ? listAppRoleOverrides() : Promise.resolve([]),
    ])
      .then(([forms, pending, connectors, quota, overrides]) => {
        setStats({
          totalForms: forms.length,
          publishedForms: forms.filter((f) => f.form.status === "published").length,
          draftForms: forms.filter((f) => f.form.status === "draft").length,
          archivedForms: forms.filter((f) => f.form.status === "archived").length,
          connectors: connectors.length,
          pendingSync: pending.length,
          roleOverrides: overrides.length,
          storageUsedBytes: quota.usedBytes,
          storageTotalBytes: quota.totalBytes,
        });
      })
      .catch(() => setStatsError(true))
      .finally(() => setLoadingStats(false));
  }, [open, canSeeReport, capabilities.isSiteOwner, stats, loadingStats]);

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

          {canSeeReport && (
            <div className="profile-menu__stats">
              <h4>App &amp; SharePoint report</h4>
              {loadingStats ? (
                <p>Loading…</p>
              ) : statsError ? (
                <p className="error-text">Couldn't load the site report.</p>
              ) : stats ? (
                <ul>
                  <li>
                    {stats.totalForms} form{stats.totalForms === 1 ? "" : "s"} total — {stats.publishedForms}{" "}
                    published, {stats.draftForms} draft, {stats.archivedForms} archived
                  </li>
                  <li>
                    {stats.connectors} data connector{stats.connectors === 1 ? "" : "s"} configured
                  </li>
                  <li>
                    {stats.pendingSync} response{stats.pendingSync === 1 ? "" : "s"} pending sync
                    {stats.pendingSync > 0 && <Icon name="warning" size={12} />}
                  </li>
                  <li>
                    SharePoint storage: {formatBytes(stats.storageUsedBytes)}
                    {stats.storageTotalBytes ? ` of ${formatBytes(stats.storageTotalBytes)} used` : " used"}
                  </li>
                  {capabilities.isSiteOwner && (
                    <li>
                      {stats.roleOverrides} role override{stats.roleOverrides === 1 ? "" : "s"} set
                    </li>
                  )}
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
