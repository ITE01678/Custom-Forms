import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

// Temporary diagnostic logging — every MSAL lifecycle event, timestamped, so
// a real repro can be read back as an exact sequence instead of guessed at.
// Remove once the redirect-loop issue is confirmed fixed.
msalInstance.addEventCallback((message) => {
  // eventType is already a readable string, e.g. "msal:loginSuccess".
  // eslint-disable-next-line no-console
  console.info(`[auth-debug] event ${message.eventType}`, {
    error: message.error ?? null,
    accountUsername: (message.payload as { account?: { username?: string } })?.account?.username ?? null,
  });
});

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

// eslint-disable-next-line no-console
console.info("[auth-debug] boot", {
  url: window.location.href,
  hasCodeInQuery: window.location.search.includes("code="),
  hasCodeInHash: window.location.hash.includes("code="),
});

// MSAL v3 requires explicit initialization before use.
export const msalInitPromise = msalInstance.initialize().then(async () => {
  // Pick up the account from any redirect-based login that just completed.
  const accounts = msalInstance.getAllAccounts();
  // eslint-disable-next-line no-console
  console.info("[auth-debug] initialized", { existingAccountCount: accounts.length });
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }
  try {
    const result = await msalInstance.handleRedirectPromise();
    // eslint-disable-next-line no-console
    console.info("[auth-debug] handleRedirectPromise resolved", {
      hadResult: !!result,
      account: result?.account?.username ?? null,
    });
    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
    }
  } catch (err) {
    redirectError = err instanceof Error ? err : new Error(String(err));
    // eslint-disable-next-line no-console
    console.info("[auth-debug] handleRedirectPromise threw", redirectError);
  } finally {
    stripAuthResponseFromQuery();
    // eslint-disable-next-line no-console
    console.info("[auth-debug] init complete", {
      activeAccount: msalInstance.getActiveAccount()?.username ?? null,
      allAccounts: msalInstance.getAllAccounts().map((a) => a.username),
    });
  }
});
