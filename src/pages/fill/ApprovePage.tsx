import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getFormBySlug } from "../../services/forms";
import { getIndexByResponseId } from "../../services/responseIndex";
import { getResponseByRowIndex } from "../../services/excel";
import { getCurrentStep, getRoutingState, resolveStepRecipients } from "../../services/responseRouting";
import { actOnRouting, updateResponse } from "../../services/responses";
import { FillRunner } from "../../components/runtime/FillRunner";
import { RuntimeShell } from "../../components/runtime/RuntimeShell";
import type { AnswerValue, FormDefinition, FormResponse } from "../../formsSchema/types";

type Gate =
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | { mode: "denied"; form: FormDefinition }
  | { mode: "resolved"; form: FormDefinition; status: "approved" | "rejected" | "advanced" }
  | { mode: "review"; form: FormDefinition; response: FormResponse; rowIndex: number };

/**
 * "Send to" approval link — /f/:slug/approve/:responseId. No backend exists
 * to mint/verify a secure token, so the responseId in the URL is a lookup
 * key only, never a bearer secret: the real access check is whether the
 * SIGNED-IN account's own email matches a recipient of the response's
 * current routing step (see services/responseRouting.ts). Everyone still
 * goes through the usual org-domain-restricted MSAL sign-in first, which is
 * the actual security boundary here.
 */
export function ApprovePage() {
  const { slug, responseId } = useParams<{ slug: string; responseId: string }>();
  const { email } = useAuth();
  const [gate, setGate] = useState<Gate>({ mode: "loading" });
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!slug || !responseId || !email) return;
    let cancelled = false;

    (async () => {
      try {
        const form = await getFormBySlug(slug);
        if (!form) {
          if (!cancelled) setGate({ mode: "error", message: "This form isn't available." });
          return;
        }

        const indexEntry = await getIndexByResponseId(form.id, responseId);
        const response = indexEntry ? await getResponseByRowIndex(form, indexEntry.fields.RowIndex) : null;
        if (!indexEntry || !response) {
          if (!cancelled) setGate({ mode: "error", message: "That response couldn't be found." });
          return;
        }

        const routingEntry = await getRoutingState(form.id, responseId);
        if (!routingEntry) {
          if (!cancelled) setGate({ mode: "error", message: "This response has no approval routing configured." });
          return;
        }
        response.routing = routingEntry.state;

        if (routingEntry.state.status !== "in-progress") {
          if (!cancelled) setGate({ mode: "resolved", form, status: routingEntry.state.status });
          return;
        }

        const step = getCurrentStep(form, routingEntry.state);
        const recipients = step ? resolveStepRecipients(step, response.answers) : [];
        if (!recipients.includes(email.toLowerCase())) {
          if (!cancelled) setGate({ mode: "denied", form });
          return;
        }

        if (!cancelled) setGate({ mode: "review", form, response, rowIndex: indexEntry.fields.RowIndex });
      } catch (err) {
        if (!cancelled) setGate({ mode: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, responseId, email]);

  if (gate.mode === "loading") return <div className="page">Loading…</div>;
  if (gate.mode === "error") return <div className="page">{gate.message}</div>;

  if (gate.mode === "denied") {
    return (
      <RuntimeShell title={gate.form.title} branding={gate.form.branding}>
        <p>
          This response isn't waiting on your review right now. If you were sent this link,
          make sure you're signed in with the account it was sent to.
        </p>
      </RuntimeShell>
    );
  }

  if (gate.mode === "resolved") {
    const message =
      gate.status === "advanced"
        ? "Thanks — your approval has been recorded and this has been sent on to the next reviewer."
        : gate.status === "approved"
          ? "This response has already been approved."
          : "This response has already been rejected.";
    return (
      <RuntimeShell title={gate.form.title} branding={gate.form.branding}>
        <p>{message}</p>
      </RuntimeShell>
    );
  }

  const { form, response, rowIndex } = gate;

  async function handleDecision(action: "approved" | "rejected", answers: Record<string, AnswerValue>, reason?: string) {
    if (!email) return;
    const changed = JSON.stringify(answers) !== JSON.stringify(response.answers);
    const current = changed
      ? await updateResponse({
          form,
          existing: response,
          rowIndexHint: rowIndex,
          answers,
          editorEmail: email,
          actionOverride: "approver-edit",
        })
      : response;
    const nextState = await actOnRouting({ form, response: current, actorEmail: email, action, reason });
    setGate({ mode: "resolved", form, status: nextState.status === "in-progress" ? "advanced" : nextState.status });
  }

  return (
    <FillRunner
      form={form}
      responseId={response.id}
      initialAnswers={response.answers}
      banner={<>You're reviewing a submitted response. Edit anything that needs fixing, then approve or reject it.</>}
      onSubmit={(answers) => handleDecision("approved", answers)}
      secondaryAction={{
        label: acting ? "Rejecting…" : "Reject",
        onClick: async (answers) => {
          setActing(true);
          try {
            await handleDecision("rejected", answers);
          } finally {
            setActing(false);
          }
        },
      }}
    />
  );
}
