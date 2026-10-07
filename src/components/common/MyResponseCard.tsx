import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import type { MyResponseRow } from "../../hooks/useMyResponses";

/** One form-card rendering of a MyResponseRow — shared by MyResponsesPage
 *  and Dashboard's "My responses" toggle so there's one definition of what
 *  this card looks like, not two. */
export function MyResponseCard({ form, response, routingStatus, editable }: MyResponseRow) {
  return (
    <div className="form-card">
      <div className="form-card__header">
        <span className="form-card__icon">
          <Icon name="check" size={16} />
        </span>
        <span className="form-card__title">{form.title || "Untitled form"}</span>
        {routingStatus && (
          <span className={`status-pill ${routingStatus === "approved" ? "status-pill--published" : ""}`}>
            {routingStatus === "in-progress" ? "Awaiting approval" : routingStatus === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>
      <p className="form-card__meta">
        {response.submittedAt
          ? `Submitted ${new Date(response.submittedAt).toLocaleDateString()}`
          : "Submission date unavailable"}
        {response.status === "submitted" && response.editHistory?.length > 0 ? " · edited" : ""}
      </p>
      {form.status === "published" ? (
        <Link className="form-card__responses" to={`/f/${form.slug}`}>
          {editable ? "Edit your response →" : "View your response →"}
        </Link>
      ) : (
        <span className="form-card__meta">This form is no longer available.</span>
      )}
    </div>
  );
}
