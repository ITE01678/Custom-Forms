import { useEffect, useRef } from "react";
import { sanitizeHtml } from "../../lib/sanitizeHtml";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TEXT_COLORS = ["#1a1a24", "#dc2626", "#2563eb", "#16a34a", "#7c3aed"];
const HIGHLIGHT_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca"];

/** Small contentEditable-backed formatting toolbar for descriptions (form
 *  and section) — bold/italic/underline, alignment, bullets, text color,
 *  and highlight. Deliberately not a heavyweight editor library (this app
 *  already carries a ~1MB spreadsheet library for the Excel-as-datastore
 *  feature; a full rich-text package would add another big chunk for a
 *  handful of buttons) — `document.execCommand`, while long-deprecated in
 *  spec terms, remains functional in every current browser and is the
 *  simplest way to get real formatting without one. Output is sanitized
 *  (lib/sanitizeHtml.ts) on every change, not just on save. */
export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Only push prop -> DOM when the value changed from OUTSIDE this editor
  // (e.g. switching which field is selected in the builder) — never on
  // every keystroke, which would fight the browser's own cursor position.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    // hiliteColor isn't universally supported (older Firefox/Safari use
    // backColor instead) — fall back rather than silently doing nothing.
    if (command === "hiliteColor" && !document.execCommand("hiliteColor", false, arg)) {
      document.execCommand("backColor", false, arg);
    } else if (command !== "hiliteColor") {
      document.execCommand(command, false, arg);
    }
    handleInput();
  }

  function handleInput() {
    if (!ref.current) return;
    onChange(sanitizeHtml(ref.current.innerHTML));
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-editor__toolbar">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} title="Bold">
          <b>B</b>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} title="Italic">
          <i>I</i>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          title="Underline"
        >
          <u>U</u>
        </button>
        <span className="rich-text-editor__divider" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyLeft")}
          title="Align left"
        >
          ⯇
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyCenter")}
          title="Align center"
        >
          ☰
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("justifyRight")}
          title="Align right"
        >
          ⯈
        </button>
        <span className="rich-text-editor__divider" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
          title="Bullet list"
        >
          • ≡
        </button>
        <span className="rich-text-editor__divider" />
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="rich-text-editor__swatch"
            style={{ background: c }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("foreColor", c)}
            title="Text color"
          />
        ))}
        <span className="rich-text-editor__divider" />
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="rich-text-editor__swatch"
            style={{ background: c }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("hiliteColor", c)}
            title="Highlight"
          />
        ))}
      </div>
      <div
        ref={ref}
        className="rich-text-editor__surface"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  );
}
