import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./auth/AuthGate";
import { useAuth } from "./auth/useAuth";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { BuilderPage } from "./pages/builder/BuilderPage";
import { FillPage } from "./pages/fill/FillPage";
import { SubmittedPage } from "./pages/fill/SubmittedPage";
import { ResponsesPage } from "./pages/admin/ResponsesPage";
import { ResponseDetailPage } from "./pages/admin/ResponseDetailPage";
import { SyncHealthPage } from "./pages/admin/SyncHealthPage";
import { ConnectorsPage } from "./pages/admin/ConnectorsPage";

/**
 * Root route: shows the marketing/landing page (Login) to a signed-out
 * visitor instead of AuthGate's usual immediate redirect-to-Microsoft —
 * AuthGate auto-triggers `login()` the instant it mounts, so mounting it
 * directly at "/" meant NO signed-out visitor could ever actually see the
 * landing page (or its own "Sign in" button) — they were bounced to
 * Microsoft's login before it rendered, every single time. Every other
 * route still uses AuthGate directly: a shared form link, the builder,
 * etc. should auto-redirect a signed-out visitor straight to sign-in
 * rather than show them a marketing page they didn't ask for — only the
 * root path needed this distinction.
 */
function RootRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Login />;
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
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

        <Route path="/" element={<RootRoute />} />
        <Route
          path="/builder/:formId"
          element={
            <AuthGate>
              <BuilderPage />
            </AuthGate>
          }
        />
        <Route
          path="/f/:slug"
          element={
            <AuthGate>
              <FillPage />
            </AuthGate>
          }
        />
        <Route
          path="/f/:slug/submitted"
          element={
            <AuthGate>
              <SubmittedPage />
            </AuthGate>
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
            <AuthGate>
              <ConnectorsPage />
            </AuthGate>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
