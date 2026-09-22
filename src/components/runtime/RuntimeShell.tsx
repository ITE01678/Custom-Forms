import type { CSSProperties, ReactNode } from "react";
import { GraphImage } from "../common/GraphImage";
import { RichText } from "../common/RichText";
import { useResolvedImageUrl } from "../../hooks/useResolvedImageUrl";
import { textStyleToCss } from "../../lib/textStyle";
import type { BrandingConfig, TextStyle } from "../../formsSchema/types";

const DEFAULT_ACCENT = "#4f46e5";

interface Props {
  title: string;
  titleStyle?: TextStyle;
  description?: string;
  branding: BrandingConfig;
  children: ReactNode;
}

const CARD_STYLE_CLASS: Record<NonNullable<BrandingConfig["cardStyle"]>, string> = {
  rounded: "runtime__card--rounded",
  sharp: "runtime__card--sharp",
  elevated: "runtime__card--elevated",
  flat: "runtime__card--flat",
  bordered: "runtime__card--bordered",
};

/** The themed "card on a soft gradient" chrome shared by the live fill-out
 *  runtime and the builder's Preview mode, so the two never visually drift. */
export function RuntimeShell({ title, titleStyle, description, branding, children }: Props) {
  const bg = branding.background;
  // CSS background-image can't take a graph-image:// reference directly —
  // resolve it the same way GraphImage does before it goes into inline style.
  const { url: resolvedBgImageUrl, error: bgImageError } = useResolvedImageUrl(
    bg?.type === "image" ? bg.imageUrl : undefined
  );

  const themeStyle: CSSProperties = { "--accent": branding.themeColor || DEFAULT_ACCENT } as CSSProperties;
  if (branding.fontFamily) themeStyle.fontFamily = branding.fontFamily;

  if (bg?.type === "color" && bg.color) {
    themeStyle.background = bg.color;
  } else if (bg?.type === "image" && resolvedBgImageUrl) {
    const fit = bg.fit ?? "cover";
    themeStyle.backgroundImage = `url(${resolvedBgImageUrl})`;
    themeStyle.backgroundSize = fit === "tile" ? "auto" : fit;
    themeStyle.backgroundRepeat = fit === "tile" ? "repeat" : "no-repeat";
    themeStyle.backgroundPosition = "center";
    themeStyle.backgroundAttachment = "fixed";
    if (bg.opacity !== undefined && bg.opacity < 100) {
      // A plain CSS opacity would fade the whole card tree with it; instead
      // blend the image toward the page's own base tone so content stays
      // fully legible regardless of how faint the image is set.
      themeStyle.backgroundImage = `linear-gradient(color-mix(in srgb, var(--surface-sunken) ${100 - bg.opacity}%, transparent), color-mix(in srgb, var(--surface-sunken) ${100 - bg.opacity}%, transparent)), url(${resolvedBgImageUrl})`;
    }
  }

  const cardClass = ["runtime__card", branding.cardStyle ? CARD_STYLE_CLASS[branding.cardStyle] : ""]
    .filter(Boolean)
    .join(" ");

  const logoStyle: CSSProperties = {
    height: `${branding.logoSizePx ?? 40}px`,
  };
  const logoWrapClass =
    branding.logoPosition === "center"
      ? "runtime__logo-wrap runtime__logo-wrap--center"
      : branding.logoPosition === "right"
        ? "runtime__logo-wrap runtime__logo-wrap--right"
        : "runtime__logo-wrap";

  const coverStyle: CSSProperties = {
    height: `${branding.headerHeightPx ?? 220}px`,
    objectPosition: branding.headerFocalPoint ?? "center",
    opacity: (branding.headerOpacity ?? 100) / 100,
  };

  return (
    <div className="runtime" style={themeStyle}>
      <div className="runtime__container">
        {branding.headerImageUrl && (
          <GraphImage className="runtime__cover" src={branding.headerImageUrl} alt="" style={coverStyle} />
        )}

        <div className={cardClass}>
          <div className="runtime__brand-bar" />
          {bg?.type === "image" && bgImageError && (
            <p className="graph-image-error">⚠ Couldn't load the background image</p>
          )}
          {branding.logoUrl && (
            <div className={logoWrapClass}>
              <GraphImage className="runtime__logo" src={branding.logoUrl} alt="" style={logoStyle} />
            </div>
          )}

          {title && (
            <h1 className="runtime__title" style={textStyleToCss(titleStyle)}>
              {title}
            </h1>
          )}
          {description && <RichText className="runtime__description" html={description} />}

          {children}
        </div>
      </div>
    </div>
  );
}
