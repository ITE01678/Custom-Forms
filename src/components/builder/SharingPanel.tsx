import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Icon } from "../common/Icon";
import type { FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
  /** Switches BuilderPage to the Access tab — lets this panel point
   *  directly at the co-design/collaborator feature instead of just
   *  describing where to find it. */
  onOpenAccessTab?: () => void;
}

export function SharingPanel({ form, onOpenAccessTab }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // BASE_URL is Vite's resolved `base` (e.g. "/Custom-Forms/" on GitHub Pages'
  // project-site subpath) — window.location.origin alone omits it, which
  // produced share links 404ing at GitHub Pages' own "no site here" page.
  const shareUrl =
    form.status === "published"
      ? `${window.location.origin}${import.meta.env.BASE_URL}#/f/${form.slug}`
      : null;

  useEffect(() => {
    if (shareUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareUrl, { width: 160, margin: 1 }).catch(() => {});
    }
  }, [shareUrl]);

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${form.slug}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <>
      <div className="panel">
        <h3>Sharing</h3>
        {shareUrl ? (
          <div className="builder-share">
            <div className="builder-share__link">
              <p>Anyone signed in with their official Microsoft account can open this link:</p>
              <code>{shareUrl}</code>
              <button onClick={handleCopy}>{copied ? "Copied!" : "Copy link"}</button>{" "}
              <Link to={`/admin/forms/${form.id}/responses`}>View responses →</Link>
            </div>
            <div className="builder-share__qr">
              <canvas ref={canvasRef} />
              <div>
                <button onClick={handleDownloadQr}>Download QR</button>
              </div>
            </div>
          </div>
        ) : (
          <p>Publish the form to get a shareable link and QR code — a respondent's link, for filling it out.</p>
        )}
      </div>

      <div className="panel callout-panel">
        <h3>
          <Icon name="users" size={17} /> Want someone else to help build this?
        </h3>
        <p>
          A share link above is for <strong>respondents</strong> — people filling out the form. To invite
          a colleague to <strong>co-design</strong> this form with you (edit content, branding, settings —
          continue where you left off), grant them access from the{" "}
          {onOpenAccessTab ? (
            <button type="button" className="link-button" onClick={onOpenAccessTab}>
              Access tab
            </button>
          ) : (
            "Access tab"
          )}{" "}
          instead. They don't need the form's link at all — once granted, it shows up on their own Dashboard.
        </p>
      </div>
    </>
  );
}
