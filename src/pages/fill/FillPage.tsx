import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getFormBySlug, getFormVersion } from "../../services/forms";
import { getMyResponse, submitResponse, updateResponse } from "../../services/responses";
import { getDraft, saveDraft, deleteDraft } from "../../services/drafts";
import { resolveFirstSectionId } from "../../formsSchema/branching";
import type { AnswerValue, FormDefinition, FormResponse } from "../../formsSchema/types";
import { FillRunner } from "../../components/runtime/FillRunner";
import { ReadOnlySummary } from "../../components/runtime/ReadOnlySummary";
import { RuntimeShell } from "../../components/runtime/RuntimeShell";

type Gate =
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | { mode: "not-open"; form: FormDefinition }
  | { mode: "closed"; form: FormDefinition }
  | { mode: "not-allowed"; form: FormDefinition }
  | { mode: "create"; form: FormDefinition; draftAnswers?: Record<string, AnswerValue>; draftSectionIds?: string[] }
  | { mode: "edit"; form: FormDefinition; response: FormResponse; rowIndex: number }
  | { mode: "readonly"; form: FormDefinition; response: FormResponse };

function isWithinEditWindow(response: FormResponse, form: FormDefinition): boolean {
  const window = form.editPolicy.selfEditWindow;
  if (!window || window.type === "unlimited") return true;
  if (!response.submittedAt || !window.days) return true;
  const deadline = new Date(response.submittedAt).getTime() + window.days * 24 * 60 * 60 * 1000;
  return Date.now() <= deadline;
}

function accessWindowGate(form: FormDefinition): "not-open" | "closed" | null {
  const now = Date.now();
  if (form.settings.opensAt && now < new Date(form.settings.opensAt).getTime()) return "not-open";
  if (form.settings.closesAt && now > new Date(form.settings.closesAt).getTime()) return "closed";
  return null;
}

function isEmailAllowed(form: FormDefinition, email: string): boolean {
  if (form.settings.responseAccess !== "specificPeople") return true;
  return (form.settings.allowedEmails ?? []).map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

export function FillPage() {
  const { slug } = useParams<{ slug: string }>();
  const { email } = useAuth();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate>({ mode: "loading" });
  // Stable across the component's lifetime — used for file-attachment paths
  // from the very first upload through to the final submitted response id.
  const [freshResponseId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!slug || !email) return;
    let cancelled = false;

    (async () => {
      try {
        const latest = await getFormBySlug(slug);
        if (!latest || latest.status !== "published") {
          if (!cancelled) setGate({ mode: "error", message: "This form isn't available." });
          return;
        }

        const windowGate = accessWindowGate(latest);
        if (windowGate) {
          if (!cancelled) setGate({ mode: windowGate, form: latest });
          return;
        }
        if (!isEmailAllowed(latest, email)) {
          if (!cancelled) setGate({ mode: "not-allowed", form: latest });
          return;
        }

        const existing = await getMyResponse(latest, email);
        if (!existing) {
          const draft = await getDraft(latest.id, email);
          if (draft) {
            const pinned =
              draft.formVersion === latest.latestPublishedVersion
                ? latest
                : (await getFormVersion(latest.id, draft.formVersion)) ?? latest;
            if (!cancelled) {
              setGate({
                mode: "create",
                form: pinned,
                draftAnswers: draft.answers,
                draftSectionIds: draft.visitedSectionIds,
              });
            }
            return;
          }
          if (!cancelled) setGate({ mode: "create", form: latest });
          return;
        }

        // An edit always re-renders the exact schema version the response was
        // originally submitted under — never whatever is currently published.
        const pinned =
          existing.response.formVersion === latest.latestPublishedVersion
            ? latest
            : (await getFormVersion(latest.id, existing.response.formVersion)) ?? latest;

        const { mode } = latest.editPolicy;
        const selfCanEdit = mode === "self-edit" || mode === "self-and-admin";
        const editable = selfCanEdit && isWithinEditWindow(existing.response, latest);

        if (cancelled) return;
        if (editable) {
          setGate({ mode: "edit", form: pinned, response: existing.response, rowIndex: existing.rowIndex });
        } else {
          setGate({ mode: "readonly", form: pinned, response: existing.response });
        }
      } catch (err) {
        if (!cancelled) setGate({ mode: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, email]);

  if (gate.mode === "loading") return <div className="page">Loading…</div>;
  if (gate.mode === "error") return <div className="page">{gate.message}</div>;

  if (gate.mode === "not-open" || gate.mode === "closed" || gate.mode === "not-allowed") {
    const message =
      gate.mode === "not-open"
        ? `This form isn't accepting responses yet${gate.form.settings.opensAt ? ` — it opens ${new Date(gate.form.settings.opensAt).toLocaleString()}.` : "."}`
        : gate.mode === "closed"
          ? "This form is no longer accepting responses."
          : "You don't have access to this form.";
    return (
      <RuntimeShell title={gate.form.title} branding={gate.form.branding}>
        <p>{message}</p>
      </RuntimeShell>
    );
  }

  if (gate.mode === "readonly") {
    return <ReadOnlySummary form={gate.form} answers={gate.response.answers} submittedAt={gate.response.submittedAt} />;
  }

  if (gate.mode === "edit") {
    const { form, response, rowIndex } = gate;
    const firstSectionId = resolveFirstSectionId(form.sections, response.answers);

    async function handleEditSubmit(answers: Record<string, AnswerValue>, reason?: string) {
      if (!email) throw new Error("Not signed in.");
      await updateResponse({ form, existing: response, rowIndexHint: rowIndex, answers, editorEmail: email, reason });
      navigate(`/f/${form.slug}/submitted`);
    }

    return (
      <FillRunner
        form={form}
        responseId={response.id}
        initialAnswers={response.answers}
        initialSectionIds={firstSectionId ? [firstSectionId] : []}
        requireReason={!!form.editPolicy.requireReasonForEdit}
        banner={
          <>
            You already submitted this
            {response.submittedAt ? ` on ${new Date(response.submittedAt).toLocaleDateString()}` : ""}. Editing your
            response — every change is recorded.
          </>
        }
        onSubmit={handleEditSubmit}
      />
    );
  }

  // gate.mode === "create" (fresh, or resuming a saved draft)
  const { form, draftAnswers, draftSectionIds } = gate;

  async function handleCreateSubmit(answers: Record<string, AnswerValue>) {
    if (!email) throw new Error("Not signed in.");
    await submitResponse(form, answers, email, freshResponseId);
    await deleteDraft(form.id, email).catch(() => {});
    navigate(`/f/${form.slug}/submitted`);
  }

  async function handleSaveDraft(answers: Record<string, AnswerValue>, visitedSectionIds: string[]) {
    if (!email) throw new Error("Not signed in.");
    await saveDraft({
      formId: form.id,
      submitterEmail: email,
      formVersion: form.latestPublishedVersion ?? form.currentDraftVersion,
      answers,
      visitedSectionIds,
    });
  }

  return (
    <FillRunner
      form={form}
      responseId={freshResponseId}
      initialAnswers={draftAnswers}
      initialSectionIds={draftSectionIds}
      onSaveDraft={handleSaveDraft}
      onSubmit={handleCreateSubmit}
    />
  );
}
