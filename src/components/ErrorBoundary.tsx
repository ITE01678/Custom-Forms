import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught render error anywhere in the tree unmounts the
 * whole app and leaves a blank white page — no message, no way to recover
 * short of a manual reload with no idea why. This catches it and shows
 * something actionable instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page page--centered">
          <h1>Something went wrong</h1>
          <p className="error-text">{this.state.error.message}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
