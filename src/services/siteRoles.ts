import { spRestFetch } from "./spRestClient";
import { createListItem, deleteListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIST_NAMES } from "./bootstrap";
import type { AppRoleOverride, SiteRole } from "../formsSchema/types";

/**
 * Site-wide role resolution — a HYBRID of real SharePoint group membership
 * (the base/default) and an app-managed override List (AppRoles, purely
 * additive). See SETUP.md for the role model write-up and the new SharePoint
 * REST permission this needs.
 *
 * Native SharePoint only has two relevant tiers out of the box — Owners and
 * Members — so "admin" can ONLY ever come from an AppRoles override, never
 * natively. Effective role = override if one exists for that email, else the
 * native-derived role, else "member" as a fail-safe default (never locks out
 * someone who could already use the app before this existed).
 */

export interface AppRoleFields {
  Title: string; // mirrors Email, for legibility in SharePoint's default view
  Email: string;
  Role: SiteRole;
  SetBy: string;
  SetAt: string;
  Note?: string;
}

function toOverride(fields: AppRoleFields): AppRoleOverride {
  return { email: fields.Email, role: fields.Role, setBy: fields.SetBy, setAt: fields.SetAt, note: fields.Note || undefined };
}

interface GroupIds {
  ownerGroupId: number;
  memberGroupId: number;
}

let cachedGroupIds: Promise<GroupIds> | null = null;
function getAssociatedGroupIds(): Promise<GroupIds> {
  cachedGroupIds ??= (async () => {
    const [owner, member] = await Promise.all([
      spRestFetch<{ Id: number }>("/web/associatedownergroup?$select=Id"),
      spRestFetch<{ Id: number }>("/web/associatedmembergroup?$select=Id"),
    ]);
    return { ownerGroupId: owner.Id, memberGroupId: member.Id };
  })();
  return cachedGroupIds;
}

interface SpGroupRef {
  Id: number;
}

let cachedNativeRole: Promise<"owner" | "member" | null> | null = null;
/** "Me"-only — _api/web/currentuser is inherently the calling user; there's
 *  no equivalent here for resolving an ARBITRARY other user's native role
 *  without heavier site-admin permissions this app deliberately never
 *  acquires. Fine, since this only ever needs to answer "what can *I*, the
 *  signed-in caller, do." */
function resolveNativeSiteRole(): Promise<"owner" | "member" | null> {
  cachedNativeRole ??= (async () => {
    const [{ ownerGroupId, memberGroupId }, me] = await Promise.all([
      getAssociatedGroupIds(),
      spRestFetch<{ Groups: SpGroupRef[] }>("/web/currentuser?$expand=Groups&$select=Groups/Id"),
    ]);
    const ids = new Set(me.Groups.map((g) => g.Id));
    if (ids.has(ownerGroupId)) return "owner";
    if (ids.has(memberGroupId)) return "member";
    return null;
  })();
  return cachedNativeRole;
}

export async function getAppRoleOverride(email: string): Promise<AppRoleOverride | null> {
  await ensureFormsSiteStructure();
  const items = await queryListItems<AppRoleFields>(LIST_NAMES.appRoles, {
    filter: `fields/Email eq '${odataQuote(email.toLowerCase())}'`,
    top: 1,
  });
  return items[0] ? toOverride(items[0].fields) : null;
}

/** The one function everything else (CapabilityProvider) actually calls. */
export async function resolveEffectiveSiteRole(email: string): Promise<SiteRole> {
  const override = await getAppRoleOverride(email);
  if (override) return override.role;
  try {
    const native = await resolveNativeSiteRole();
    if (native) return native;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[siteRoles] SharePoint REST role check failed — defaulting to Member", err);
  }
  return "member";
}

export async function listAppRoleOverrides(): Promise<ListItem<AppRoleFields>[]> {
  await ensureFormsSiteStructure();
  return queryListItems<AppRoleFields>(LIST_NAMES.appRoles, {});
}

/** Adds or updates an override — upsert keyed on Email, same idiom as
 *  responseIndex.ts's upsertIndex, so re-setting an existing override edits
 *  it in place instead of creating an ambiguous duplicate row. */
export async function setAppRoleOverride(params: {
  email: string;
  role: SiteRole;
  setBy: string;
  note?: string;
}): Promise<void> {
  await ensureFormsSiteStructure();
  const email = params.email.toLowerCase();
  const existing = await queryListItems<AppRoleFields>(LIST_NAMES.appRoles, {
    filter: `fields/Email eq '${odataQuote(email)}'`,
    top: 1,
  });
  const fields: AppRoleFields = {
    Title: email,
    Email: email,
    Role: params.role,
    SetBy: params.setBy,
    SetAt: new Date().toISOString(),
    Note: params.note,
  };
  if (existing[0]) {
    await updateListItem<AppRoleFields>(LIST_NAMES.appRoles, existing[0].id, fields);
  } else {
    await createListItem<AppRoleFields>(LIST_NAMES.appRoles, fields);
  }
}

export async function removeAppRoleOverride(itemId: string): Promise<void> {
  await deleteListItem(LIST_NAMES.appRoles, itemId);
}

export interface NativeSiteMember {
  title: string;
  email: string;
}

/** Context-only listing for the Manage Roles page — unlike resolving an
 *  arbitrary OTHER user's native role (not exposed, see resolveNativeSiteRole
 *  above), a group's own roster IS safely enumerable, so this is fine to show
 *  a Site Owner deciding whether to add an override. */
export async function listNativeSiteGroups(): Promise<{ owners: NativeSiteMember[]; members: NativeSiteMember[] }> {
  const { ownerGroupId, memberGroupId } = await getAssociatedGroupIds();
  const [ownerUsers, memberUsers] = await Promise.all([
    spRestFetch<{ value: { Title: string; Email: string }[] }>(
      `/web/sitegroups/getbyid(${ownerGroupId})/users?$select=Title,Email`
    ),
    spRestFetch<{ value: { Title: string; Email: string }[] }>(
      `/web/sitegroups/getbyid(${memberGroupId})/users?$select=Title,Email`
    ),
  ]);
  return {
    owners: ownerUsers.value.map((u) => ({ title: u.Title, email: u.Email })),
    members: memberUsers.value.map((u) => ({ title: u.Title, email: u.Email })),
  };
}
