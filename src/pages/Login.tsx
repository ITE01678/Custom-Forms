import { useAuth } from "../auth/useAuth";
import { stashCurrentPath } from "../auth/postLoginRedirect";

const FEATURES = [
  {
    icon: "🗂️",
    title: "Responses land in real SharePoint Excel",
    body: "No exports, no third-party database — every submission is a row in an actual .xlsx workbook in your SharePoint site, viewable and exportable anytime.",
  },
  {
    icon: "⚡",
    title: "Auto-fill from Microsoft 365, Excel, or SharePoint",
    body: "Pull a respondent's department, employee ID, or manager straight from Entra ID, or wire a field to a shared Excel file, a SharePoint List, or a Power Automate flow.",
  },
  {
    icon: "✏️",
    title: "Editable after submission — fully audited",
    body: "Unlike MS Forms, a response isn't final. Respondents (or admins) can come back and edit it, per a policy you control, with every change logged.",
  },
  {
    icon: "🔀",
    title: "Branching, branding, and a builder that keeps up",
    body: "Conditional sections, validation, theme colors, QR codes, save-and-resume drafts, and file attachments stored in SharePoint — the pieces a real form needs.",
  },
];

const STEPS = [
  { n: "1", title: "Build", body: "Add fields, wire up auto-fill sources, set branding and branching." },
  { n: "2", title: "Share", body: "Publish to get a link and QR code — anyone signed in with an org account can open it." },
  { n: "3", title: "Collect", body: "Responses sync straight into a SharePoint Excel workbook, editable and audited." },
];

const COMPARISON: { label: string; forms: string; custom: string }[] = [
  { label: "Where responses live", forms: "Locked inside Forms/Excel Online export", custom: "A real .xlsx in your own SharePoint site" },
  { label: "Editing after submit", forms: "Not possible", custom: "Yes — per a policy you set, fully audited" },
  { label: "Auto-fill from your systems", forms: "Not supported", custom: "Entra ID, shared Excel, SharePoint Lists, Power Automate" },
  { label: "Hosting & licensing cost", forms: "Included, but closed platform", custom: "$0 extra — runs on infrastructure you already pay for" },
  { label: "Data ownership", forms: "Microsoft-managed store", custom: "Your tenant's SharePoint, your governance" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Where exactly does a response go when someone submits?",
    a: "Straight into a real Excel workbook (one per form) inside a SharePoint document library in your own tenant — not a hidden export, not a third-party database. Open it directly in Excel anytime.",
  },
  {
    q: "Can a respondent or admin fix a mistake after submitting?",
    a: "Yes, if the form's edit policy allows it — self-edit, admin-only, or both, with an optional required reason. Every edit is written to an audit log alongside the original.",
  },
  {
    q: "What does \"auto-fill\" actually pull from?",
    a: "The respondent's own Microsoft 365 profile (department, employee ID, manager, ...), a shared Excel file elsewhere in SharePoint, a SharePoint List, or — for sources needing a hidden key — a Power Automate flow you control.",
  },
  {
    q: "Does this cost anything beyond what we already pay Microsoft for?",
    a: "No. It's a static app hosted on GitHub Pages, signing in with your existing Microsoft 365 accounts, storing everything in a SharePoint site your org already has. No new server, database, or subscription.",
  },
  {
    q: "Who can see or fill out a form?",
    a: "Only people signed in with an account from your organization's Microsoft 365 tenant — sign-in is domain-restricted, the same account you already use for Outlook and Teams.",
  },
];

export function Login() {
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="landing">
      <div className="landing__hero">
        <span className="landing__badge">For Microsoft 365 organizations</span>
        <h1 className="landing__title">Custom Forms</h1>
        <p className="landing__tagline">
          A forms builder like MS Forms — except responses live in your own SharePoint Excel,
          fields auto-fill from data you already have, and nothing is locked once it's submitted.
        </p>
        {isAuthenticated ? (
          <p className="landing__signed-in">You're already signed in — loading your forms…</p>
        ) : (
          <button
            className="btn-primary landing__cta"
            onClick={() => {
              stashCurrentPath();
              login();
            }}
          >
            Sign in with Microsoft
          </button>
        )}
        <p className="landing__note">Sign-in is restricted to your organization's official Microsoft 365 accounts.</p>

        <div className="landing__mockup" aria-hidden="true">
          <div className="mockup-window">
            <div className="mockup-window__bar">
              <span />
              <span />
              <span />
            </div>
            <div className="mockup-window__body">
              <div className="mockup-field">
                <div className="mockup-field__label">
                  Department
                  <span className="autofill-badge">
                    <span className="autofill-badge__dot" />
                    auto-fill
                  </span>
                </div>
                <div className="mockup-field__value">Finance &amp; Accounts</div>
              </div>
              <div className="mockup-field">
                <div className="mockup-field__label">Outing type</div>
                <div className="mockup-field__input" />
              </div>
              <div className="mockup-field">
                <div className="mockup-field__label">
                  Team roster
                  <span className="autofill-badge">
                    <span className="autofill-badge__dot" />
                    auto-fill
                  </span>
                </div>
                <div className="mockup-field__rows">
                  <div className="mockup-field__row" />
                  <div className="mockup-field__row" />
                  <div className="mockup-field__row" />
                </div>
              </div>
              <div className="mockup-window__submit">Submit</div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing__section">
        <h2 className="landing__section-title">What makes this different from MS Forms</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-card__icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="landing__section">
        <h2 className="landing__section-title">How it works</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step__number">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="landing__section">
        <h2 className="landing__section-title">Custom Forms vs. Microsoft Forms</h2>
        <div className="comparison-table__wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th></th>
                <th>Microsoft Forms</th>
                <th>Custom Forms</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="comparison-table__forms">{row.forms}</td>
                  <td className="comparison-table__custom">{row.custom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="landing__section">
        <h2 className="landing__section-title">Frequently asked questions</h2>
        <div className="faq-list">
          {FAQS.map((f) => (
            <details className="faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <footer className="landing__footer">
        <p>Custom Forms — built on Microsoft 365 infrastructure your organization already has.</p>
      </footer>
    </div>
  );
}
