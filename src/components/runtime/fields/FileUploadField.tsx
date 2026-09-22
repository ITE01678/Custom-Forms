import { useState } from "react";
import { uploadAttachment, deleteAttachment } from "../../../services/attachments";
import { textStyleToCss } from "../../../lib/textStyle";
import { QuestionMedia } from "./QuestionMedia";
import type { AnswerValue, FileAttachment, FormField } from "../../../formsSchema/types";

interface Props {
  field: FormField;
  formId: string;
  responseId: string;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

function asFiles(value: AnswerValue): FileAttachment[] {
  return Array.isArray(value) && (value.length === 0 || typeof value[0] === "object") ? (value as FileAttachment[]) : [];
}

/** Uploads directly to the "Attachments" SharePoint library as soon as a
 *  file is selected — the answer only ever stores {name, url, size}
 *  references, never raw bytes. */
export function FileUploadField({ field, formId, responseId, value, onChange, error }: Props) {
  const files = asFiles(value);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const maxFiles = field.validation?.maxFiles ?? 10;
  const maxSizeMb = field.validation?.maxFileSizeMb ?? 25;
  const allowedExtensions = field.validation?.fileTypes?.map((t) => t.replace(".", "").toLowerCase());

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setUploadError(null);

    if (files.length + incoming.length > maxFiles) {
      setUploadError(`You can upload at most ${maxFiles} file(s).`);
      return;
    }
    for (const f of incoming) {
      if (f.size > maxSizeMb * 1024 * 1024) {
        setUploadError(`"${f.name}" is larger than ${maxSizeMb}MB.`);
        return;
      }
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (allowedExtensions && allowedExtensions.length > 0 && (!ext || !allowedExtensions.includes(ext))) {
        setUploadError(`"${f.name}" isn't an allowed file type (${field.validation?.fileTypes?.join(", ")}).`);
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: FileAttachment[] = [];
      for (const f of incoming) {
        uploaded.push(await uploadAttachment(formId, responseId, field.id, f));
      }
      onChange([...files, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(file: FileAttachment) {
    onChange(files.filter((f) => f.url !== file.url));
    deleteAttachment(formId, responseId, field.id, file.name).catch(() => {}); // best-effort; not worth blocking the UI on
  }

  return (
    <div className="fill-field">
      <label className="fill-field__label" htmlFor={field.id} style={textStyleToCss(field.labelStyle)}>
        {field.label}
        {field.validation?.required && <span className="fill-field__required-mark">*</span>}
      </label>
      <QuestionMedia field={field} />
      <input
        id={field.id}
        type="file"
        multiple={maxFiles > 1}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading || files.length >= maxFiles}
      />
      {uploading && <p className="fill-field__help">Uploading…</p>}
      {uploadError && <p className="error-text">{uploadError}</p>}

      {files.length > 0 && (
        <ul className="attachment-list">
          {files.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noreferrer">
                {f.name}
              </a>{" "}
              <span className="fill-field__help">({Math.round(f.size / 1024)} KB)</span>
              <button onClick={() => handleRemove(f)} title="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {field.helpText && <span className="fill-field__help">{field.helpText}</span>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
