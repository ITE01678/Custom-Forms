import { graphFetch } from "./graphClient";
import { graphScopes } from "../auth/msalConfig";
import type { FormDefinition } from "../formsSchema/types";

/**
 * Best-effort notification email for the approval-routing feature — there's
 * no service account, so this always sends as whichever signed-in user just
 * took the action (the respondent on submit, an approver on approve/reject),
 * via their own POST /me/sendMail. Every call here is fire-and-forget from
 * the caller's perspective (wrapped in try/catch, logged, never thrown): a
 * failed send must never make the underlying submit/approve/reject action
 * look like it failed. `interactive: false` ensures a missing Mail.Send
 * consent fails fast instead of popping a login window mid-flow.
 */

function approveUrl(form: FormDefinition, responseId: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/f/${form.slug}/approve/${responseId}`;
}

async function sendMail(toEmail: string, subject: string, bodyHtml: string): Promise<void> {
  await graphFetch("/me/sendMail", {
    method: "POST",
    interactive: false,
    scopes: graphScopes.mail,
    body: {
      message: {
        subject,
        body: { contentType: "HTML", content: bodyHtml },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: true,
    },
  });
}

export async function sendApprovalRequest(toEmail: string, form: FormDefinition, responseId: string): Promise<void> {
  const link = approveUrl(form, responseId);
  await sendMail(
    toEmail,
    `Review needed: "${form.title}"`,
    `<p>A response to <strong>${form.title}</strong> needs your review.</p>` +
      `<p><a href="${link}">Open it to approve or reject</a></p>`
  );
}

export async function sendRoutingOutcomeNotification(
  toEmail: string,
  form: FormDefinition,
  responseId: string,
  outcome: "approved" | "rejected",
  reason?: string
): Promise<void> {
  const link = approveUrl(form, responseId);
  const verb = outcome === "approved" ? "approved" : "rejected";
  await sendMail(
    toEmail,
    `Your submission to "${form.title}" was ${verb}`,
    `<p>Your response to <strong>${form.title}</strong> has been ${verb}.</p>` +
      (reason ? `<p>Reason: ${reason}</p>` : "") +
      `<p><a href="${link}">View it</a></p>`
  );
}
