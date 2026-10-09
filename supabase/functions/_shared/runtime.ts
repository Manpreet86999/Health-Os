import nodemailer from "nodemailer";
import {
  EmailError,
  type ReportEmailType,
} from "../../../src/shared/email-contract.ts";
import type { EmailDependencies, EmailUser } from "./email-service.ts";
import { attachReportReadiness } from '../../../src/shared/report-email.ts';
import { analyzeWorkout, hasCurrentWorkoutAnalysis } from './workout-analysis.ts';
import { processReportJob, type ReportJob, type QueueDependencies } from './report-queue.ts';
export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new EmailError("EMAIL_DELIVERY_FAILED");
  return value;
}
export async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new EmailError("EMAIL_DELIVERY_FAILED");
  return response.status === 204 ? null : response.json();
}
export async function authenticate(request: Request): Promise<EmailUser> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new EmailError("AUTH_REQUIRED");
  }
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: authorization },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new EmailError("AUTH_REQUIRED");
  const user = await response.json();
  if (!user.id) throw new EmailError("AUTH_REQUIRED");
  return user;
}
export async function adminUser(id: string): Promise<EmailUser> {
  const response = await fetch(
    `${env("SUPABASE_URL")}/auth/v1/admin/users/${encodeURIComponent(id)}`,
    {
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new EmailError("AUTH_REQUIRED");
  return response.json();
}
async function records(userId: string, entityType: string, filter = "") {
  const rows: Array<{ payload: Record<string, unknown>; record_id: string }> =
    [];
  for (let offset = 0;; offset += 500) {
    const page = await db(
      `body_os_records?user_id=eq.${
        encodeURIComponent(userId)
      }&entity_type=eq.${entityType}&deleted_at=is.null&select=payload,record_id&order=record_id&limit=500&offset=${offset}${filter}`,
    );
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function emailQueue(userId: string) {
  return db(`body_os_email_jobs?user_id=eq.${encodeURIComponent(userId)}&report_type=eq.workout&status=in.(queued,failed,processing)&select=report_type,report_id,status,last_error,created_at,attempts,next_attempt_at&order=created_at.desc&limit=100`);
}
async function withReadiness(userId: string, reports: Record<string, unknown>[]) {
  const profile = (await records(userId, 'profile'))[0]?.payload || {};
  reports = reports.map(report => ({...report, units: report.units || profile.units || 'kg'}));
  if (!reports.some(record => !record.readiness || !Object.keys(record.readiness as object).length)) return reports;
  const checkins = await records(userId, 'readiness');
  return attachReportReadiness(reports, checkins.map(item => item.payload));
}
export const dependencies: EmailDependencies = {
  async report(userId: string, type: ReportEmailType, id: string) {
    if (type === "weekly" || type === "monthly") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(id)) {
        const start = new Date(`${id}T00:00:00Z`);
        if (
          !Number.isFinite(start.getTime()) ||
          start.toISOString().slice(0, 10) !== id
        ) return null;
        const end = new Date(start);
        type === "weekly"
          ? end.setUTCDate(end.getUTCDate() + 7)
          : end.setUTCMonth(end.getUTCMonth() + 1);
        const sessions = await records(
          userId,
          "session",
          `&payload->>date=gte.${id}&payload->>date=lt.${
            end.toISOString().slice(0, 10)
          }&payload->>status=in.(finished,completed)`,
        );
        return withReadiness(userId, sessions.map((row) => row.payload));
      }
      const weeks = await records(
        userId,
        "week",
        `&record_id=eq.${encodeURIComponent(id)}`,
      );
      if (!weeks.some((row) => row.record_id === id)) return null;
      const sessions = await records(
        userId,
        "session",
        `&payload->>weekId=eq.${
          encodeURIComponent(id)
        }&payload->>status=in.(finished,completed)`,
      );
      return withReadiness(userId, sessions.map((row) => row.payload));
    }
    const entity = type === "workout"
      ? "session"
      : type === "skincare"
      ? "skinLog"
      : "healthReading";
    const rows = await db(
      `body_os_records?user_id=eq.${
        encodeURIComponent(userId)
      }&entity_type=eq.${entity}&record_id=eq.${
        encodeURIComponent(id)
      }&deleted_at=is.null&select=payload&limit=1`,
    );
    if (
      type === "workout" && rows.length &&
      !["finished", "completed"].includes(rows[0].payload.status)
    ) return null;
    const reports = rows.map((row: { payload: Record<string, unknown> }) => row.payload);
    return type === 'workout' ? withReadiness(userId, reports) : reports;
  },
  async preferences(userId) {
    return (await records(userId, "sharedPreferences")).find((row) =>
      row.record_id === "shared-preferences"
    )?.payload || {};
  },
  async generateWorkoutReport(userId, id) {
    const path = `body_os_records?user_id=eq.${encodeURIComponent(userId)}&entity_type=eq.session&record_id=eq.${encodeURIComponent(id)}&deleted_at=is.null`;
    const rows = await db(`${path}&select=payload,cloud_updated_at,revision&limit=1`);
    const row = rows[0];
    if (!row || !['finished', 'completed'].includes(row.payload.status)) throw new EmailError('REPORT_NOT_FOUND');
    if (await hasCurrentWorkoutAnalysis(row.payload)) return (await withReadiness(userId, [row.payload]))[0];
    const prefs = await dependencies.preferences(userId);
    const recent = await db(`body_os_records?user_id=eq.${encodeURIComponent(userId)}&entity_type=eq.session&record_id=neq.${encodeURIComponent(id)}&deleted_at=is.null&payload->>status=in.(finished,completed)&payload->>date=lte.${encodeURIComponent(row.payload.date)}&select=payload&order=updated_at.desc&limit=5`);
    const analyzed = await analyzeWorkout(row.payload, prefs, recent.map((item: {payload: Record<string, unknown>}) => item.payload));
    const saved = await db(`${path}&cloud_updated_at=eq.${encodeURIComponent(row.cloud_updated_at)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ payload: analyzed, revision: Number(row.revision) + 1, updated_at: new Date().toISOString(), device_id: 'body-os-cloud-ai-report' }),
    });
    if (!saved?.length) throw new EmailError('REPORT_GENERATION_FAILED');
    return (await withReadiness(userId, [saved[0].payload]))[0];
  },
  async claim(userId, key) {
    return await db("rpc/body_os_claim_email", {
      method: "POST",
      body: JSON.stringify({ owner_id: userId, delivery_key: key }),
    });
  },
  async finish(userId, key, status) {
    await db(
      `body_os_email_deliveries?user_id=eq.${
        encodeURIComponent(userId)
      }&delivery_key=eq.${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status }),
      },
    );
  },
  async completeReport(userId, type, id) {
    await db(`body_os_email_jobs?user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(type)}&report_id=eq.${encodeURIComponent(id)}`, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'done',last_error:null})});
  },
  async send(message) {
    // Hosted Edge Functions block ports 25 and 587. Use implicit TLS on 465.
    const port = Number(env("HEALTHOS_SMTP_PORT"));
    if (port !== 465) throw new EmailError("EMAIL_DELIVERY_FAILED");
    const transporter = nodemailer.createTransport({
      host: env("HEALTHOS_SMTP_HOST"),
      port,
      secure: true,
      auth: {
        user: env("HEALTHOS_SMTP_USERNAME"),
        pass: env("HEALTHOS_SMTP_PASSWORD"),
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
    });
    try {
      const result = await transporter.sendMail({
        from: {
          name: "Health OS",
          address: env("HEALTHOS_EMAIL_FROM"),
        },
        ...message,
      });
      if (!result.accepted?.length) {
        throw new EmailError("EMAIL_DELIVERY_FAILED");
      }
    } finally {
      transporter.close();
    }
  },
  log(event) {
    console.error(JSON.stringify(event));
  },
  feedbackRecipient: Deno.env.get("HEALTHOS_FEEDBACK_EMAIL"),
};
export const queueDependencies: QueueDependencies = {
  email: dependencies,
  user: adminUser,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  async finish(job, status, attempts, error, nextAttemptAt) {
    await db(`body_os_email_jobs?id=eq.${job.id}&request_version=eq.${job.request_version}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, attempts, last_error: error, locked_at: null, ...(nextAttemptAt ? {next_attempt_at: nextAttemptAt} : {}) }),
    });
  },
};
export async function runReportJob(id: number) {
  const jobs = await db('rpc/body_os_claim_report_job', { method: 'POST', body: JSON.stringify({ job_id: id }) });
  if (jobs?.[0]) return processReportJob(jobs[0] as ReportJob, queueDependencies);
  return { ok: true, status: 'processing', sentTo: [] };
}
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function failure(error: unknown) {
  const safe = error instanceof EmailError
    ? error
    : new EmailError("EMAIL_DELIVERY_FAILED");
  const status = safe.code === "AUTH_REQUIRED"
    ? 401
    : safe.code === "EMAIL_RATE_LIMITED"
    ? 429
    : safe.code === "REPORT_NOT_FOUND"
    ? 404
    : safe.code === "EMAIL_DELIVERY_FAILED"
    ? 503
    : 400;
  return Response.json({ code: safe.code, error: safe.message }, {
    status,
    headers: cors,
  });
}

