import { createListItem, deleteListItem, queryListItems, updateListItem, type ListItem } from "./lists";
import { ensureFormsSiteStructure, LIST_NAMES } from "./bootstrap";
import type { ConnectorType } from "../formsSchema/types";

export interface ConnectorConfigFields {
  Title: string; // mirrors Name, for legibility in SharePoint's default view
  Name: string;
  ConnectorType: ConnectorType;
  ConfigJson: string;
  SecretRef?: string;
  CreatedBy: string;
  CreatedAt: string;
}

export async function listConnectorConfigs(): Promise<ListItem<ConnectorConfigFields>[]> {
  await ensureFormsSiteStructure();
  return queryListItems<ConnectorConfigFields>(LIST_NAMES.connectorConfigs, {});
}

export async function createConnectorConfig(params: {
  name: string;
  connectorType: ConnectorType;
  config: Record<string, unknown>;
  createdBy: string;
}): Promise<ListItem<ConnectorConfigFields>> {
  await ensureFormsSiteStructure();
  return createListItem<ConnectorConfigFields>(LIST_NAMES.connectorConfigs, {
    Title: params.name,
    Name: params.name,
    ConnectorType: params.connectorType,
    ConfigJson: JSON.stringify(params.config),
    CreatedBy: params.createdBy,
    CreatedAt: new Date().toISOString(),
  });
}

export async function updateConnectorConfig(
  itemId: string,
  updates: { name?: string; config?: Record<string, unknown> }
): Promise<void> {
  await updateListItem<ConnectorConfigFields>(LIST_NAMES.connectorConfigs, itemId, {
    ...(updates.name ? { Title: updates.name, Name: updates.name } : {}),
    ...(updates.config ? { ConfigJson: JSON.stringify(updates.config) } : {}),
  });
}

export async function deleteConnectorConfig(itemId: string): Promise<void> {
  await deleteListItem(LIST_NAMES.connectorConfigs, itemId);
}

export async function getConnectorConfigById(itemId: string): Promise<ListItem<ConnectorConfigFields> | null> {
  const all = await listConnectorConfigs();
  return all.find((item) => item.id === itemId) ?? null;
}
