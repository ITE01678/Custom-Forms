import { graphFetch } from "./graphClient";
import { graphScopes } from "../auth/msalConfig";

/** Fields pulled for both "my profile" (graph-autofill) and looking up a
 *  colleague (e.g. for connector fields that key off department/manager). */
export interface EntraProfile {
  id: string;
  mail: string | null;
  userPrincipalName: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  department: string | null;
  jobTitle: string | null;
  employeeId: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
  city: string | null;
  country: string | null;
  postalCode: string | null;
  streetAddress: string | null;
  companyName: string | null;
  preferredLanguage: string | null;
  usageLocation: string | null;
}

const PROFILE_SELECT = [
  "id",
  "mail",
  "userPrincipalName",
  "displayName",
  "givenName",
  "surname",
  "department",
  "jobTitle",
  "employeeId",
  "officeLocation",
  "mobilePhone",
  "businessPhones",
  "city",
  "country",
  "postalCode",
  "streetAddress",
  "companyName",
  "preferredLanguage",
  "usageLocation",
].join(",");

/** The signed-in user's own profile — only needs the base User.Read scope. */
export function getMyProfile(): Promise<EntraProfile> {
  return graphFetch<EntraProfile>(`/me?$select=${PROFILE_SELECT}`, {
    scopes: graphScopes.userRead,
  });
}

/** A colleague's profile by email/UPN — needs the (admin-consented) User.Read.All scope. */
export function getUserProfile(email: string): Promise<EntraProfile> {
  return graphFetch<EntraProfile>(`/users/${encodeURIComponent(email)}?$select=${PROFILE_SELECT}`, {
    scopes: graphScopes.userReadAll,
  });
}

/** Type-ahead directory search for people pickers (Access control, Manage
 *  roles) — matches on display name OR mail prefix. $search (not $filter)
 *  requires the ConsistencyLevel: eventual header on /users; same
 *  User.Read.All scope already used for every other colleague lookup here. */
export function searchUsers(query: string): Promise<EntraProfile[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return Promise.resolve([]);
  // $search string literals don't allow an unescaped double-quote; a
  // uuid-like paste or similar edge case shouldn't break the request.
  const escaped = trimmed.replace(/"/g, '\\"');
  // $orderby isn't reliably combinable with $search on /users — left out
  // deliberately rather than risk a 400; 8 results need no server sort.
  return graphFetch<{ value: EntraProfile[] }>(
    `/users?$search="displayName:${escaped}" OR "mail:${escaped}"&$select=${PROFILE_SELECT}&$top=8`,
    { scopes: graphScopes.userReadAll, headers: { ConsistencyLevel: "eventual" } }
  ).then((r) => r.value);
}

export function getManager(email: string): Promise<EntraProfile> {
  return graphFetch<EntraProfile>(
    `/users/${encodeURIComponent(email)}/manager?$select=${PROFILE_SELECT}`,
    { scopes: graphScopes.userReadAll }
  );
}

export function getDirectReports(email: string): Promise<EntraProfile[]> {
  return graphFetch<{ value: EntraProfile[] }>(
    `/users/${encodeURIComponent(email)}/directReports?$select=${PROFILE_SELECT}`,
    { scopes: graphScopes.userReadAll }
  ).then((r) => r.value);
}
