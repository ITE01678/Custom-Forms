/** Typed error hierarchy for Graph API calls — lets callers branch on failure kind
 *  instead of parsing status codes/response bodies themselves.
 *
 *  Fields are assigned in the constructor body (not via constructor-parameter
 *  shorthand) because this project's tsconfig sets `erasableSyntaxOnly`, which
 *  disallows that shorthand (it isn't plain type-erasable syntax). */

export class GraphError extends Error {
  status: number;
  path: string;
  body: string;

  constructor(status: number, path: string, body: string) {
    super(`Graph ${path} -> ${status}: ${body.slice(0, 300)}`);
    this.name = "GraphError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

export class GraphPermissionError extends GraphError {
  constructor(path: string, body: string) {
    super(403, path, body);
    this.name = "GraphPermissionError";
  }
}

export class GraphPremiumRequiredError extends GraphError {
  constructor(path: string, body: string) {
    super(403, path, body);
    this.name = "GraphPremiumRequiredError";
  }
}

export class GraphThrottledError extends GraphError {
  retryAfterMs: number;

  constructor(path: string, retryAfterMs: number) {
    super(429, path, "throttled");
    this.name = "GraphThrottledError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class GraphAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphAuthError";
  }
}
