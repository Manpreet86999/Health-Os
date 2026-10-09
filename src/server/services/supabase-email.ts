import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project.js';

/**
 * Invokes the deployed report-delivery function. The caller's Supabase JWT is
 * forwarded unchanged: the Edge Function resolves the recipient from Auth and
 * applies its own RLS checks. No SMTP credential or recipient enters Health OS.
 */
export async function requestSupabaseReportEmail(accessToken: string, reportId: string): Promise<{ status: string; deliveryId?: string }> {
  if (!accessToken.trim()) throw new Error('Sign in to your Health OS Supabase account before sending a report.');
  if (!reportId.trim()) throw new Error('A report ID is required.');
  const response = await fetch(`${DEFAULT_SUPABASE_CONFIG.url}/functions/v1/body-os-email`, {
    method: 'POST',
    headers: {
      apikey: DEFAULT_SUPABASE_CONFIG.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    // Send both common identifier spellings during the desktop migration.
    // Neither permits a recipient override.
    body: JSON.stringify({ report_id: reportId, reportId }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({})) as { error?: unknown; message?: unknown; status?: unknown; deliveryId?: unknown; delivery_id?: unknown; queued?: unknown; sent?: unknown };
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : '';
    if (response.status === 401) throw new Error('Your Supabase session expired. Sign in again, then retry.');
    if (response.status === 404) throw new Error('This report has not synced to Supabase yet. Sync now, then retry.');
    throw new Error(message || `Supabase email delivery failed (${response.status}).`);
  }
  const status = typeof body.status === 'string'
    ? body.status
    : body.sent === true ? 'sent'
      : body.queued === true ? 'queued'
        : 'accepted';
  const deliveryId = typeof body.deliveryId === 'string' ? body.deliveryId : typeof body.delivery_id === 'string' ? body.delivery_id : undefined;
  return { status, deliveryId };
}
