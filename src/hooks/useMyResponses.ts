import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { getFormById } from "../services/forms";
import { getResponseByRowIndex } from "../services/excel";
import { getIndexEntriesForSubmitter } from "../services/responseIndex";
import { getRoutingState } from "../services/responseRouting";
import { canSelfEdit } from "../formsSchema/editAccess";
import type { FormDefinition, FormResponse, ResponseRoutingState } from "../formsSchema/types";

export interface MyResponseRow {
  form: FormDefinition;
  response: FormResponse;
  routingStatus: ResponseRoutingState["status"] | null;
  editable: boolean;
}

/** Resolves N things with at most `size` in flight at once — a user with a
 *  lot of responses shouldn't fire dozens of simultaneous Graph calls. */
async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

/**
 * Every response the signed-in user has personally submitted, across ALL
 * forms — built entirely on ResponseIndex's existing SubmitterEmail-only
 * query (zero new storage, see services/responseIndex.ts's
 * getIndexEntriesForSubmitter). Extracted out of MyResponsesPage so
 * Dashboard's "My responses" toggle can share the exact same data-fetching
 * instead of a second implementation.
 */
export function useMyResponses(): { rows: MyResponseRow[]; loading: boolean; error: string | null } {
  const { email } = useAuth();
  const [rows, setRows] = useState<MyResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await getIndexEntriesForSubmitter(email);
        const resolved = await mapWithConcurrency(entries, 5, async (entry): Promise<MyResponseRow | null> => {
          const stored = await getFormById(entry.fields.FormId);
          if (!stored) return null;
          const { form } = stored;
          // Resolved directly via the index entry we already have, rather
          // than services/responses.ts's getMyResponse wrapper, which would
          // redundantly re-run getIndexBySubmitter (a second List query) —
          // we already know the row index.
          const response = await getResponseByRowIndex(form, entry.fields.RowIndex);
          if (!response) return null;
          const routingEntry = await getRoutingState(form.id, response.id);
          const editable = canSelfEdit({ form, response, hasActiveRouting: !!routingEntry });
          return { form, response, routingStatus: routingEntry?.state.status ?? null, editable };
        });
        if (!cancelled) {
          setRows(
            resolved
              .filter((r): r is MyResponseRow => r !== null)
              .sort((a, b) => (b.response.submittedAt ?? "").localeCompare(a.response.submittedAt ?? ""))
          );
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { rows, loading, error };
}
