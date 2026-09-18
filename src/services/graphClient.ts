import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../auth/msalInstance";
import {
  GraphAuthError,
  GraphError,
  GraphPermissionError,
  GraphPremiumRequiredError,
  GraphThrottledError,
} from "./graphErrors";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Decodes a JWT's payload without verifying it — good enough to read the
 *  `scp` (delegated scopes) claim for debugging. Never use this for
 *  anything security-relevant; it doesn't check the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Acquire a delegated access token for the given scopes, for the currently
 * active (signed-in) account. Every Graph call in this app uses the LOGGED-IN
 * USER's own token — there is no server, so there's no app-only/client-
 * credentials path here (see SETUP.md / plan for the rationale).
 */
async function getDelegatedToken(scopes: string[]): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw new GraphAuthError("No signed-in account — cannot acquire a Graph token.");
  }
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes, account });
    if (scopes.includes("Sites.Manage.All")) {
      // Temporary diagnostic logging — remove once the SharePoint 403 issue
      // is confirmed fixed. Logs the ACTUAL scopes present in the token's
      // own `scp` claim, not just what was requested — the two can differ
      // from what the portal shows as "granted" for reasons that only show
      // up here.
      const payload = decodeJwtPayload(result.accessToken);
      // eslint-disable-next-line no-console
      console.info("[auth-debug] token for Sites.Manage.All call", {
        requestedScopes: scopes,
        actualScopeClaim: payload?.scp ?? payload?.roles ?? "(none found in token)",
        aud: payload?.aud,
        tid: payload?.tid,
        upn: payload?.upn ?? payload?.unique_name ?? payload?.preferred_username,
      });
    }
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Silent refresh needs interaction (new scope, revoked consent, expired
      // session). Use a popup here rather than a redirect so we don't blow
      // away in-progress form state mid-service-call.
      const result = await msalInstance.acquireTokenPopup({ scopes });
      return result.accessToken;
    }
    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(maxMs: number) {
  return Math.floor(Math.random() * maxMs);
}

export interface GraphRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  scopes?: string[];
  retries?: number;
  /** Absolute URL (e.g. an @odata.nextLink) instead of a /v1.0-relative path. */
  absoluteUrl?: boolean;
  /** Extra headers to merge in — e.g. `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly`
   *  for SharePoint List $filter queries on non-indexed columns. */
  headers?: Record<string, string>;
}

/**
 * Shared, hardened Graph fetch wrapper — the one place token acquisition,
 * retry/backoff, and error typing live, so no route/service re-implements
 * this (the mistake this project deliberately avoids repeating).
 */
export async function graphFetch<T>(path: string, opts: GraphRequestOptions = {}): Promise<T> {
  const scopes = opts.scopes ?? ["User.Read"];
  const maxRetries = opts.retries ?? 3;
  const url = opts.absoluteUrl || path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getDelegatedToken(scopes);

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.method && opts.method !== "GET" ? { Prefer: "return=representation" } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt === maxRetries) throw new GraphThrottledError(path, retryAfterSec * 1000);
      await sleep(retryAfterSec * 1000 + jitter(250));
      continue;
    }

    if (res.status === 403) {
      const bodyText = await res.text();
      if (/premium|license/i.test(bodyText)) {
        throw new GraphPremiumRequiredError(path, bodyText);
      }
      throw new GraphPermissionError(path, bodyText);
    }

    if (!res.ok) {
      throw new GraphError(res.status, path, await res.text());
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // Unreachable — the loop always returns or throws — but keeps TS happy.
  throw new GraphError(500, path, "retry loop exhausted");
}

/**
 * Raw binary upload (e.g. the .xlsx template) — kept separate from graphFetch
 * because the body is an ArrayBuffer, not JSON, and the content-type differs.
 * Shares the same token acquisition + 429/503 retry shape.
 */
export async function graphUploadBinary<T = unknown>(
  path: string,
  bytes: ArrayBuffer,
  opts: { contentType?: string; scopes?: string[]; retries?: number } = {}
): Promise<T> {
  const scopes = opts.scopes ?? ["Sites.Manage.All"];
  const maxRetries = opts.retries ?? 3;
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getDelegatedToken(scopes);
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": opts.contentType ?? "application/octet-stream",
      },
      body: bytes,
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt === maxRetries) throw new GraphThrottledError(path, retryAfterSec * 1000);
      await sleep(retryAfterSec * 1000 + jitter(250));
      continue;
    }
    if (!res.ok) throw new GraphError(res.status, path, await res.text());
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  throw new GraphError(500, path, "retry loop exhausted");
}

interface GraphPageResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/** Follows @odata.nextLink pages, concatenating `value[]`, up to a safety cap. */
export async function graphFetchAllPages<T>(
  path: string,
  opts: GraphRequestOptions = {},
  maxPages = 20
): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = path;
  let absolute = opts.absoluteUrl ?? false;

  for (let page = 0; next && page < maxPages; page++) {
    const response: GraphPageResponse<T> = await graphFetch<GraphPageResponse<T>>(next, {
      ...opts,
      absoluteUrl: absolute,
    });
    results.push(...response.value);
    next = response["@odata.nextLink"] ?? null;
    absolute = true; // nextLink is always a full URL
  }

  return results;
}
