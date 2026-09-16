import type { BrandingConfig, FormDefinition } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";

interface Props {
  form: FormDefinition;
}

const PALETTE = [
  "#4f46e5", // indigo (default)
  "#0f766e", // teal
  "#b45309", // amber
  "#be123c", // rose
  "#1d4ed8", // blue
  "#15803d", // green
  "#7c3aed", // violet
  "#334155", // slate
];

export function BrandingPanel({ form }: Props) {
  const { updateForm } = useFormBuilderStore();

  function setBranding(updates: Partial<BrandingConfig>) {
    updateForm({ branding: { ...form.branding, ...updates } });
  }

  function setConfirmation(updates: Partial<BrandingConfig["confirmation"]>) {
    setBranding({ confirmation: { ...form.branding.confirmation, ...updates } });
  }

  return (
    <div className="panel">
      <h3>Theme color</h3>
      <div className="color-swatches">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch ${form.branding.themeColor === color ? "is-selected" : ""}`}
            style={{ background: color }}
            onClick={() => setBranding({ themeColor: color })}
            title={color}
          />
        ))}
      </div>
      <div className="field-row">
        <label htmlFor="theme-hex">Custom hex color</label>
        <input
          id="theme-hex"
          type="text"
          value={form.branding.themeColor ?? ""}
          onChange={(e) => setBranding({ themeColor: e.target.value })}
          placeholder="#4f46e5"
        />
      </div>

      <h3>Logo &amp; header image</h3>
      <div className="field-row">
        <label htmlFor="logo-url">Logo URL</label>
        <input
          id="logo-url"
          type="url"
          value={form.branding.logoUrl ?? ""}
          onChange={(e) => setBranding({ logoUrl: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div className="field-row">
        <label htmlFor="header-url">Header/cover image URL</label>
        <input
          id="header-url"
          type="url"
          value={form.branding.headerImageUrl ?? ""}
          onChange={(e) => setBranding({ headerImageUrl: e.target.value })}
          placeholder="https://…"
        />
      </div>

      <h3>Submit &amp; confirmation</h3>
      <div className="field-row">
        <label htmlFor="submit-text">Submit button text</label>
        <input
          id="submit-text"
          type="text"
          value={form.branding.submitButtonText ?? ""}
          onChange={(e) => setBranding({ submitButtonText: e.target.value })}
          placeholder="Submit"
        />
      </div>
      <div className="field-row">
        <label>
          <input
            type="radio"
            name="confirmation-mode"
            checked={form.branding.confirmation.mode === "message"}
            onChange={() => setConfirmation({ mode: "message" })}
          />{" "}
          Show a thank-you message
        </label>
        <label>
          <input
            type="radio"
            name="confirmation-mode"
            checked={form.branding.confirmation.mode === "redirect"}
            onChange={() => setConfirmation({ mode: "redirect" })}
          />{" "}
          Redirect to a URL
        </label>
      </div>

      {form.branding.confirmation.mode === "message" ? (
        <div className="field-row">
          <label htmlFor="confirmation-message">Thank-you message</label>
          <textarea
            id="confirmation-message"
            value={form.branding.confirmation.message ?? ""}
            onChange={(e) => setConfirmation({ message: e.target.value })}
          />
        </div>
      ) : (
        <div className="field-row">
          <label htmlFor="confirmation-redirect">Redirect URL</label>
          <input
            id="confirmation-redirect"
            type="url"
            value={form.branding.confirmation.redirectUrl ?? ""}
            onChange={(e) => setConfirmation({ redirectUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
      )}
    </div>
  );
}
