import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { AppTopbar } from "../../components/layout/AppTopbar";
import { ConnectorSourcePicker } from "../../components/admin/ConnectorSourcePicker";
import {
  createConnectorConfig,
  deleteConnectorConfig,
  listConnectorConfigs,
  type ConnectorConfigFields,
} from "../../services/connectorConfigs";
import type { ListItem } from "../../services/lists";
import type { ConnectorType } from "../../formsSchema/types";

const CONNECTOR_TYPES: { value: ConnectorType; label: string; exampleConfig: string }[] = [
  {
    value: "graph-profile",
    label: "Microsoft Graph — another user's profile",
    exampleConfig: "{}",
  },
  {
    value: "graph-directReports",
    label: "Microsoft Graph — a manager's direct reports (team roster)",
    exampleConfig: "{}",
  },
  {
    value: "excel-lookup",
    label: "Shared Excel file",
    exampleConfig:
      '{\n  "libraryName": "SharedData",\n  "itemPath": "hr-roster.xlsx",\n  "table": "Sheet1",\n  "keyColumn": "Department"\n}',
  },
  {
    value: "sharepoint-list-query",
    label: "SharePoint List",
    exampleConfig: '{\n  "listName": "TeamRoster",\n  "filterColumn": "Department"\n}',
  },
  {
    value: "power-automate-proxy",
    label: "Power Automate flow (for sources needing a hidden secret)",
    exampleConfig: '{\n  "flowUrl": "https://prod-00.westus.logic.azure.com/…"\n}',
  },
];

export function ConnectorsPage() {
  const { email } = useAuth();
  const [configs, setConfigs] = useState<ListItem<ConnectorConfigFields>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("excel-lookup");
  const [configJson, setConfigJson] = useState(CONNECTOR_TYPES[2].exampleConfig);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setConfigs(await listConnectorConfigs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!email || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const config = JSON.parse(configJson);
      await createConnectorConfig({ name: name.trim(), connectorType: type, config, createdBy: email });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId: string) {
    await deleteConnectorConfig(itemId);
    await load();
  }

  return (
    <div className="app-shell">
      <AppTopbar backTo={{ to: "/", label: "My forms" }} />
      <div className="page page--wide">
      <h1>Data source connectors</h1>
      <p>
        Reusable data sources form fields can auto-fill from — Graph directory data, a shared
        Excel file, a SharePoint List, or (for sources needing a hidden API key) a Power Automate
        flow. Configure once here, then reference by name from any field's "Auto-fill from a
        connector" setting in the builder.
      </p>

      <div className="panel">
        <h3>Add a connector</h3>
        <div className="field-row">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HR Team Roster" />
        </div>
        <div className="field-row">
          <label>Type</label>
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as ConnectorType;
              setType(next);
              setConfigJson(CONNECTOR_TYPES.find((t) => t.value === next)?.exampleConfig ?? "{}");
            }}
          >
            {CONNECTOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {(type === "excel-lookup" || type === "sharepoint-list-query") && (
          <ConnectorSourcePicker
            type={type}
            onConfigChange={(config) => setConfigJson(JSON.stringify(config, null, 2))}
          />
        )}
        <details className="connector-json-advanced">
          <summary>{type === "excel-lookup" || type === "sharepoint-list-query" ? "Advanced: edit config JSON directly" : "Config (JSON)"}</summary>
          <textarea
            style={{ minHeight: "8rem", fontFamily: "monospace" }}
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
          />
        </details>
        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" onClick={handleCreate} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Add connector"}
        </button>
      </div>

      <div className="panel">
        <h3>Existing connectors</h3>
        {loading ? (
          <p>Loading…</p>
        ) : configs.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="response-grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Config</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id}>
                    <td>{c.fields.Name}</td>
                    <td>{c.fields.ConnectorType}</td>
                    <td>
                      <code>{c.fields.ConfigJson}</code>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
