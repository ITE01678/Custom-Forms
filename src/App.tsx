import type { CSSProperties } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { CapabilityProvider } from "./auth/CapabilityProvider";
import { AppRouter } from "./router";

// Set as a CSS custom property (not a literal url() in index.css) because
// this is a `url(...)` token, not a plain path — a hardcoded root-absolute
// path in CSS wouldn't account for this app's deploy-time BASE_PATH (GitHub
// Pages project-site subpath vs. the custom domain's root — see
// vite.config.ts), the same reason SharingPanel/AppTopbar's logo already
// resolve asset URLs through import.meta.env.BASE_URL in JS instead.
const rootStyle: CSSProperties = {
  "--app-bg-url": `url(${import.meta.env.BASE_URL}jupiter-bg.jpg)`,
} as CSSProperties;

export function App() {
  return (
    <div className="app-root-bg" style={rootStyle}>
      <AuthProvider>
        <CapabilityProvider>
          <AppRouter />
        </CapabilityProvider>
      </AuthProvider>
    </div>
  );
}
