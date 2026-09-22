import type { ConditionNode } from "./condition";

export type FormStatus = "draft" | "published" | "archived";

export interface FormDefinition {
  id: string; // stable UUID, never changes across edits
  slug: string; // public URL slug
  status: FormStatus;
  currentDraftVersion: number; // increments every save while unpublished
  latestPublishedVersion: number | null; // pointer into FormVersion history
  title: string;
  titleStyle?: TextStyle;
  /** Sanitized HTML — see FormSection.description's doc comment; same rules. */
  description?: string;
  owner: { upn: string; displayName?: string };
  createdAt: string; // ISO
  updatedAt: string;
  branding: BrandingConfig;
  editPolicy: EditPolicyConfig;
  sharing: SharingConfig;
  settings: FormSettings;
  /** Optional "send to" approval chain — undefined/mode "none" means no
   *  routing, matching every form that existed before this was added. */
  routing?: RoutingConfig;
  sections: FormSection[];
}

/** One step in an approval chain — either a fixed list the designer typed
 *  in, or (when the designer allows it) read from the respondent's own
 *  answer to an "approverEmail"-type field placed in the form. */
export interface RoutingStep {
  id: string;
  recipientSource: "designer" | "respondent-field";
  recipients?: string[]; // used when recipientSource === "designer"
  fieldId?: string; // used when recipientSource === "respondent-field" — an approverEmail field's id
  /** Which sections THIS stage's actor can edit — undefined/empty means no
   *  restriction (can edit every section, the pre-existing default
   *  behavior). Sections outside this list are still shown for context
   *  (read-only) as long as an earlier stage could see/edit them — see
   *  formsSchema/routingAccess.ts for the exact visibility rule. */
  editableSectionIds?: string[];
}

export interface RoutingConfig {
  /** "single"/"multiple" both use steps[0] — "multiple" just means more than
   *  one recipient in that one step, first to act completes it. "sequential"
   *  uses the full ordered `steps` list, one recipient set per stage. */
  mode: "none" | "single" | "multiple" | "sequential";
  steps: RoutingStep[];
  /** Restricts what the ORIGINAL respondent can fill in before routing even
   *  starts — e.g. "the first person only fills Part A." Undefined/empty
   *  means no restriction (every section), matching every form that
   *  existed before this was added. */
  initialSectionIds?: string[];
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

/** Whole-text formatting for a title/label — deliberately NOT rich/mixed
 *  formatting (that's what `description` fields use instead, as sanitized
 *  HTML from RichTextEditor): a field label or section/form title doubles
 *  as an identifier (Excel column header, dropdown option, audit trail
 *  text), so it has to stay plain, greppable text — styling is layered on
 *  top as metadata, never baked into the string itself. */
export interface TextStyle {
  color?: string; // hex
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  highlightColor?: string; // hex background highlight
}

export interface FormSection {
  id: string; // stable id, referenced by conditions/branchRules
  title: string;
  titleStyle?: TextStyle;
  /** Sanitized HTML (RichTextEditor) — bold/italic/underline/bullets/
   *  highlight/color/alignment. Safe to render as-is (already sanitized on
   *  save AND again defensively on render, see lib/sanitizeHtml.ts) — plain
   *  text with no markup still renders correctly, so this stays backward
   *  compatible with every section created before rich text existed. */
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
  | "approverEmail"
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
  /** Choice-type fields only (singleChoice/multiChoice): instead of
   *  auto-filling a single value, the connector's resolved rows become this
   *  field's selectable OPTIONS at fill time — e.g. "find every employee
   *  whose HOD Mail matches me, let the respondent pick which ones,"
   *  replacing whatever static options the designer typed in the builder.
   *  valueKey/labelKey name which column of each resolved row (the
   *  connector's own output column names — for excel-lookup, the source
   *  sheet's header names) becomes the option's stored value vs its
   *  displayed label. */
  dynamicOptions?: { valueKey: string; labelKey: string };
}

export interface FormField {
  id: string; // stable, immutable — used as the response answer key & condition target
  type: FieldType;
  label: string;
  labelStyle?: TextStyle;
  helpText?: string;
  placeholder?: string;
  order: number;
  fillMode: FillMode;
  readOnly?: boolean; // usually true when fillMode !== 'manual'
  /** Optional per-question image (MS-Forms-style "add media to a question")
   *  — distinct from `options[].imageUrl` (per-choice-answer images) and
   *  from a fileUpload field's own answer data; this is decorative,
   *  attached to the question itself regardless of field type. */
  mediaUrl?: string;
  mediaSizePx?: number; // width in px — default 240
  mediaPosition?: "left" | "center" | "right";
  options?: { value: string; label: string; imageUrl?: string }[]; // choice types
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
  logoSizePx?: number; // logo height in px — default 40
  logoPosition?: "left" | "center" | "right";
  headerImageUrl?: string;
  headerHeightPx?: number; // default 220
  headerFocalPoint?: "top" | "center" | "bottom"; // object-position, which part of a tall image stays visible when cropped
  headerOpacity?: number; // 0-100, default 100
  themeColor?: string; // hex
  background?: {
    type: "default" | "color" | "image";
    color?: string; // hex, used when type === "color"
    imageUrl?: string; // used when type === "image"
    opacity?: number; // 0-100, default 100 — lets the page's base tone show through an image
    fit?: "cover" | "contain" | "tile"; // background-size/repeat preset
  };
  /** Overall card presentation preset — border radius/shadow/accent-bar
   *  combination, the closest thing to MS Forms' "theme" picker beyond a
   *  single accent color. */
  cardStyle?: "rounded" | "sharp" | "elevated" | "flat" | "bordered";
  /** Whole-form font stack — applies across the runtime card, not just one
   *  piece of text (per-title/per-label overrides in TextStyle still win). */
  fontFamily?: string;
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
  action: "submit" | "self-edit" | "admin-edit" | "approver-edit" | "route" | "approve" | "reject";
  changedFields: { fieldId: string; oldValue: unknown; newValue: unknown }[];
  reason?: string;
}

export type ResponseStatus = "draft" | "submitted";

/** One recorded action in a response's approval chain — kept separately
 *  from AuditEntry (which is form-wide edit history) since this is
 *  specifically the routing state machine's own trail. */
export interface RoutingHistoryEntry {
  stepId: string;
  actedBy: string;
  action: "approved" | "rejected";
  at: string;
  reason?: string;
}

/** A response's live position in its form's approval chain — absent
 *  entirely for a form with no routing configured. Persisted in the
 *  ResponseRouting SharePoint List (services/responseRouting.ts), not in
 *  the Excel row, so existing workbooks never need a schema change. */
export interface ResponseRoutingState {
  currentStepIndex: number;
  status: "in-progress" | "approved" | "rejected";
  history: RoutingHistoryEntry[];
}

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
  routing?: ResponseRoutingState;
}
