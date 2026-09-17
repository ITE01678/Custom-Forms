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
  }
});
