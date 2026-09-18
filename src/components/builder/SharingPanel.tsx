import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import type { FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
}

export function SharingPanel({ form }: Props) {
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

  if (!shareUrl) {
    return (
      <div className="panel">
        <h3>Sharing</h3>
        <p>Publish the form to get a shareable link and QR code.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Sharing</h3>
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
    </div>
  );
}
