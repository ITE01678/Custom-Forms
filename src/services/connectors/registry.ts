import type { ConnectorType } from "../../formsSchema/types";

export interface ConnectorContext {
  currentUserEmail: string;
  priorAnswers: Record<string, unknown>;
}

export interface ConnectorParams {
  keyValue: string;
}

/**
 * Pluggable data-source abstraction — every source a connector-autofill
 * field can point at implements this, and the registry makes adding a new
 * source type additive (a new file + one registerConnector call), not a
 * change to form/runtime code. Always resolves to an ARRAY of row-objects,
 * even for scalar fields (which just use row [0]'s mapped value) — this
 * keeps one resolution path for both scalar and repeatingTable fields.
 */
export interface DataSourceConnector<TConfig = Record<string, unknown>> {
  type: ConnectorType;
  resolve(config: TConfig, params: ConnectorParams, ctx: ConnectorContext): Promise<Record<string, unknown>[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<ConnectorType, DataSourceConnector<any>>();

/** Accepts any concretely-typed connector — each implementation's own
 *  TConfig is only meaningful within that file; across the registry
 *  boundary configs are opaque JSON parsed from ConnectorConfigs anyway. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerConnector(connector: DataSourceConnector<any>): void {
  registry.set(connector.type, connector);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConnector(type: ConnectorType): DataSourceConnector<any> {
  const connector = registry.get(type);
  if (!connector) throw new Error(`No connector registered for type "${type}".`);
  return connector;
}
