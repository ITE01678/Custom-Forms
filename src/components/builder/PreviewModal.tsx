import { useState } from "react";
import { FillRunner } from "../runtime/FillRunner";
import { RuntimeShell } from "../runtime/RuntimeShell";
import type { FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
  onClose: () => void;
}

type Device = "desktop" | "mobile";

/**
 * Runs the exact same FillRunner the live /f/:slug route uses, against the
 * in-memory draft — so what you preview here is guaranteed to match what a
 * respondent will actually see once published, per the plan's Builder UX note.
 * Nothing here is persisted: "submit" just flips to a "preview complete" card.
 * A Desktop/Mobile toggle (MS Forms has the same) previews responsive layout
 * without needing an actual phone.
 */
export function PreviewModal({ form, onClose }: Props) {
  const [done, setDone] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  // Stable per-preview-session id, purely so file-upload fields have
  // somewhere consistent to upload test files during preview.
  const [previewResponseId] = useState(() => crypto.randomUUID());

  return (
    <div className="preview-modal">
      <div className="preview-modal__bar">
        <span>Preview — nothing you submit here is saved</span>
        <span className="fill-source-toggle">
          <button type="button" className={device === "desktop" ? "is-active" : ""} onClick={() => setDevice("desktop")}>
            🖥 Desktop
          </button>
          <button type="button" className={device === "mobile" ? "is-active" : ""} onClick={() => setDevice("mobile")}>
            📱 Mobile
          </button>
        </span>
        <button onClick={onClose}>Close preview ✕</button>
      </div>
      <div className="preview-modal__body">
        <div className={device === "mobile" ? "preview-modal__frame--mobile" : ""}>
          {done ? (
            <RuntimeShell title="" branding={form.branding}>
              <div className="submitted-card">
                <div className="submitted-card__icon">✓</div>
                <h1>Preview complete</h1>
                <p>{form.branding.confirmation.message ?? "Your response has been recorded."}</p>
                <button onClick={onClose}>Back to builder</button>
              </div>
            </RuntimeShell>
          ) : (
            <FillRunner form={form} responseId={previewResponseId} onSubmit={async () => setDone(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
