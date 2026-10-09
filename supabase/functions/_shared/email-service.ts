import {
  EmailError,
  type EmailRequest,
  parseEmailRequest,
  type ReportEmailType,
} from "../../../src/shared/email-contract.ts";
import { baseTemplate, escapeEmailHtml, reportTemplate } from "./templates.ts";
import { prepareReportEmailImages, type ReportEmailAttachment } from '../../../src/shared/report-email.ts';
export interface EmailUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}
export interface EmailDependencies {
  report(
    userId: string,
    type: ReportEmailType,
    id: string,
  ): Promise<Record<string, unknown>[] | null>;
  preferences(userId: string): Promise<Record<string, unknown>>;
  generateWorkoutReport?(userId: string, id: string): Promise<Record<string, unknown>>;
  claim(userId: string, key: string): Promise<"claimed" | "sent" | "limited">;
  finish(userId: string, key: string, status: "sent" | "failed"): Promise<void>;
  send(
    message: { to: string; subject: string; html: string; text: string; attachments?: ReportEmailAttachment[] },
  ): Promise<void>;
  log(event: { code: string; userId: string }): void;
  completeReport?(userId: string, type: ReportEmailType, id: string): Promise<void>;
  feedbackRecipient?: string;
}
/** Only trusted adapters supply the authenticated user. Never construct it from request JSON. */
export async function sendAccountEmail(
  user: EmailUser,
  raw: unknown,
  deps: EmailDependencies,
  automatic = false,
  deliveryKey?: string,
) {
  const request: EmailRequest = parseEmailRequest(raw);
  if (!user.id) throw new EmailError("AUTH_REQUIRED");
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    throw new EmailError("EMAIL_NOT_AVAILABLE");
  }
  if (!user.email_confirmed_at) throw new EmailError("EMAIL_NOT_VERIFIED");
  let to = user.email;
  let subject = "Health OS email test";
  let html = baseTemplate(
    subject,
    "<p>Health OS email delivery to your primary account email is working.</p>",
  );
  let text = subject;
  if (request.reportType === 'test') {
    subject = 'Health OS · Email delivery test';
    ({html,text} = reportTemplate(subject,[{dayTitle:'Your reports are ready',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()),units:'kg',logs:[{name:'Sample exercise · demonstration only',status:'completed',trackingMode:'weight_reps',sets:[{s:1,w:40,r:10},{s:2,w:40,r:10}]}],notes:'This is a dummy report to test email delivery and preview the design. These sample sets are not saved to your workout history. Please confirm that this message reached your inbox.'}]));
  }
  if ("reportId" in request) {
    if (automatic) {
      const enabled =
        (await deps.preferences(user.id))[`${request.reportType}ReportEnabled`];
      if (
        request.reportType === "workout" ? enabled === false : enabled !== true
      ) return { ok: true, skipped: true, sentTo: [] };
    }
    const records = await deps.report(
      user.id,
      request.reportType,
      request.reportId,
    );
    if (!records?.length) throw new EmailError("REPORT_NOT_FOUND");
    subject = `Health OS ${request.reportType === 'workout' ? 'AI workout' : request.reportType} report`;
    ({ html, text } = reportTemplate(subject, records));
  } else if (request.reportType === "welcome") {
    subject = "Welcome to Health OS";
    html = baseTemplate(subject, "<p>Your Health OS workspace is ready.</p>");
    text = subject;
  } else if (request.reportType === "hard-reset") {
    subject = "Health OS hard reset confirmation";
    text =
      `Your confirmation code is ${request.code}. It expires in 10 minutes.`;
    html = baseTemplate(subject, `<p>${escapeEmailHtml(text)}</p>`);
  } else if (request.reportType === "feedback") {
    if (!deps.feedbackRecipient) throw new EmailError("EMAIL_DELIVERY_FAILED");
    to = deps.feedbackRecipient;
    subject = `Health OS feedback · ${request.category}`;
    text = `Reply to: ${user.email}\n${request.message}`;
    html = baseTemplate(
      subject,
      `<p>${escapeEmailHtml(user.email)}</p><p style="white-space:pre-wrap">${
        escapeEmailHtml(request.message)
      }</p>`,
    );
  }
  // Automatic work is idempotent across scheduler invocations; manual resends have a minute bucket.
  const key = deliveryKey || `${request.reportType}:${
    "reportId" in request ? request.reportId : ""
  }:${automatic ? "automatic" : Math.floor(Date.now() / 60000)}`;
  const claim = await deps.claim(user.id, key);
  if (claim === "limited") throw new EmailError("EMAIL_RATE_LIMITED");
  if (claim === "sent") {
    if ("reportId" in request) await deps.completeReport?.(user.id, request.reportType, request.reportId);
    return { ok: true, sentTo: [to] };
  }
  try {
    if ('reportId' in request && request.reportType === 'workout') {
      if (!deps.generateWorkoutReport) throw new EmailError('REPORT_GENERATION_FAILED');
      const analyzed = await deps.generateWorkoutReport(user.id, request.reportId);
      if (typeof analyzed.aiOverallSummary !== 'string' || !analyzed.aiOverallSummary.trim()) throw new EmailError('REPORT_GENERATION_FAILED');
      ({ html, text } = reportTemplate(subject, [analyzed]));
    }
    await deps.send({ to, subject, text, ...prepareReportEmailImages(html) });
  } catch (error) {
    await deps.finish(user.id, key, "failed");
    const safe = error instanceof EmailError ? error : new EmailError('EMAIL_DELIVERY_FAILED');
    deps.log({ code: safe.code, userId: user.id });
    throw safe;
  }
  await deps.finish(user.id, key, "sent");
  if ("reportId" in request) await deps.completeReport?.(user.id, request.reportType, request.reportId);
  return { ok: true, status: 'sent', sentTo: [to] };
}

