import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { getRedirectError, msalInstance } from "./msalInstance";
import { consumeStashedPath, stashCurrentPath } from "./postLoginRedirect";
import { getPendingForUser, retryItem } from "../services/syncQueue";

const ATTEMPTED_KEY = "customForms.authRedirectAttempted";

/** Module-level (not per-mount) so a stuck response is only retried once per
 *  browser session even though AuthGate remounts on every route change —
 *  this is the "silent self-retry on load (Phase 3)" getPendingForUser's own
 *  doc comment describes, which was written but never actually wired up
 *  anywhere. Without this, a response that failed to write to Excel (a
 *  transient Graph throttle, a network blip) stayed stuck as "failed" in
 *  SyncQueue indefinitely — the only way it ever got retried was an admin
 *  noticing it on the Sync Health page and clicking Retry by hand. */
const syncRetriedForEmail = new Set<string>();

/** A workbook left open in someone's Excel Desktop/Online session indefinitely
 *  would otherwise make this fire a fresh retry (a full-table scan plus a
 *  write attempt) on every single page load forever for the affected user,
 *  since retryItem's own failure is now recorded as a real attempt (see its
 *  doc comment) but nothing previously stopped this function from trying
 *  again next load regardless of how many times it had already failed. Once
 *  an item has failed this many times, leave it for an admin to retry by
 *  hand on the Sync Health page instead of silently hammering Graph for it
 *  on every sign-in. */
const MAX_SILENT_RETRY_ATTEMPTS = 8;

async function retryPendingSyncSilently(email: string): Promise<void> {
  if (syncRetriedForEmail.has(email)) return;
  syncRetriedForEmail.add(email);
  try {
    const pending = await getPendingForUser(email);
    for (const item of pending) {
      if (item.fields.Attempts >= MAX_SILENT_RETRY_ATTEMPTS) continue;
      try {
        await retryItem(item);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[sync] Auto-retry failed for response ${item.fields.ResponseId}:`, err);
      }
    }
  } catch (err) {
    // Best-effort — never block/interrupt sign-in over this.
    // eslint-disable-next-line no-console
    console.warn("[sync] Could not check for pending sync items:", err);
  }
}

/**
 * Route guard: requires a signed-in @<allowed-domain> account.
 *  - Not signed in, first attempt this session -> triggers login redirect once.
 *  - Not signed in, already attempted           -> shows an error instead of
 *                                                   silently retrying forever
 *                                                   (this used to loop —
 *                                                   see msalInstance.ts).
 *  - Signed in, wrong domain                     -> blocked with an explicit
 *                                                   message (defense-in-depth
 *                                                   alongside restricting the
 *                                                   Enterprise Application's
 *                                                   assignment to a security
 *                                                   group in Azure).
 *  - Signed in, allowed domain                   -> renders children.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAllowedDomain, email, login, logout } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(ATTEMPTED_KEY);
      if (email && isAllowedDomain) void retryPendingSyncSilently(email);
      // Returning from an interactive login that stashed a deep link (e.g. a
      // shared form link opened signed-out) — send them back there instead
      // of wherever the redirect happened to land (see postLoginRedirect.ts
      // for why MSAL's round trip doesn't preserve this on its own).
      const stashed = consumeStashedPath();
      if (stashed && stashed !== window.location.hash.slice(1)) {
        navigate(stashed, { replace: true });
      }
      return;
    }

    // useIsAuthenticated() can report false for a single render even after
    // MSAL's own instance already has an active account set — confirmed via
    // a real repro: the account was already active internally the moment
    // this effect first ran, but the hook hadn't caught up yet. Trusting the
    // hook alone here fired an unnecessary second loginRedirect() right on
    // top of a login that had already succeeded, which is what caused the
    // visible "back and forth" (Microsoft's silent SSO still round-trips the
    // browser even when it doesn't show a prompt). Check the instance
    // directly as a fallback and skip re-triggering login if it already has
    // an account — the next render will have isAuthenticated: true.
    if (msalInstance.getActiveAccount()) {
      return;
    }

    const redirectError = getRedirectError();
    if (redirectError) {
      setAuthError(redirectError.message);
      return;
    }

    if (sessionStorage.getItem(ATTEMPTED_KEY) === "1") {
      // We already tried once this session and came back still unauthenticated,
      // with no specific MSAL error caught — auto-retrying would just loop.
      setAuthError("Sign-in didn't complete. This can happen if the sign-in was cancelled or timed out.");
      return;
    }

    // stashCurrentPath()'s own doc comment explains why this is needed —
    // without it, a deep link opened signed-out (a builder/admin link, not
    // just the /f/:slug share-link routes that already had this) silently
    // drops the user at the dashboard after they sign back in, since MSAL's
    // redirect round trip doesn't preserve the HashRouter route on its own.
    stashCurrentPath();
    sessionStorage.setItem(ATTEMPTED_KEY, "1");
    login();
  }, [isAuthenticated, email, isAllowedDomain, login, navigate]);

  function retry() {
    sessionStorage.removeItem(ATTEMPTED_KEY);
    setAuthError(null);
    login();
  }

  if (authError) {
    return (
      <div className="page page--centered">
        <h1>Sign-in problem</h1>
        <p className="error-text">{authError}</p>
        <button className="btn-primary" onClick={retry}>
          Try signing in again
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <p>Redirecting to sign-in…</p>;
  }

  if (!isAllowedDomain) {
    return (
      <div className="page page--centered" role="alert">
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
