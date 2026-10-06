import { AuthProvider } from "./auth/AuthProvider";
import { CapabilityProvider } from "./auth/CapabilityProvider";
import { AppRouter } from "./router";

export function App() {
  return (
    <AuthProvider>
      <CapabilityProvider>
        <AppRouter />
      </CapabilityProvider>
    </AuthProvider>
  );
}
