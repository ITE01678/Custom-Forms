import type { ConditionNode } from "./condition";

export type FormStatus = "draft" | "published" | "archived";

export interface FormDefinition {
  id: string; // stable UUID, never changes across edits
  slug: string; // public URL slug
  status: FormStatus;
  currentDraftVersion: number; // increments every save while unpublished
  latestPublishedVersion: number | null; // pointer into FormVersion history
  title: string;
  description?: string;
  owner: { upn: string; displayName?: string };
  createdAt: string; // ISO
  updatedAt: string;
  branding: BrandingConfig;
  editPolicy: EditPolicyConfig;
  sharing: SharingConfig;
  settings: FormSettings;
  sections: FormSection[];
}

/** MS-Forms-style form-level settings (Settings tab). */
export interface FormSettings {
  /** "anyoneInOrg" = any signed-in @allowed-domain user; "specificPeople" =
   *  only emails in `allowedEmails` (still requires the org-domain sign-in). */
  responseAccess: "anyoneInOrg" | "specificPeople";
  allowedEmails?: string[];
  /** Randomizes section presentation order for respondents who hit a plain
   *  "next section in order" fallback (branchRules/defaultNext still take
   *  priority — shuffle only affects the un-configured natural-order path). */
  shuffleSections?: boolean;
  showProgressBar: boolean;
  /** Accept-responses window — outside it, the fill-out route shows a
   *  "not open" / "closed" message instead of the runtime. */
  opensAt?: string;
  closesAt?: string;
}

/** Immutable snapshot taken on Publish — see formsSchema/branching.ts and
 *  services/forms.ts for how responses pin themselves to one of these. */
export interface FormVersion {
  formId: string;
  version: number;
  schema: FormDefinition;
  publishedAt: string;
  publishedBy: string; // upn
}

export interface BranchRule {
  id: string;
  when: ConditionNode;
  goTo: string; // sectionId
}

export interface FormSection {
  id: string; // stable id, referenced by conditions/branchRules
  title: string;
  description?: string;
  imageUrl?: string; // optional section header image, like MS Forms' section media
  order: number;
  visibility?: ConditionNode; // whole section skipped if this evaluates false
  branchRules?: BranchRule[]; // evaluated on "Next" from this section
  defaultNext?: string; // sectionId fallback if no branchRule matches
  fields: FormField[];
}

export type FieldType =
  | "shortText"
  | "longText"
  | "email"
  | "singleChoice"
  | "multiChoice"
  | "date"
  | "dateTime"
  | "number"
  | "rating"
  | "fileUpload"
  | "repeatingTable";

export type FillMode = "manual" | "graph-autofill" | "connector-autofill";

export interface RepeatingTableColumn {
  key: string;
  label: string;
  type: "text" | "number" | "date";
}

export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  fileTypes?: string[];
  maxFileSizeMb?: number;
  maxFiles?: number;
  customMessage?: string;
}

export interface GraphAutofillConfig {
  /** "self-profile" reads the signed-in respondent's own Entra profile;
   *  "self-manager" reads their manager's profile instead (e.g. auto-fill an
   *  approver's name/email) — both use the same already-granted
   *  User.Read/User.Read.All scopes, no extra permission needed. */
  source: "self-profile" | "self-manager";
  /** A property name off services/users.ts's EntraProfile (department,
   *  mobilePhone, city, ...) — kept as `string` here since formsSchema is
   *  framework/service-agnostic; the concrete key list lives in the builder
   *  UI and useAutofill, not in this type. */
  graphProperty: string;
  refreshOnLoad?: boolean;
  /** Lets the respondent flip this field to manual entry instead of trusting
   *  the auto-filled value — on by default. */
  allowManualOverride?: boolean;
}

export type ConnectorType =
  | "graph-profile"
  | "graph-directReports"
  | "excel-lookup"
  | "sharepoint-list-query"
  | "power-automate-proxy";

export interface ConnectorOutputField {
  key: string; // connector's output column/key, e.g. "employeeId"
  label: string;
  type: "text" | "number" | "date";
}

export interface ConnectorAutofillConfig {
  connectorId: string; // references a ConnectorConfigs List entry
  connectorType: ConnectorType;
  /** Template resolved against { respondent, fields } before being handed to
   *  the connector, e.g. "{{fields.department.value}}" or "{{respondent.department}}". */
  lookupKeyExpression: string;
  outputMapping: ConnectorOutputField[];
  expectMultipleRows: boolean;
  emptyResultBehavior: "showEmptyTable" | "hideField" | "showMessage";
  errorBehavior: "blockSubmit" | "showWarningAllowManualOverride" | "showErrorAllowRetry";
  cacheTtlSeconds?: number;
  /** Lets the respondent flip this field to manual entry instead of trusting
   *  the auto-filled value/rows — on by default. */
  allowManualOverride?: boolean;
}

export interface FormField {
  id: string; // stable, immutable — used as the response answer key & condition target
  type: FieldType;
  label: string;
  helpText?: string;
  placeholder?: string;
  order: number;
  fillMode: FillMode;
  readOnly?: boolean; // usually true when fillMode !== 'manual'
  options?: { value: string; label: string }[]; // choice types
  allowOther?: boolean; // choice types — adds a free-text "Other" option, MS-Forms style
  shuffleOptions?: boolean; // choice types — randomize option order per respondent
  columns?: RepeatingTableColumn[]; // repeatingTable type
  validation?: FieldValidation;
  visibility?: ConditionNode; // field-level show/hide
  graphAutofill?: GraphAutofillConfig; // when fillMode = graph-autofill
  connectorAutofill?: ConnectorAutofillConfig; // when fillMode = connector-autofill
}

export interface BrandingConfig {
  logoUrl?: string;
  headerImageUrl?: string;
  themeColor?: string; // hex
  background?: {
    type: "default" | "color" | "image";
    color?: string; // hex, used when type === "color"
    imageUrl?: string; // used when type === "image"
  };
  submitButtonText?: string; // default "Submit"
  confirmation: { mode: "message" | "redirect"; message?: string; redirectUrl?: string };
}

export interface EditPolicyConfig {
  mode: "none" | "self-edit" | "admin-only" | "self-and-admin";
  selfEditWindow?: { type: "unlimited" | "days"; days?: number };
  requireReasonForEdit?: boolean;
  notifyAdminOnEdit?: boolean;
}

export interface SharingConfig {
  slug: string;
  requireAuth: true; // org is domain-restricted; always true
  linkExpiresAt?: string;
}

/** One row of a resolved connector-autofill repeatingTable, snapshotted at
 *  submit time so later HR-data changes don't retroactively alter history. */
export interface RepeatingTableValue {
  rows: Array<Record<string, string | number | null>>;
  meta: { source: "connector" | "manual"; connectorId: string; fetchedAt: string; rowCount: number };
}

/** A file uploaded for a fileUpload field — stored in the "Attachments"
 *  SharePoint library (services/attachments.ts), never inline in Excel. */
export interface FileAttachment {
  name: string;
  url: string;
  size: number;
}

export type AnswerValue = string | number | boolean | string[] | null | RepeatingTableValue | FileAttachment[];

export interface AuditEntry {
  id: string;
  at: string;
  byUpn: string;
  action: "submit" | "self-edit" | "admin-edit";
  changedFields: { fieldId: string; oldValue: unknown; newValue: unknown }[];
  reason?: string;
}

export type ResponseStatus = "draft" | "submitted";

export interface FormResponse {
  id: string;
  formId: string;
  formVersion: number; // pins the schema this response is valid under
  respondentUpn: string; // primary key for "my response" lookups
  answers: Record<string, AnswerValue>; // keyed by fieldId
  status: ResponseStatus;
  submittedAt?: string;
  updatedAt: string;
  editHistory: AuditEntry[];
}
