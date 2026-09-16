import { getMyProfile, type EntraProfile } from "./users";

let cached: Promise<EntraProfile> | null = null;

/** Memoizes the signed-in user's own Graph profile for the lifetime of the
 *  page — multiple graph-autofill fields on one form would otherwise each
 *  fire their own /me request. */
export function getMyProfileCached(): Promise<EntraProfile> {
  cached ??= getMyProfile();
  return cached;
}
