import { reportTemplate, prepareReportEmailImages } from '../../shared/report-email.js';
import { HEALTH_OS_SENDER_EMAIL, HEALTH_OS_SENDER_NAME, isHealthOsEmailConfigured } from '../config.js';
import { escapeHtml } from '../lib/ids.js';
import type { AppSettings, CoachResult, Session } from '../types.js';
import { REPORT_LOGO_DATA_URI } from '../../shared/report-logo.js';
import * as repo from '../db/repository.js';

export function reportHtml(session: Session, coachData: CoachResult = { score: 0, advice: [] }): string {
  return reportTemplate('Health OS workout report', [{ ...session, units: repo.getProfile().units || 'kg', aiOverallSummary: session.aiOverallSummary || coachData.advice?.[0] }]).html;
}

export async function sendMail(
  _settings: AppSettings,
  opts: { to: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] },
): Promise<void> {
  void _settings; void opts;
  throw new Error('Local SMTP delivery is disabled. Health OS report email is delivered through Supabase.');
}

export function isEmailDeliveryConfigured(): boolean { return isHealthOsEmailConfigured(); }

export function welcomeEmailHtml(profileName: string): string {
  return `<!doctype html><html><body style="margin:0;background:#07110d;font-family:Arial,Helvetica,sans-serif;color:#eaf3ed"><div style="max-width:640px;margin:auto;padding:32px 18px"><div style="background:linear-gradient(145deg,#192b22,#0d1711);border:1px solid #355540;border-radius:28px;padding:38px 30px"><div style="color:#b8f567;font-size:12px;font-weight:800;letter-spacing:2px">HEALTH OS · SETUP COMPLETE</div><h1 style="font-size:34px;line-height:1.08;margin:18px 0 12px">Welcome, ${escapeHtml(profileName)}.</h1><p style="color:#b8cbbd;font-size:16px;line-height:1.6;margin:0">Your complete Health OS workspace is active. Training, Care, private backups, reporting, Telegram delivery, and AI coaching are ready.</p><div style="height:1px;background:#355540;margin:28px 0"></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 8px 14px 0"><div style="background:#102117;border-radius:14px;padding:16px"><b style="color:#b8f567">01 · Start today</b><p style="margin:8px 0 0;color:#b8cbbd;font-size:14px">Log readiness, then open your planned workout.</p></div></td><td style="padding:0 0 14px 8px"><div style="background:#102117;border-radius:14px;padding:16px"><b style="color:#b8f567">02 · Build insight</b><p style="margin:8px 0 0;color:#b8cbbd;font-size:14px">Use plans, records, analysis, and reports on the web.</p></div></td></tr><tr><td style="padding:0 8px 0 0"><div style="background:#102117;border-radius:14px;padding:16px"><b style="color:#b8f567">03 · Stay protected</b><p style="margin:8px 0 0;color:#b8cbbd;font-size:14px">Your Drive backup is private and your sync belongs to your Google account.</p></div></td><td style="padding:0 0 0 8px"><div style="background:#102117;border-radius:14px;padding:16px"><b style="color:#b8f567">04 · Keep moving</b><p style="margin:8px 0 0;color:#b8cbbd;font-size:14px">Use Care and Coach when you need the next best action.</p></div></td></tr></table><p style="margin:30px 0 0;color:#8ea996;font-size:13px;line-height:1.6">Open Health OS and complete the welcome guide. You can change connected services later in Core settings.</p></div></div></body></html>`;
}


export async function generateReportEmailPayload(session: Session, coachData?: CoachResult): Promise<{ html: string; attachments: any[] }> {
  return prepareReportEmailImages(reportHtml(session, coachData));
}

/** Converts SMTP failures into setup guidance without ever returning a credential. */
export function emailDeliveryMessage(error: unknown): string {
  const value = error as { code?: string; responseCode?: number; message?: string };
  if (/mail service is not configured/i.test(value?.message || '')) {
    return 'Health OS email delivery is not configured on this installation yet. The server needs the developer sender credential.';
  }
  if (/at least one report recipient/i.test(value?.message || '')) {
    return 'Add a valid account email or report recipient, then try the test again.';
  }
  if (value?.code === 'EAUTH' || value?.responseCode === 535 || /username and password|authentication|invalid login/i.test(value?.message || '')) {
    return 'The Health OS mail service could not authenticate. The service administrator needs to update its sender credential.';
  }
  if (value?.code === 'ETIMEDOUT' || value?.code === 'ECONNECTION' || value?.code === 'ESOCKET') {
    return 'Health OS could not reach the email service. Check your internet, firewall, antivirus, or proxy, then try again.';
  }
  if (value?.code === 'ENOTFOUND') return 'The email service could not be found. Check your internet or DNS connection, then try again.';
  return 'Email test failed. Confirm at least one valid recipient, then try again.';
}
