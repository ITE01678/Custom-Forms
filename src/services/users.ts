import { graphFetch } from "./graphClient";
import { graphScopes } from "../auth/msalConfig";

/** Fields pulled for both "my profile" (graph-autofill) and looking up a
 *  colleague (e.g. for connector fields that key off department/manager). */
export interface EntraProfile {
  id: string;
  mail: string | null;
  userPrincipalName: string;
  displayName: string;
  department: string | null;
  jobTitle: string | null;
  employeeId: string | null;
  officeLocation: string | null;
}

const PROFILE_SELECT =
  "id,mail,userPrincipalName,displayName,department,jobTitle,employeeId,officeLocation";

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
