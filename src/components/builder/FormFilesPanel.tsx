import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getResponseWorkbookWebUrl } from "../../services/excel";
import { getFormVersionWebUrl } from "../../services/forms";
import type { FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
}

/** Direct links to the SharePoint files backing this form — opens in
 *  SharePoint's own web UI in a new tab, relying on the admin's existing
 *  signed-in browser session there (fine for a link the user clicks
 *  themselves; see graphClient.ts's doc comment on why rendering bytes
 *  inline needs a different approach). */
export function FormFilesPanel({ form }: Props) {
  const [workbookUrl, setWorkbookUrl] = useState<string | null | "loading">("loading");
  const [snapshotUrl, setSnapshotUrl] = useState<string | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getResponseWorkbookWebUrl(form.id)
      .then((url) => !cancelled && setWorkbookUrl(url))
      .catch(() => !cancelled && setWorkbookUrl(null));
    getFormVersionWebUrl(form)
      .then((url) => !cancelled && setSnapshotUrl(url))
      .catch(() => !cancelled && setSnapshotUrl(null));
    return () => {
      cancelled = true;
    };
  }, [form]);

  return (
    <div className="form-files-panel">
      <strong>Files</strong>
      <span>
        {workbookUrl === "loading" ? (
          "Response workbook — loading…"
        ) : workbookUrl ? (
          <a href={workbookUrl} target="_blank" rel="noreferrer">
            Response workbook (.xlsx) ↗
          </a>
        ) : (
          "Response workbook — not created yet (publish the form first)"
        )}
      </span>
      <span>
        {snapshotUrl === "loading" ? (
          "Published snapshot — loading…"
        ) : snapshotUrl ? (
          <a href={snapshotUrl} target="_blank" rel="noreferrer">
            Published snapshot (v{form.latestPublishedVersion}.json) ↗
          </a>
        ) : (
          "Published snapshot — not published yet"
        )}
      </span>
      <span>
        <Link to={`/admin/sync-health?formId=${form.id}`}>Sync queue for this form →</Link>
      </span>
    </div>
  );
}
