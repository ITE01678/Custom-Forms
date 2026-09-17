import { useAuth } from "../auth/useAuth";

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
          <button className="btn-primary landing__cta" onClick={() => login()}>
            Sign in with Microsoft
          </button>
        )}
        <p className="landing__note">Sign-in is restricted to your organization's official Microsoft 365 accounts.</p>
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
    </div>
  );
}
