import { RuntimeShell } from "./RuntimeShell";
import { flattenFields } from "../../services/excel";
import { formatAnswer } from "../../lib/formatAnswer";
import type { AnswerValue, FormDefinition } from "../../formsSchema/types";

interface Props {
  form: FormDefinition;
  answers: Record<string, AnswerValue>;
  submittedAt?: string;
}

/**
 * Shown instead of the fill-out runtime when a respondent already has a
 * response and the form's edit policy is "none" — mirrors real MS Forms'
 * behavior (once submitted, that's it), just presented in the same premium
 * shell instead of a dead end.
 */
export function ReadOnlySummary({ form, answers, submittedAt }: Props) {
  const fields = flattenFields(form);

  return (
    <RuntimeShell title={form.title} titleStyle={form.titleStyle} description={form.description} branding={form.branding}>
      <div className="runtime__banner">
        You already submitted this{submittedAt ? ` on ${new Date(submittedAt).toLocaleDateString()}` : ""}. This
        form doesn't allow changes after submission.
      </div>

      {fields.map((field) => (
        <div className="fill-field" key={field.id}>
          <span className="fill-field__label">{field.label}</span>
          <p>{formatAnswer(answers[field.id] ?? null, field)}</p>
        </div>
      ))}
    </RuntimeShell>
  );
}
