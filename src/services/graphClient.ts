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

/**
 * Acquire a delegated access token for the given scopes, for the currently
 * active (signed-in) account. Every Graph call in this app uses the LOGGED-IN
 * USER's own token — there is no server, so there's no app-only/client-
 * credentials path here (see SETUP.md / plan for the rationale).
 *
 * `interactive` (default true) controls what happens when a silent refresh
 * needs user interaction (new scope, revoked consent, expired session): a
 * popup is fine for a call the user just triggered directly, but a call
 * running passively in the background (e.g. an <img> load resolving a
 * SharePoint reference) must NOT pop a login window out of nowhere — a
 * popup opened from a non-user-gesture effect can be silently blocked by
 * the browser, or sit waiting for a window the user never notices, hanging
 * the calling promise forever. Passing `interactive: false` throws
 * immediately instead, so the caller's own error handling (e.g. GraphImage's
 * "couldn't load" message) fires right away.
 */
async function getDelegatedToken(scopes: string[], interactive = true): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw new GraphAuthError("No signed-in account — cannot acquire a Graph token.");
  }
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes, account });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      if (!interactive) throw err;
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
  /** Default true. Set false for calls that must never pop an interactive
   *  MSAL window if silent token refresh fails — e.g. a best-effort
   *  notification-email send that's wrapped in try/catch by the caller and
   *  must fail fast, not hang waiting on a popup nobody asked for. See
   *  getDelegatedToken's doc comment. */
  interactive?: boolean;
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
    const token = await getDelegatedToken(scopes, opts.interactive ?? true);

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      // The browser's own HTTP cache must never serve a stale response for
      // a Graph call — confirmed necessary the hard way: a read
      // immediately after a write to the same URL (e.g. an ETag lookup or
      // a content re-read right after uploading new bytes) could otherwise
      // be answered from cache instead of hitting the network, silently
      // showing pre-write state as if it were current.
      cache: "no-store",
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
      // "Could not obtain a WAC access token" is Graph's Excel/Workbook API
      // (backed by Office Online Server, aka WAC) failing to establish an
      // editing session — NOT a real permission denial. It reliably fires on
      // the FIRST /workbook/... call against a file that was uploaded only
      // moments earlier (Office Online hasn't finished indexing the new file
      // yet) and clears itself on retry a few seconds later. Treat it like
      // 429/503: back off and retry, rather than surfacing it as a
      // GraphPermissionError the caller can't do anything about.
      if (/could not obtain a wac access token/i.test(bodyText)) {
        if (attempt === maxRetries) throw new GraphError(503, path, bodyText);
        await sleep(2000 * (attempt + 1) + jitter(500));
        continue;
      }
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
  opts: { contentType?: string; scopes?: string[]; retries?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  const scopes = opts.scopes ?? ["Sites.Manage.All"];
  const maxRetries = opts.retries ?? 3;
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getDelegatedToken(scopes);
    const res = await fetch(url, {
      method: "PUT",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": opts.contentType ?? "application/octet-stream",
        ...opts.headers,
      },
      body: bytes,
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt === maxRetries) throw new GraphThrottledError(path, retryAfterSec * 1000);
      await sleep(retryAfterSec * 1000 + jitter(250));
      continue;
    }
    // 412 (If-Match failed — someone else wrote the file first) is a
    // caller-handled conflict, not a retryable transient error — surface it
    // immediately so the caller can re-download and reapply its change.
    if (!res.ok) throw new GraphError(res.status, path, await res.text());
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  throw new GraphError(500, path, "retry loop exhausted");
}

/**
 * Raw binary download (e.g. rendering a SharePoint-uploaded image as an
 * <img> without depending on a live browser session against the tenant's
 * SharePoint host — a driveItem's plain `webUrl` only renders for a browser
 * that already has its own SharePoint sign-in cookie, which an incognito/
 * private window never has). Content-Disposition/type are irrelevant to the
 * caller here; this always resolves to raw bytes.
 */
export async function graphFetchBinary(
  path: string,
  opts: { scopes?: string[]; retries?: number; interactive?: boolean } = {}
): Promise<Blob> {
  const scopes = opts.scopes ?? ["User.Read"];
  const maxRetries = opts.retries ?? 3;
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Non-interactive by default — see getDelegatedToken's doc comment.
    // Binary downloads back an <img>/CSS background; they must never pop a
    // login window out of nowhere.
    const token = await getDelegatedToken(scopes, opts.interactive ?? false);
    const res = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 429 || res.status === 503) {
      const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt === maxRetries) throw new GraphThrottledError(path, retryAfterSec * 1000);
      await sleep(retryAfterSec * 1000 + jitter(250));
      continue;
    }
    if (!res.ok) throw new GraphError(res.status, path, await res.text());
    return await res.blob();
  }

  throw new GraphError(500, path, "retry loop exhausted");
}

/**
 * Uploads via Graph's resumable "upload session" flow instead of a plain
 * `PUT .../content`. Workaround for a tenant-specific corruption bug: a
 * plain content PUT to an Office-recognized extension (.xlsx) is silently
 * accepted — 200 response, a new SharePoint version, a changed ETag — but
 * the item's committed size ends up 0, confirmed by reading the item's own
 * `size` property straight from Graph right after the PUT, independent of
 * any client-side read or caching path. The upload-session route uses a
 * different backend ingestion path that doesn't appear to hit whatever
 * broken coauthoring/finalize step is zeroing out a direct PUT here.
 */
export async function graphUploadBinaryViaSession<T = unknown>(
  driveId: string,
  itemPath: string,
  bytes: ArrayBuffer,
  opts: { scopes?: string[]; ifMatchEtag?: string } = {}
): Promise<T> {
  const scopes = opts.scopes ?? ["Sites.Manage.All"];

  if (!(bytes instanceof ArrayBuffer)) {
    throw new Error(
      `graphUploadBinaryViaSession: expected an ArrayBuffer, got ${Object.prototype.toString.call(bytes)} — ` +
        `caller passed something without a real .byteLength.`
    );
  }

  const session = await graphFetch<{ uploadUrl: string }>(
    `/drives/${driveId}/root:/${itemPath}:/createUploadSession`,
    {
      method: "POST",
      scopes,
      body: { item: { "@microsoft.graph.conflictBehavior": "replace" } },
      headers: opts.ifMatchEtag ? { "If-Match": opts.ifMatchEtag } : undefined,
    }
  );

  if (!session?.uploadUrl) {
    throw new Error(`createUploadSession for ${itemPath} did not return an uploadUrl — got ${JSON.stringify(session)}`);
  }

  try {
    // uploadUrl is a pre-authenticated temporary URL — no Authorization
    // header, and it's outside GRAPH_BASE, so this can't go through
    // graphFetch/graphUploadBinary's usual token-attaching path.
    // Content-Length is deliberately NOT set here — it's a forbidden fetch()
    // header the browser sets itself from the body, and passing it
    // explicitly risks the request being rejected or malformed depending on
    // the engine.
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
      body: bytes,
    });
    if (!res.ok) throw new GraphError(res.status, itemPath, await res.text());
    return (await res.json()) as T;
  } catch (err) {
    // A session that's created but never finalized (any error here, before
    // or during the ranged PUT) stays "in progress" on Graph's side and
    // permanently blocks every future write to this same item with a 409
    // "nameAlreadyExists" until it's cancelled or naturally expires (up to
    // ~2 weeks) — confirmed the hard way: one failed attempt wedged every
    // subsequent submit/edit to the same response workbook. Best-effort
    // cancel so a failure here doesn't have that lasting effect; if the
    // cancel itself fails, the original error is what the caller needs to
    // see, not this one.
    try {
      await fetch(session.uploadUrl, { method: "DELETE", cache: "no-store" });
    } catch {
      // ignored — see comment above
    }
    throw err;
  }
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
