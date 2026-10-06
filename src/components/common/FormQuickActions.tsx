import { useNavigate } from "react-router-dom";
import { getFormVersionWebUrl } from "../../services/forms";
import type { FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
  canViewResponses: boolean;
  canViewSyncHealth: boolean;
}

/** Quick-access icon row for a form card (Dashboard) — responses, sync
 *  health, and the published snapshot, each gated by capability. Renders
 *  as plain buttons/spans (not nested <Link>/<a>) because the card itself
 *  is already one big clickable <Link> to the builder — nesting another
 *  anchor inside an anchor is invalid HTML and double-fires navigation,
 *  same reasoning the pre-existing "View responses" link on this card
 *  already followed (stopPropagation + preventDefault + navigate). */
export function FormQuickActions({ form, canViewResponses, canViewSyncHealth }: Props) {
  const navigate = useNavigate();

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function openSnapshot(e: React.MouseEvent) {
    stop(e);
    try {
      const url = await getFormVersionWebUrl(form);
      if (url) window.open(url, "_blank", "noopener");
    } catch {
      // best-effort — a missing/unpublished snapshot just does nothing
    }
  }

  if (!canViewResponses && !canViewSyncHealth && !form.latestPublishedVersion) return null;

  return (
    <div className="form-card__quick-actions">
      {canViewResponses && (
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          data-tooltip="Responses"
          onClick={(e) => {
            stop(e);
            navigate(`/admin/forms/${form.id}/responses`);
          }}
        >
          📊
        </button>
      )}
      {canViewSyncHealth && (
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          data-tooltip="Sync health"
          onClick={(e) => {
            stop(e);
            navigate(`/admin/sync-health?formId=${form.id}`);
          }}
        >
          🩺
        </button>
      )}
      {form.latestPublishedVersion && (
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Published snapshot" onClick={openSnapshot}>
          📜
        </button>
      )}
    </div>
  );
}
