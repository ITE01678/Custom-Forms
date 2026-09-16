import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getFormBySlug } from "../../services/forms";
import { RuntimeShell } from "../../components/runtime/RuntimeShell";
import type { FormDefinition } from "../../formsSchema/types";

export function SubmittedPage() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<FormDefinition | null>(null);

  useEffect(() => {
    if (!slug) return;
    getFormBySlug(slug).then((found) => found && setForm(found));
  }, [slug]);

  useEffect(() => {
    const confirmation = form?.branding.confirmation;
    if (confirmation?.mode === "redirect" && confirmation.redirectUrl) {
      window.location.href = confirmation.redirectUrl;
    }
  }, [form]);

  if (!form) return <div className="page page--centered">Loading…</div>;

  return (
    <RuntimeShell title="" branding={form.branding}>
      <div className="submitted-card">
        <div className="submitted-card__icon">✓</div>
        <h1>Thanks!</h1>
        <p>{form.branding.confirmation.message ?? "Your response has been recorded."}</p>
      </div>
    </RuntimeShell>
  );
}
