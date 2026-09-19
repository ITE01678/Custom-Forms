# Setup — one-time manual steps

This app has no server and no database of its own — it's a static SPA that talks
directly to Microsoft Graph with the signed-in user's own permissions. Everything
below is free / already covered by the org's M365 license. See
`.claude/plans` (or ask whoever ran the planning session) for the full
architecture rationale.

Do these once, in order, before the app can do anything beyond show a login screen.

## 1. Azure App Registration

Azure Portal → **Microsoft Entra ID → App registrations → New registration**

- Name: `Custom Forms`
- Supported account types: **Single tenant** (this org only)
- Redirect URI: platform **Single-page application (SPA)**, URI `http://localhost:5173`
  (add `https://form.jil-jupiter.com` later, once step 3 is done)

Then, on the new registration:

- **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:
  - `openid`, `profile`, `email`, `User.Read` (sign-in + own profile — no consent needed)
  - `User.Read.All` (read colleagues' department/employeeId/manager/directReports —
    **needs "Grant admin consent" clicked by a tenant admin**, once)
  - `Sites.Manage.All` (create new Lists/libraries and read/write everything
    in the site — the app auto-provisions its own structure on first run,
    which needs the stronger "manage" permission, not just "read/write" —
    **needs admin consent**, once). A Graph scope is required on the token
    regardless of the signed-in user's own SharePoint permissions; the scope
    and the site ACL are two independent checks.
  - `Sites.ReadWrite.All` was tried at one point to work around a persistent
    "Could not obtain a WAC access token" error on the response workbook.
    It turned out not to be a permission problem at all — Graph's Excel
    Workbook REST API (`/workbook/...`, backed by Office Online Server) just
    cannot negotiate a session for this data in this tenant, under any
    scope. The app no longer calls that API at all — response workbooks are
    read/written as plain file bytes (`/content` GET+PUT) and parsed
    client-side instead (see `services/excel.ts`), which only needs
    `Sites.Manage.All` above. If you already added `Sites.ReadWrite.All`
    it's harmless to leave in place, just no longer required.
  - `Mail.Send` (lets the optional "send to" approval-routing feature notify
    the next approver, or the original respondent once a chain resolves —
    **needs admin consent**, once). There's no service account: a
    notification always sends as whichever signed-in user just took the
    action (submitted / approved / rejected), via their own mailbox. If a
    send fails (missing consent, offline, etc.) the underlying submit/
    approve/reject action still succeeds — the email is best-effort only,
    with no retry queue in this version.
- **Authentication**: confirm "Allow public client flows" is enabled if prompted
  (this is a public client — no secret, nothing to protect on a static site)
- Restrict who can sign in: **Enterprise applications → Custom Forms → Properties →
  "Assignment required? = Yes"**, then assign an internal security group. This is
  belt-and-suspenders alongside the app's own `@jil-jupiter.com` check in code.

Copy the **Application (client) ID** and **Directory (tenant) ID** from the
registration's Overview page — you'll need them in steps 3 and 4.

## 2. SharePoint site

Create (or reuse) a SharePoint site dedicated to holding this app's data — it
does **not** need to be named "Forms"; point `VITE_SHAREPOINT_HOSTNAME` /
`VITE_SHAREPOINT_SITE_PATH` (step 4) at whatever site you use.

That's it for manual setup here — the app **auto-provisions its own structure**
the first time it successfully talks to that site (`services/bootstrap.ts`):

- Lists: `Forms` (metadata + draft schema JSON), `SyncQueue` (durability layer),
  `ResponseIndex` (Excel row-index cache), `AuditLog` (edit history),
  `ConnectorConfigs` (data-source connector definitions), `Drafts`
  ("save and finish later," keyed by form + submitter email), `ResponseRouting`
  (approval-chain state per response, for forms with "send to" routing
  configured — see the Approval routing section below).
- Document libraries: `ResponseWorkbooks` (one `.xlsx` per form — **created at
  Publish time, not before**), `FormVersions` (immutable JSON snapshot per
  publish), and `Attachments` (fileUpload field uploads).

Bootstrap is idempotent (checks before creating) and safe to leave running on
every load — nothing to run by hand. Exact columns are in `src/services/bootstrap.ts`
if you'd rather pre-create the lists yourself.

Grant the security group used above at least **Edit/Contribute** on the site so
signed-in users can read/write via their own delegated Graph token (including
creating the Lists/libraries themselves on first run) — there's no app-only
credential to grant broader access instead.

**Security note:** the `ConnectorConfigs` list can hold connection details for
external data sources (e.g. a Power Automate flow URL, which acts like a bearer
token). If you add any connector whose config shouldn't be readable by every
form-filling user, restrict that list's permissions to admins only (List settings
→ Permissions for this list → stop inheriting → remove ordinary members) — the
app itself doesn't enforce this, SharePoint permissions do.

### Troubleshooting: "I published a form but there's no Excel file or List"

Two separate things have to each succeed, in order:

1. **The app has to be able to reach the site at all.** This needs a correct
   `VITE_SHAREPOINT_SITE_PATH` — it must be a bare **path**, not a full URL:
   - right: `/sites/Forms`
   - wrong: `https://jupiterkolkata.sharepoint.com/sites/Forms`

   Graph resolves the site as `/sites/{VITE_SHAREPOINT_HOSTNAME}:{VITE_SHAREPOINT_SITE_PATH}`
   — if `SITE_PATH` is a full URL, that request is malformed and every list/
   workbook operation fails silently-ish (surfaces as an error banner on the
   Dashboard/builder, easy to miss). Fix the env var and reload.
2. **Lists appear as soon as any form-service call succeeds** (e.g. opening
   the Dashboard) — check the site for `Forms`, `SyncQueue`, etc. **The Excel
   workbook for a specific form only appears once you Publish that form** —
   creating/saving a draft does not create it. If you published before fixing
   issue 1, just open the form in the builder and click Publish again once
   the env var is corrected (it's idempotent — safe to re-publish).

## 3. Master/reference data used by connectors (e.g. an HR roster)

This is separate from the app's own auto-provisioned structure — connectors
read data **you** provide, from wherever you put it. For the built-in
`excel-lookup` connector type, that means a document library **inside the
same SharePoint site from step 2**:

1. In that site, create a document library for shared reference files (any
   name, e.g. `SharedData`) — or reuse an existing one already in that site.
2. Upload your master file (e.g. `hr-roster.xlsx`) into it.
3. Open the file → select the header + data range → **Insert → Table** → give
   the table a name (e.g. `Roster`) → save. The connector reads a named Excel
   **Table**, not a raw range.
4. In the app: **Dashboard → Data source connectors → Add a connector**, type
   "Shared Excel file", config:
   ```json
   {
     "libraryName": "SharedData",
     "itemPath": "hr-roster.xlsx",
     "table": "Roster",
     "keyColumn": "Department"
   }
   ```
5. In the builder, set a field's fill mode to "Auto-fill from a data source
   connector", pick this connector, and set its lookup key (e.g.
   `{{respondent.department}}`) and which column of a matched row to use.

The `sharepoint-list-query` connector type works the same way but reads a
SharePoint List instead of an Excel file (also must live in the same site).
If a source needs a hidden API key instead (no Excel/List access), use the
`power-automate-proxy` connector type — see the note in the app's Connectors
page.

## 4. Hosting: GitHub Pages + subdomain

A deploy workflow is already checked in at `.github/workflows/deploy.yml`,
plus `public/CNAME` (pre-filled with `form.jil-jupiter.com`, copied into every
build's `dist/`).

1. Push this repo to your GitHub repo.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables**, add:
   `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_REDIRECT_URI`
   (`https://form.jil-jupiter.com`), `VITE_ALLOWED_DOMAIN` (`jil-jupiter.com`),
   `VITE_SHAREPOINT_HOSTNAME`, `VITE_SHAREPOINT_SITE_PATH` — same values as your
   `.env.local` (step 5), with `VITE_SHAREPOINT_SITE_PATH` as a bare path (see
   the troubleshooting note above). These aren't secrets in the security sense
   (nothing here is a credential — see the top of this file), but Actions
   variables are the standard place for per-environment build config.
4. Push to `main` — the workflow builds and deploys automatically from then on.
5. In GoDaddy DNS for `jil-jupiter.com`, add a **CNAME**: `form` →
   `<github-username>.github.io`.
6. Back in the Azure App Registration (step 1), add `https://form.jil-jupiter.com`
   as a second SPA redirect URI.

## 5. Local environment

```
cp .env.local.example .env.local
```

Fill in `VITE_AZURE_CLIENT_ID` / `VITE_AZURE_TENANT_ID` from step 1, and
`VITE_SHAREPOINT_HOSTNAME` / `VITE_SHAREPOINT_SITE_PATH` from step 2 — path
only, see the troubleshooting note above.

The response-workbook template (`public/templates/response-template.xlsx`) is
generated by `node scripts/generate-response-template.mjs` — already run once
and committed; only re-run it if you change the fixed meta columns in
`src/services/excel.ts`.

## 6. Data source connectors (optional, as needed per form)

Once signed in, **Dashboard → Data source connectors** lets you register:
Graph directory lookups, a shared Excel file, a SharePoint List, or — for any
source needing a hidden API key that can't live in browser code — a **Power
Automate flow** with an HTTP request trigger holding the connection/secret.
Form fields then reference a connector by name from the builder's field
settings ("Auto-fill from a data source connector"). See section 3 above for
the concrete Excel-file walkthrough.

## 7. Approval routing / "send to" (optional, per form)

In the builder's **Settings** tab, **Send to / approval routing** lets a
form route a submitted response to one or more people for review before
it's considered final:

- **Send to one approver** / **Send to several people** (first to act
  completes it) / **Sequential chain** (one stage at a time, each stage
  only opens once the previous one has acted).
- Each stage's recipient(s) are either typed in directly by the designer, or
  — if the designer checks "Let the respondent choose who reviews this" —
  answered by the respondent via a new **Approver email** field type placed
  anywhere in the form.
- A recipient gets a best-effort notification email (requires the
  `Mail.Send` permission from step 1) with a link to a pre-filled, editable
  copy of the response, which they can Approve (advances to the next stage,
  or resolves the chain) or Reject (stops the chain).
- There is no bearer token in that link — the responseId is a lookup key
  only. Access is checked by matching the *signed-in* account's email
  against the current stage's recipient list, same security model as
  everything else in this app (org-domain-restricted MSAL sign-in is the
  actual boundary). If the wrong account is signed in, the page says so
  plainly rather than silently failing.
- Notification email is best-effort only in this version: if it fails to
  send (missing consent, the acting user's browser closing mid-request,
  etc.) the underlying submit/approve/reject action still succeeds, but the
  next person in the chain won't be notified automatically — there's no
  retry queue for outbound mail (unlike `SyncQueue` for Excel writes). An
  admin can still see exactly where a response stands via its **Approval
  status** on the response detail page.

---

Until steps 1–5 are done, `npm run dev` will boot and show the login screen, but
sign-in will fail (empty client/tenant ID) — that's expected; the rest of the
codebase (routing, schema, services) can be reviewed/extended without them.
