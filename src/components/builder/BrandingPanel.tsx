import type { BrandingConfig, FormDefinition } from "../../formsSchema/types";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";
import { MediaUploadField } from "./MediaUploadField";

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

const CARD_STYLES: { value: NonNullable<BrandingConfig["cardStyle"]>; label: string; description: string }[] = [
  { value: "rounded", label: "Rounded (default)", description: "Soft corners, a gentle shadow — the current look." },
  { value: "sharp", label: "Sharp", description: "Square corners for a crisper, more formal feel." },
  { value: "elevated", label: "Elevated", description: "A deeper shadow that lifts the card off the page." },
  { value: "flat", label: "Flat", description: "No shadow at all — sits flush with the background." },
  { value: "bordered", label: "Bordered", description: "A visible outline instead of a shadow, minimal and print-friendly." },
];

const FONT_STACKS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Classic serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Modern sans", value: "'Segoe UI', system-ui, sans-serif" },
  { label: "Friendly rounded", value: "'Trebuchet MS', 'Nunito', sans-serif" },
  { label: "Technical mono", value: "'Cascadia Code', 'Courier New', monospace" },
];

export function BrandingPanel({ form }: Props) {
  const { updateForm } = useFormBuilderStore();

  function setBranding(updates: Partial<BrandingConfig>) {
    updateForm({ branding: { ...form.branding, ...updates } });
  }

  function setConfirmation(updates: Partial<BrandingConfig["confirmation"]>) {
    setBranding({ confirmation: { ...form.branding.confirmation, ...updates } });
  }

  function setBackground(updates: Partial<NonNullable<BrandingConfig["background"]>>) {
    setBranding({ background: { type: "default", ...form.branding.background, ...updates } });
  }

  const backgroundType = form.branding.background?.type ?? "default";

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

      <h3>Design style</h3>
      <div className="card-style-grid">
        {CARD_STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`card-style-option ${(form.branding.cardStyle ?? "rounded") === s.value ? "is-selected" : ""}`}
            onClick={() => setBranding({ cardStyle: s.value })}
          >
            <span className={`card-style-option__preview card-style-option__preview--${s.value}`} />
            <strong>{s.label}</strong>
            <span>{s.description}</span>
          </button>
        ))}
      </div>
      <div className="field-row">
        <label htmlFor="font-family">Form font</label>
        <select
          id="font-family"
          value={form.branding.fontFamily ?? ""}
          onChange={(e) => setBranding({ fontFamily: e.target.value || undefined })}
        >
          {FONT_STACKS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <h3>Logo</h3>
      <MediaUploadField
        formId={form.id}
        kind="logo"
        label="Logo"
        value={form.branding.logoUrl}
        onChange={(url) => setBranding({ logoUrl: url })}
      />
      {form.branding.logoUrl && (
        <div className="field-row field-row--inline">
          <label>
            Size ({form.branding.logoSizePx ?? 40}px)
            <input
              type="range"
              min={24}
              max={120}
              value={form.branding.logoSizePx ?? 40}
              onChange={(e) => setBranding({ logoSizePx: Number(e.target.value) })}
            />
          </label>
          <label>
            Position
            <select
              value={form.branding.logoPosition ?? "left"}
              onChange={(e) => setBranding({ logoPosition: e.target.value as BrandingConfig["logoPosition"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </div>
      )}

      <h3>Header image</h3>
      <MediaUploadField
        formId={form.id}
        kind="header"
        label="Header/cover image"
        value={form.branding.headerImageUrl}
        onChange={(url) => setBranding({ headerImageUrl: url })}
      />
      {form.branding.headerImageUrl && (
        <div className="field-row field-row--inline">
          <label>
            Height ({form.branding.headerHeightPx ?? 220}px)
            <input
              type="range"
              min={100}
              max={400}
              step={10}
              value={form.branding.headerHeightPx ?? 220}
              onChange={(e) => setBranding({ headerHeightPx: Number(e.target.value) })}
            />
          </label>
          <label>
            Focus
            <select
              value={form.branding.headerFocalPoint ?? "center"}
              onChange={(e) => setBranding({ headerFocalPoint: e.target.value as BrandingConfig["headerFocalPoint"] })}
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <label>
            Opacity ({form.branding.headerOpacity ?? 100}%)
            <input
              type="range"
              min={20}
              max={100}
              value={form.branding.headerOpacity ?? 100}
              onChange={(e) => setBranding({ headerOpacity: Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      <h3>Form background</h3>
      <div className="field-row">
        <label>
          <input
            type="radio"
            name="background-type"
            checked={backgroundType === "default"}
            onChange={() => setBackground({ type: "default" })}
          />{" "}
          Default
        </label>
        <label>
          <input
            type="radio"
            name="background-type"
            checked={backgroundType === "color"}
            onChange={() => setBackground({ type: "color" })}
          />{" "}
          Solid color
        </label>
        <label>
          <input
            type="radio"
            name="background-type"
            checked={backgroundType === "image"}
            onChange={() => setBackground({ type: "image" })}
          />{" "}
          Image
        </label>
      </div>

      {backgroundType === "color" && (
        <div className="field-row">
          <label htmlFor="background-color">Background color</label>
          <input
            id="background-color"
            type="color"
            value={form.branding.background?.color ?? "#f8fafc"}
            onChange={(e) => setBackground({ color: e.target.value })}
          />
        </div>
      )}

      {backgroundType === "image" && (
        <>
          <MediaUploadField
            formId={form.id}
            kind="background"
            label="Background image"
            value={form.branding.background?.imageUrl}
            onChange={(url) => setBackground({ imageUrl: url })}
          />
          {form.branding.background?.imageUrl && (
            <div className="field-row field-row--inline">
              <label>
                Style
                <select
                  value={form.branding.background?.fit ?? "cover"}
                  onChange={(e) => setBackground({ fit: e.target.value as NonNullable<BrandingConfig["background"]>["fit"] })}
                >
                  <option value="cover">Fill (cover)</option>
                  <option value="contain">Fit whole image</option>
                  <option value="tile">Tiled pattern</option>
                </select>
              </label>
              <label>
                Opacity ({form.branding.background?.opacity ?? 100}%)
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={form.branding.background?.opacity ?? 100}
                  onChange={(e) => setBackground({ opacity: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
        </>
      )}

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
