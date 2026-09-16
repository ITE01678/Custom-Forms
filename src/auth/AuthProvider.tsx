import { useEffect, useState, type ReactNode } from "react";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance, msalInitPromise } from "./msalInstance";

/**
 * Wraps the app in MsalProvider, but only once msalInstance.initialize()
 * (and any pending redirect handling) has resolved — rendering MSAL-dependent
 * components before that throws "uninitialized_public_client_application".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    msalInitPromise.finally(() => setReady(true));
  }, []);

  if (!ready) return null; // brief blank frame while MSAL boots; swap for a spinner if desired

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
