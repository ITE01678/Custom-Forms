import { useAuth } from "../auth/useAuth";

export function Login() {
  const { isAuthenticated, login } = useAuth();

  if (isAuthenticated) {
    return <p>You're already signed in.</p>;
  }

  return (
    <div className="page page--centered">
      <h1>Custom Forms</h1>
      <p>Sign in with your official Microsoft 365 account to continue.</p>
      <button onClick={() => login()}>Sign in with Microsoft</button>
    </div>
  );
}
