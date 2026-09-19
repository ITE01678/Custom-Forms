const KEY = "customForms.postLoginPath";

/**
 * Remembers the current route so the user can be returned to it after
 * signing in — call right before triggering an interactive login.
 *
 * MSAL's redirect round trip does NOT preserve HashRouter's route on its
 * own: the hash (e.g. "#/f/team-outing") is client-side-only, never sent to
 * Microsoft, and is gone by the time the browser navigates back to the bare
 * registered redirect URI. Without this, any deep link through an
 * auto-login (a shared form link especially, since the respondent has no
 * other way back to it) silently drops the user at the app root instead.
 */
export function stashCurrentPath(): void {
  const path = window.location.hash.slice(1); // "#/f/team-outing" -> "/f/team-outing"
  if (!path || path === "/" || path === "/login") return;
  sessionStorage.setItem(KEY, path);
}

/** Reads and clears the stashed path, if any — call once, right after
 *  confirming the user is authenticated. */
export function consumeStashedPath(): string | null {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path;
}
