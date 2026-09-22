import type { CSSProperties } from "react";
import type { TextStyle } from "../formsSchema/types";

/** Converts a whole-text style (form title / section title / field label)
 *  into inline CSS — kept separate from TextStyle itself since formsSchema
 *  stays framework-agnostic (no React import there). */
export function textStyleToCss(style: TextStyle | undefined): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.color) css.color = style.color;
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.bold) css.fontWeight = 700;
  if (style.italic) css.fontStyle = "italic";
  if (style.underline) css.textDecoration = "underline";
  if (style.align) css.textAlign = style.align;
  if (style.highlightColor) {
    css.backgroundColor = style.highlightColor;
    css.padding = "0.05em 0.35em";
    css.borderRadius = "3px";
  }
  return css;
}
