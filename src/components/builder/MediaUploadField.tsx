import { useState, type DragEvent } from "react";
import { uploadBrandingAsset } from "../../services/attachments";

interface Props {
  formId: string;
  /** Sub-folder under Attachments/branding/{formId}/ — e.g. "logo", "header", "background". */
  kind: string;
  value: string | undefined;
  onChange: (url: string) => void;
  label: string;
}

/** Drag-and-drop zone + manual file picker for a single branding image,
 *  uploaded straight into the "Attachments" SharePoint library — the same
 *  storage response file uploads use, just under a `branding/` sub-path.
 *  A plain URL is still accepted by typing into the text field beneath it,
 *  for images already hosted elsewhere. */
export function MediaUploadField({ formId, kind, value, onChange, label }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Only image files are supported here.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const attachment = await uploadBrandingAsset(formId, kind, file);
      onChange(attachment.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="media-upload">
      <label className="media-upload__label">{label}</label>

      <div
        className={`media-upload__dropzone ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {value ? (
          <img className="media-upload__preview" src={value} alt="" />
        ) : (
          <span className="media-upload__hint">Drag an image here, or</span>
        )}
        <label className="media-upload__picker">
          {uploading ? "Uploading…" : value ? "Replace image" : "Choose file"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {uploadError && <p className="error-text">{uploadError}</p>}

      <input
        className="media-upload__url-input"
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
      />
    </div>
  );
}
