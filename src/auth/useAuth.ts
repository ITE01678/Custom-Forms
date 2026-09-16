import { useCallback, useMemo } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest, ALLOWED_DOMAIN } from "./msalConfig";

export interface AuthState {
  isAuthenticated: boolean;
  /** Lowercased UPN — the one identity value used as the primary key everywhere downstream. */
  email: string | null;
  displayName: string | null;
  /** False if signed in but with an account outside the allowed org domain. */
  isAllowedDomain: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Acquire a delegated access token for the given scopes, prompting interactively if needed. */
  acquireToken: (scopes: string[]) => Promise<string>;
}

export function useAuth(): AuthState {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0] ?? null;

  const email = useMemo(() => {
    const upn = account?.username ?? null;
    return upn ? upn.toLowerCase() : null;
  }, [account]);

  const isAllowedDomain = useMemo(
    () => !!email && email.endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`),
    [email]
  );

  const login = useCallback(async () => {
    await instance.loginRedirect(loginRequest);
  }, [instance]);

  const logout = useCallback(async () => {
    await instance.logoutRedirect();
  }, [instance]);

  const acquireToken = useCallback(
    async (scopes: string[]): Promise<string> => {
      if (!account) throw new Error("No signed-in account — call login() first.");
      try {
        const result = await instance.acquireTokenSilent({ scopes, account });
        return result.accessToken;
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          // Silent refresh failed (expired session, revoked consent, new scope
          // needing interactive consent, etc.) — fall back to a redirect.
          await instance.acquireTokenRedirect({ scopes, account });
          // acquireTokenRedirect navigates away; this line is unreachable in practice.
          throw err;
        }
        throw err;
      }
    },
    [instance, account]
  );

  return { isAuthenticated, email, displayName: account?.name ?? null, isAllowedDomain, login, logout, acquireToken };
}
