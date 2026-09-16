import { registerConnector } from "./registry";
import { graphProfileConnector } from "./graphProfile";
import { graphDirectReportsConnector } from "./graphDirectReports";
import { excelLookupConnector } from "./excelLookup";
import { sharepointListQueryConnector } from "./sharepointListQuery";
import { powerAutomateProxyConnector } from "./powerAutomateProxy";

let registered = false;

/** Registers every built-in connector once. Call before resolving any
 *  connector-autofill field. */
export function registerBuiltinConnectors(): void {
  if (registered) return;
  registerConnector(graphProfileConnector);
  registerConnector(graphDirectReportsConnector);
  registerConnector(excelLookupConnector);
  registerConnector(sharepointListQueryConnector);
  registerConnector(powerAutomateProxyConnector);
  registered = true;
}

export * from "./registry";
