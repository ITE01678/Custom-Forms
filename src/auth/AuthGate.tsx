import { useEffect, type ReactNode } from "react";
import { useAuth } from "./useAuth";

/**
 * Route guard: requires a signed-in @<allowed-domain> account.
 *  - Not signed in                 -> triggers login redirect.
 *  - Signed in, wrong domain       -> blocked with an explicit message
 *                                      (defense-in-depth alongside restricting
 *                                      the Enterprise Application's assignment
 *                                      to an internal security group in Azure).
 *  - Signed in, allowed domain     -> renders children.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAllowedDomain, email, login, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      login();
    }
  }, [isAuthenticated, login]);

  if (!isAuthenticated) {
    return <p>Redirecting to sign-in…</p>;
  }

  if (!isAllowedDomain) {
    return (
      <div role="alert">
        <p>
          The account <strong>{email}</strong> is not part of this organization. Sign in
          with your official Microsoft 365 account to continue.
        </p>
        <button onClick={() => logout()}>Sign out</button>
      </div>
    );
  }

  return <>{children}</>;
}
