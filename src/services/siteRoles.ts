import { createListItem, deleteListItem, odataQuote, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIST_NAMES } from "./bootstrap";
import type { AppRoleOverride, SiteRole } from "../formsSchema/types";

/**
 * Site-wide role resolution — the AppRoles SharePoint List is the SOLE
 * source of truth. Absence of a row for an email means "member" (the
 * fail-safe default — never locks out someone who could already use the
 * app before this feature existed).
 *
 * This was originally meant to be a hybrid with native SharePoint
 * Owners/Members group membership as the default, read via SharePoint's
 * classic REST API (_api/web/...). That half was ripped out after
 * confirming in production that it doesn't work: SharePoint's classic REST
 * surface isn't built for cross-origin bearer-token calls from an external
 * static site the way Microsoft Graph is — a real call from
 * form.jil-jupiter.com got back an HTML page (apparently a login redirect)
 * instead of JSON, confirmed by the exact browser error ("JSON.parse:
 * unexpected character..."), not a CORS failure the browser would have
 * reported explicitly. There's no backend here to proxy that call through,
 * so the classic REST API is simply not reachable from this app — see the
 * removed services/spRestClient.ts (deleted alongside this rewrite) and
 * SETUP.md's "Role model" section for the full story.
 *
 * Practical consequence: there's no automatic signal for "who's a Site
 * Owner" anymore — the FIRST owner has to be seeded by hand, once, by
 * adding a row directly to the AppRoles SharePoint list (Site Contents →
 * AppRoles → New item: Email/Role/SetBy/SetAt) since nobody can reach the
 * in-app Manage Roles page (gated on already being an Owner) before that
 * row exists. Every owner after the first can be added normally, from
 * Manage Roles.
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
  try {
    const override = await getAppRoleOverride(email);
    if (override) return override.role;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[siteRoles] AppRoles lookup failed — defaulting to Member", err);
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
