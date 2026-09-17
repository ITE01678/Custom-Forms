import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

/**
 * Azure AD (Entra ID) app registration details.
 *
 * These come from a DEDICATED, standalone App Registration created for this
 * project (public client / SPA platform) — see /SETUP.md for exact steps.
 * Do not point this at the Employee Portal's or opsquest's registrations.
 */
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string | undefined;
const redirectUri =
  (import.meta.env.VITE_REDIRECT_URI as string | undefined) ?? window.location.origin;

if (!clientId || !tenantId) {
  // Don't throw at import time in dev — surface a clear console warning instead,
  // so the rest of the app (routing, non-auth pages) can still be worked on
  // before the Azure App Registration exists yet.
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID are not set. " +
      "Copy .env.local.example to .env.local and fill in the App Registration " +
      "created per SETUP.md before sign-in will work."
  );
}

export const ALLOWED_DOMAIN =
  (import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined) ?? "jil-jupiter.com";

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? "",
    authority: `https://login.microsoftonline.com/${tenantId ?? "common"}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    // This app uses HashRouter (client-side routes live in the URL hash:
    // #/builder/..., #/f/...). MSAL's default redirect response mode also
    // uses the URL hash (#code=...&state=...) for the response Azure AD sends
    // back, which collides with HashRouter's own use of the hash for routing.
    // This is the ONLY place that actually controls it — MSAL-browser's
    // RedirectRequest type deliberately omits a per-request `responseMode`
    // (verified in node_modules/@azure/msal-browser/types/request/RedirectRequest.d.ts),
    // so setting it on loginRequest instead (an earlier attempt at this fix)
    // silently did nothing. This config field is what both (a) tells Azure AD
    // to send the response as ?code=... instead of #code=..., and (b) tells
    // handleRedirectPromise() to read it back from location.search instead of
    // location.hash. Both sides have to agree, and this is the only knob that
    // affects both.
    OIDCOptions: { responseMode: "query" },
  },
  cache: {
    // localStorage (not sessionStorage) so a refresh/new tab doesn't force re-login.
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) {
          // eslint-disable-next-line no-console
          console.error("[msal]", message);
        }
      },
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
    },
  },
};

/**
 * Delegated scopes this app needs:
 *  - openid profile email User.Read  -> sign-in + the caller's own profile
 *  - User.Read.All                   -> read colleagues' department/employeeId/
 *                                        manager/directReports for autofill &
 *                                        connector fields (needs one-time admin
 *                                        consent — see SETUP.md)
 *  - Sites.ReadWrite.All              -> read/write the "Forms" SharePoint site's
 *                                        Lists, libraries, and Excel workbooks.
 *                                        A Graph *scope* is required on the token
 *                                        regardless of the user's underlying
 *                                        SharePoint permissions — the scope and
 *                                        the site ACL are two independent checks.
 *                                        This is a high-privilege delegated
 *                                        permission and needs one-time admin
 *                                        consent (see SETUP.md).
 */
export const loginRequest = {
  scopes: ["openid", "profile", "email", "User.Read", "User.Read.All", "Sites.ReadWrite.All"],
  // NOTE: responseMode is intentionally NOT set here — see msalConfig.auth.OIDCOptions
  // above. RedirectRequest's type omits a per-request responseMode field entirely,
  // so it has no effect here regardless of what's passed.
};

export const graphScopes = {
  userRead: ["User.Read"],
  userReadAll: ["User.Read.All"],
  sites: ["Sites.ReadWrite.All"],
};
