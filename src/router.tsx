import type { ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthGate } from "./auth/AuthGate";
import { useAuth } from "./auth/useAuth";
import { useSiteCapabilities } from "./auth/CapabilityProvider";
import type { SiteCapabilities } from "./formsSchema/capabilities";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { MyResponsesPage } from "./pages/MyResponsesPage";
import { BuilderPage } from "./pages/builder/BuilderPage";
import { FillPage } from "./pages/fill/FillPage";
import { SubmittedPage } from "./pages/fill/SubmittedPage";
import { ApprovePage } from "./pages/fill/ApprovePage";
import { ResponsesPage } from "./pages/admin/ResponsesPage";
import { ResponseDetailPage } from "./pages/admin/ResponseDetailPage";
import { SyncHealthPage } from "./pages/admin/SyncHealthPage";
import { ConnectorsPage } from "./pages/admin/ConnectorsPage";
import { ManageRolesPage } from "./pages/admin/ManageRolesPage";

/**
 * Shows the marketing/landing page (Login) to a signed-out visitor instead
 * of AuthGate's usual immediate redirect-to-Microsoft — AuthGate
 * auto-triggers `login()` the instant it mounts, which meant a signed-out
 * visitor could never actually see the landing page (or its own "Sign in"
 * button) first: they were bounced to Microsoft's login before it
 * rendered, every single time. Used for the root path and for a shared
 * form-fill link — both are places a genuinely new (not-yet-signed-in)
 * visitor is likely to land. Builder/admin routes still use AuthGate
 * directly: there's no marketing value in showing an internal admin a
 * landing page before a builder link they were already sent.
 */
function LandingOrAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Login />;
  return <AuthGate>{children}</AuthGate>;
}

type SiteCapabilityKey = {
  [K in keyof SiteCapabilities]: SiteCapabilities[K] extends boolean ? K : never;
}[keyof SiteCapabilities];

/** Gates a route on a SITE-WIDE capability (e.g. canManageConnectors,
 *  canManageRoles) — for anything gated on a specific FORM's capabilities
 *  instead (builder, responses pages), the check has to happen inside the
 *  page itself once the form has loaded, same as AuthGate's own reasoning
 *  for not knowing about individual forms. Wraps AuthGate so signed-out
 *  visitors still go through the normal sign-in flow first. */
function RequireSiteCapability({ capability, children }: { capability: SiteCapabilityKey; children: ReactNode }) {
  return (
    <AuthGate>
      <CapabilityGate capability={capability}>{children}</CapabilityGate>
    </AuthGate>
  );
}

function CapabilityGate({ capability, children }: { capability: SiteCapabilityKey; children: ReactNode }) {
  const { loading, capabilities } = useSiteCapabilities();
  if (loading) return <div className="page">Loading…</div>;
  if (!capabilities[capability]) {
    return (
      <div className="page page--centered" role="alert">
        <p>You don't have access to this page.</p>
        <Link to="/">← My forms</Link>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * HashRouter (not BrowserRouter) deliberately: this app deploys as a static
 * bundle to GitHub Pages, which has no server-side rewrite rule to send deep
 * links like /f/team-outing back to index.html. Hash-based routes
 * (/#/f/team-outing) work with zero server config, matching the zero-ops
 * constraint the whole stack is built around.
 */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <LandingOrAuthGate>
              <Dashboard />
            </LandingOrAuthGate>
          }
        />
        <Route
          path="/builder/:formId"
          element={
            <AuthGate>
              <BuilderPage />
            </AuthGate>
          }
        />
        <Route
          path="/my-responses"
          element={
            <AuthGate>
              <MyResponsesPage />
            </AuthGate>
          }
        />
        <Route
          path="/f/:slug"
          element={
            <LandingOrAuthGate>
              <FillPage />
            </LandingOrAuthGate>
          }
        />
        <Route
          path="/f/:slug/submitted"
          element={
            <LandingOrAuthGate>
              <SubmittedPage />
            </LandingOrAuthGate>
          }
        />
        <Route
          path="/f/:slug/approve/:responseId"
          element={
            <LandingOrAuthGate>
              <ApprovePage />
            </LandingOrAuthGate>
          }
        />
        <Route
          path="/admin/forms/:formId/responses"
          element={
            <AuthGate>
              <ResponsesPage />
            </AuthGate>
          }
        />
        <Route
          path="/admin/forms/:formId/responses/:responseId"
          element={
            <AuthGate>
              <ResponseDetailPage />
            </AuthGate>
          }
        />
        <Route
          path="/admin/sync-health"
          element={
            <AuthGate>
              <SyncHealthPage />
            </AuthGate>
          }
        />
        <Route
          path="/admin/connectors"
          element={
            <RequireSiteCapability capability="canManageConnectors">
              <ConnectorsPage />
            </RequireSiteCapability>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RequireSiteCapability capability="canManageRoles">
              <ManageRolesPage />
            </RequireSiteCapability>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
