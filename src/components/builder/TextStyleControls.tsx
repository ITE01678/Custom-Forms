import type { TextStyle } from "../../formsSchema/types";

interface Props {
  value: TextStyle | undefined;
  onChange: (style: TextStyle | undefined) => void;
}

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Rounded", value: "'Segoe UI', system-ui, sans-serif" },
  { label: "Mono", value: "'Cascadia Code', 'Courier New', monospace" },
];

const TEXT_COLORS = ["", "#dc2626", "#2563eb", "#16a34a", "#7c3aed", "#d97706"];
const HIGHLIGHT_COLORS = ["", "#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca"];

/** Whole-text styling (not mixed/rich formatting — see TextStyle's doc
 *  comment for why) for a form title, section title, or field label:
 *  bold/italic/underline, alignment, font, color, highlight. */
export function TextStyleControls({ value, onChange }: Props) {
  const style = value ?? {};

  function set(updates: Partial<TextStyle>) {
    const next = { ...style, ...updates };
    const isEmpty =
      !next.color &&
      !next.fontFamily &&
      !next.bold &&
      !next.italic &&
      !next.underline &&
      !next.highlightColor &&
      (!next.align || next.align === "left");
    onChange(isEmpty ? undefined : next);
  }

  return (
    <div className="text-style-controls">
      <button type="button" className={style.bold ? "is-active" : ""} onClick={() => set({ bold: !style.bold })} title="Bold">
        <b>B</b>
      </button>
      <button
        type="button"
        className={style.italic ? "is-active" : ""}
        onClick={() => set({ italic: !style.italic })}
        title="Italic"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={style.underline ? "is-active" : ""}
        onClick={() => set({ underline: !style.underline })}
        title="Underline"
      >
        <u>U</u>
      </button>
      <select value={style.align ?? "left"} onChange={(e) => set({ align: e.target.value as TextStyle["align"] })} title="Alignment">
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
      <select value={style.fontFamily ?? ""} onChange={(e) => set({ fontFamily: e.target.value || undefined })} title="Font">
        {FONT_OPTIONS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <span className="text-style-controls__label">Color</span>
      {TEXT_COLORS.map((c) => (
        <button
          key={c || "default"}
          type="button"
          className={`text-style-controls__swatch ${!c ? "text-style-controls__swatch--none" : ""} ${style.color === c ? "is-active" : ""}`}
          style={c ? { background: c } : undefined}
          onClick={() => set({ color: c || undefined })}
          title={c || "Default"}
        />
      ))}
      <span className="text-style-controls__label">Highlight</span>
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c || "none"}
          type="button"
          className={`text-style-controls__swatch ${!c ? "text-style-controls__swatch--none" : ""} ${style.highlightColor === c ? "is-active" : ""}`}
          style={c ? { background: c } : undefined}
          onClick={() => set({ highlightColor: c || undefined })}
          title={c || "None"}
        />
      ))}
    </div>
  );
}
