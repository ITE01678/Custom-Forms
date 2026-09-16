import type { DataSourceConnector } from "./registry";

export interface PowerAutomateProxyConfig {
  /** The flow's HTTP-request-trigger URL (holds its own signature/key —
   *  treat this like a secret; restrict who can read the ConnectorConfigs
   *  SharePoint List via normal SharePoint permissions, see SETUP.md). */
  flowUrl: string;
}

/**
 * The escape hatch for any data source that needs a hidden secret (a
 * third-party HR API key, say) that can't safely live in browser code with
 * no backend to hide it behind — Power Automate holds the credential/
 * connection instead, and the SPA just calls its HTTP trigger.
 */
export const powerAutomateProxyConnector: DataSourceConnector<PowerAutomateProxyConfig> = {
  type: "power-automate-proxy",
  async resolve(config, params, ctx) {
    const res = await fetch(config.flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyValue: params.keyValue, currentUserEmail: ctx.currentUserEmail }),
    });
    if (!res.ok) throw new Error(`Power Automate flow returned ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  },
};
