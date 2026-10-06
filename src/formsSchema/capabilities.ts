import type { FormCollaborator, SiteRole } from "./types";

/**
 * Centralized capability resolution — pure, no I/O, same convention as
 * routingAccess.ts. Every route guard and page should read from here rather
 * than re-deriving its own ad-hoc check, so "who can do what" stays defined
 * in exactly one place.
 *
 * Two layers, composed deliberately simply:
 *  - SiteCapabilities: what a user's site-wide role (owner/admin/member)
 *    grants them everywhere, independent of any one form.
 *  - FormCapabilities: what a specific user can do to a specific form —
 *    Site Owner bypasses everything; the form's own `owner` gets full
 *    rights; otherwise a matching FormCollaborator grant's flags apply;
 *    otherwise nothing.
 */

export interface SiteCapabilities {
  role: SiteRole;
  isSiteOwner: boolean;
  /** Owner or Admin. */
  canCreateForms: boolean;
  /** Owner only — assign/override anyone's site role. */
  canManageRoles: boolean;
  /** Owner only — ConnectorConfigs can hold connection secrets (e.g. a Power
   *  Automate flow URL); see ConnectorsPage's own doc comment. */
  canManageConnectors: boolean;
  /** Owner only — the tenant-wide (no ?formId=) Sync Health view includes
   *  every form's SubmitterEmail + full answer payload. */
  canViewTenantSyncHealth: boolean;
}

export function resolveSiteCapabilities(role: SiteRole): SiteCapabilities {
  const isSiteOwner = role === "owner";
  return {
    role,
    isSiteOwner,
    canCreateForms: isSiteOwner || role === "admin",
    canManageRoles: isSiteOwner,
    canManageConnectors: isSiteOwner,
    canViewTenantSyncHealth: isSiteOwner,
  };
}

export interface FormCapabilities {
  /** Can open this form at all (builder, in read-only form if !canEditForm;
   *  or the responses grid, if !canViewResponses but this is still true via
   *  some other grant — in practice canView is implied by having ANY grant). */
  canView: boolean;
  canEditForm: boolean;
  canViewResponses: boolean;
  canManageResponses: boolean; // edit/delete others' responses, retry this form's sync issues
  canManageAccess: boolean; // add/remove other collaborators
  /** Site owner or the form's actual `owner` ONLY — never a collaborator,
   *  even a "co-owner" grant. Deleting a form is irreversible (workbook,
   *  snapshots, sync queue entries all go with it) and reassigning `owner`
   *  isn't a feature this app has, so this stays deliberately narrower than
   *  every other flag here. */
  canDeleteForm: boolean;
  canArchiveForm: boolean;
}

const FULL_FORM_CAPABILITIES: FormCapabilities = {
  canView: true,
  canEditForm: true,
  canViewResponses: true,
  canManageResponses: true,
  canManageAccess: true,
  canDeleteForm: true,
  canArchiveForm: true,
};

const NO_FORM_CAPABILITIES: FormCapabilities = {
  canView: false,
  canEditForm: false,
  canViewResponses: false,
  canManageResponses: false,
  canManageAccess: false,
  canDeleteForm: false,
  canArchiveForm: false,
};

export function resolveFormCapabilities(params: {
  site: SiteCapabilities;
  email: string;
  ownerUpn: string;
  collaborators: FormCollaborator[];
}): FormCapabilities {
  const { site, email, ownerUpn, collaborators } = params;
  const lowerEmail = email.toLowerCase();

  if (site.isSiteOwner) return FULL_FORM_CAPABILITIES;
  if (ownerUpn.toLowerCase() === lowerEmail) return FULL_FORM_CAPABILITIES;

  const collab = collaborators.find((c) => c.email.toLowerCase() === lowerEmail);
  if (!collab) return NO_FORM_CAPABILITIES;

  return {
    canView: true,
    canEditForm: collab.canEditForm,
    canViewResponses: collab.canViewResponses,
    canManageResponses: collab.canManageResponses,
    canManageAccess: collab.canManageAccess,
    canDeleteForm: false,
    canArchiveForm: collab.canEditForm,
  };
}

/** Named role-bundle presets the Access Control panel offers — kept here
 *  (not persisted) so changing a bundle's definition later doesn't need a
 *  data migration; a stored row just remembers which bundle produced it. */
export const ROLE_BUNDLE_PRESETS: Record<
  Exclude<FormCollaborator["roleBundle"], "custom">,
  Pick<FormCollaborator, "canEditForm" | "canViewResponses" | "canManageResponses" | "canManageAccess">
> = {
  "co-owner": { canEditForm: true, canViewResponses: true, canManageResponses: true, canManageAccess: true },
  editor: { canEditForm: true, canViewResponses: true, canManageResponses: false, canManageAccess: false },
  viewer: { canEditForm: false, canViewResponses: true, canManageResponses: false, canManageAccess: false },
};
