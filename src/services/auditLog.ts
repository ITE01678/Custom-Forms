import { createListItem, odataQuote, queryListItems } from "./lists";
import { LIST_NAMES } from "./bootstrap";
import type { AuditEntry } from "../formsSchema/types";

export interface AuditLogFields {
  Title: string; // mirrors Action, for legibility in SharePoint's default view
  FormId: string;
  ResponseId: string;
  ByEmail: string;
  Action: AuditEntry["action"];
  ChangedFieldsJson: string;
  At: string;
  Reason?: string;
}

export async function addAuditEntry(params: {
  formId: string;
  responseId: string;
  byEmail: string;
  action: AuditEntry["action"];
  changedFields: AuditEntry["changedFields"];
  reason?: string;
}): Promise<void> {
  await createListItem<AuditLogFields>(LIST_NAMES.auditLog, {
    Title: params.action,
    FormId: params.formId,
    ResponseId: params.responseId,
    ByEmail: params.byEmail,
    Action: params.action,
    ChangedFieldsJson: JSON.stringify(params.changedFields),
    At: new Date().toISOString(),
    Reason: params.reason ?? "",
  });
}

export async function getEntriesForResponse(formId: string, responseId: string): Promise<AuditEntry[]> {
  const items = await queryListItems<AuditLogFields>(LIST_NAMES.auditLog, {
    filter: `fields/FormId eq '${odataQuote(formId)}' and fields/ResponseId eq '${odataQuote(responseId)}'`,
  });
  return items
    .map((item) => ({
      id: item.id,
      at: item.fields.At,
      byUpn: item.fields.ByEmail,
      action: item.fields.Action,
      changedFields: JSON.parse(item.fields.ChangedFieldsJson || "[]"),
      reason: item.fields.Reason || undefined,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}
