import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./useAuth";
import { resolveEffectiveSiteRole } from "../services/siteRoles";
import { resolveSiteCapabilities, type SiteCapabilities } from "../formsSchema/capabilities";
import type { SiteRole } from "../formsSchema/types";

interface CapabilityContextValue {
  /** True until the first role resolution for the current account completes.
   *  Callers that gate an action (not just visibility) on a capability
   *  should wait for this rather than acting on the default "member"
   *  capabilities below, which are a safe placeholder, not a real answer. */
  loading: boolean;
  capabilities: SiteCapabilities;
}

const DEFAULT_VALUE: CapabilityContextValue = {
  loading: true,
  capabilities: resolveSiteCapabilities("member"),
};

const CapabilityContext = createContext<CapabilityContextValue>(DEFAULT_VALUE);

/**
 * Resolves the signed-in user's site-wide role ONCE per session (mirrors the
 * module-singleton-cache pattern already used throughout services/ — e.g.
 * profileCache.ts) and makes the resulting SiteCapabilities available via
 * useSiteCapabilities(). Wraps AppRouter, inside AuthProvider (useAuth needs
 * MsalProvider's context).
 */
export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, email } = useAuth();
  const [state, setState] = useState<{ loading: boolean; role: SiteRole }>({ loading: true, role: "member" });

  useEffect(() => {
    if (!isAuthenticated || !email) {
      setState({ loading: true, role: "member" });
      return;
    }
    let cancelled = false;
    resolveEffectiveSiteRole(email)
      .then((role) => {
        if (!cancelled) setState({ loading: false, role });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[CapabilityProvider] role resolution failed — defaulting to Member", err);
        if (!cancelled) setState({ loading: false, role: "member" });
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, email]);

  const value = useMemo<CapabilityContextValue>(
    () => ({ loading: state.loading, capabilities: resolveSiteCapabilities(state.role) }),
    [state]
  );

  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useSiteCapabilities(): CapabilityContextValue {
  return useContext(CapabilityContext);
}
