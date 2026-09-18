import type { CSSProperties, ReactNode } from "react";
import type { BrandingConfig } from "../../formsSchema/types";

const DEFAULT_ACCENT = "#4f46e5";

interface Props {
  title: string;
  description?: string;
  branding: BrandingConfig;
  children: ReactNode;
}

/** The themed "card on a soft gradient" chrome shared by the live fill-out
 *  runtime and the builder's Preview mode, so the two never visually drift. */
export function RuntimeShell({ title, description, branding, children }: Props) {
  const bg = branding.background;
  const themeStyle: CSSProperties = { "--accent": branding.themeColor || DEFAULT_ACCENT } as CSSProperties;
  if (bg?.type === "color" && bg.color) {
    themeStyle.background = bg.color;
  } else if (bg?.type === "image" && bg.imageUrl) {
    themeStyle.backgroundImage = `url(${bg.imageUrl})`;
    themeStyle.backgroundSize = "cover";
    themeStyle.backgroundPosition = "center";
    themeStyle.backgroundAttachment = "fixed";
  }

  return (
    <div className="runtime" style={themeStyle}>
      <div className="runtime__container">
        {branding.headerImageUrl && <img className="runtime__cover" src={branding.headerImageUrl} alt="" />}

        <div className="runtime__card">
          <div className="runtime__brand-bar" />
          {branding.logoUrl && <img className="runtime__logo" src={branding.logoUrl} alt="" />}

          {title && <h1 className="runtime__title">{title}</h1>}
          {description && <p className="runtime__description">{description}</p>}

          {children}
        </div>
      </div>
    </div>
  );
}
