import { useCallback, useEffect, useState } from "react";
import { getMyProfileCached } from "../../../services/profileCache";
import { getManager } from "../../../services/users";
import { getConnectorConfigById } from "../../../services/connectorConfigs";
import { getConnector } from "../../../services/connectors/registry";
import { registerBuiltinConnectors } from "../../../services/connectors";
import { resolveTemplate } from "../../../lib/templateExpression";
import type { AnswerValue, FormField } from "../../../formsSchema/types";

registerBuiltinConnectors();

export type AutofillStatus = "idle" | "loading" | "resolved" | "empty" | "error";

export interface AutofillResult {
  status: AutofillStatus;
  rows: Record<string, unknown>[];
  error?: string;
  retry: () => void;
}

/**
 * Resolves a graph-autofill or connector-autofill field's value(s). Always
 * exposes rows as an array — scalar fields just use rows[0]'s mapped key —
 * so both AutofillField (scalar) and ConnectorTableField (repeating) share
 * one resolution path, per the connector registry's design.
 */
export function useAutofill(
  field: FormField,
  respondentEmail: string,
  priorAnswers: Record<string, AnswerValue>
): AutofillResult {
  const [state, setState] = useState<{ status: AutofillStatus; rows: Record<string, unknown>[]; error?: string }>({
    status: "idle",
    rows: [],
  });

  const resolve = useCallback(async () => {
    if (field.fillMode === "manual") return;
    setState({ status: "loading", rows: [] });

    try {
      if (field.fillMode === "graph-autofill" && field.graphAutofill) {
        const profile =
          field.graphAutofill.source === "self-manager" ? await getManager(respondentEmail) : await getMyProfileCached();
        const raw = (profile as unknown as Record<string, unknown>)[field.graphAutofill.graphProperty] ?? null;
        // businessPhones (and any future array-valued profile property) —
        // flatten to its first entry so scalar fields (a plain text input)
        // have something sensible to display/store.
        const value = Array.isArray(raw) ? raw[0] ?? null : raw;
        setState({ status: value === null || value === "" ? "empty" : "resolved", rows: [{ value }] });
        return;
      }

      if (field.fillMode === "connector-autofill" && field.connectorAutofill) {
        const cfg = field.connectorAutofill;
        const configItem = await getConnectorConfigById(cfg.connectorId);
        if (!configItem) throw new Error("Connector configuration not found.");
        const connector = getConnector(cfg.connectorType);
        const profile = await getMyProfileCached();
        const keyValue = resolveTemplate(cfg.lookupKeyExpression, {
          respondent: profile as unknown as Record<string, unknown>,
          fields: priorAnswers,
        });
        const parsedConfig = JSON.parse(configItem.fields.ConfigJson);
        const rows = await connector.resolve(parsedConfig, { keyValue }, { currentUserEmail: respondentEmail, priorAnswers });
        setState({ status: rows.length === 0 ? "empty" : "resolved", rows });
        return;
      }

      setState({ status: "empty", rows: [] });
    } catch (err) {
      setState({ status: "error", rows: [], error: err instanceof Error ? err.message : String(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.id]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return { ...state, retry: resolve };
}
