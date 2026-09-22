import { GraphImage } from "../../common/GraphImage";
import type { FormField } from "../../../formsSchema/types";

/** Optional per-question image (MS-Forms-style "add media to a question") —
 *  shared by every field renderer so manual, autofill, and repeating-table
 *  fields all display it the same way. */
export function QuestionMedia({ field }: { field: FormField }) {
  if (!field.mediaUrl) return null;
  const wrapClass =
    field.mediaPosition === "center"
      ? "fill-field__media-wrap fill-field__media-wrap--center"
      : field.mediaPosition === "right"
        ? "fill-field__media-wrap fill-field__media-wrap--right"
        : "fill-field__media-wrap";
  return (
    <div className={wrapClass}>
      <GraphImage className="fill-field__media" src={field.mediaUrl} alt="" style={{ width: `${field.mediaSizePx ?? 240}px` }} />
    </div>
  );
}
