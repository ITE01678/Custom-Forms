import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

let redirectError: Error | null = null;

/** Any error thrown while processing the redirect-back response (e.g. an
 *  auth code that was already consumed, a state mismatch, etc.) — surfaced
 *  by AuthGate instead of being silently swallowed, which previously let the
 *  app fall through to "not authenticated" and auto-retry login forever. */
export function getRedirectError(): Error | null {
  return redirectError;
}

const AUTH_RESPONSE_PARAMS = ["code", "state", "session_state", "client_info", "error", "error_description"];

/**
 * MSAL's own post-redirect cleanup (clearHash) only strips the URL *hash* —
 * it was written assuming fragment-mode responses, where the whole response
 * lives in the hash. With responseMode "query" (see msalConfig.ts), the
 * response instead lands in the query string, which clearHash never touches,
 * so ?code=...&state=... is otherwise left sitting in the address bar even
 * after a fully successful login. Strip just those params ourselves,
 * preserving the hash (HashRouter's current route) and any unrelated query params.
 */
function stripAuthResponseFromQuery(): void {
  const params = new URLSearchParams(window.location.search);
  const hadAuthParams = AUTH_RESPONSE_PARAMS.some((key) => params.has(key));
  if (!hadAuthParams) return;

  AUTH_RESPONSE_PARAMS.forEach((key) => params.delete(key));
  const query = params.toString();
  const cleanUrl = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", cleanUrl);
}

// MSAL v3 requires explicit initialization before use.
export const msalInitPromise = msalInstance.initialize().then(async () => {
  // Pick up the account from any redirect-based login that just completed.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }
  try {
    const result = await msalInstance.handleRedirectPromise();
    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
    }
  } catch (err) {
    redirectError = err instanceof Error ? err : new Error(String(err));
    // Genuinely unexpected (auth code already consumed, state mismatch,
    // etc.) — also surfaced to the user via getRedirectError()/AuthGate,
    // but worth a console trace too since it's rare enough to want to see
    // exactly what MSAL reported.
    // eslint-disable-next-line no-console
    console.error("[auth] handleRedirectPromise failed", redirectError);
  } finally {
    stripAuthResponseFromQuery();
  }
});
