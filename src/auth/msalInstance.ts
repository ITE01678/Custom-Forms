import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

// MSAL v3 requires explicit initialization before use.
export const msalInitPromise = msalInstance.initialize().then(() => {
  // Pick up the account from any redirect-based login that just completed.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }
  return msalInstance.handleRedirectPromise().then((result) => {
    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
    }
  });
});
