import * as repo from '../db/repository.js';
import * as queue from './queue.js';
import * as telegram from './telegram.js';
import * as pdf from './reports.js';
import * as gdrive from './gdrive-backup.js';
import { checkExerciseMediaEnrichmentSchedule } from './exercise-media-enrichment.js';

export function startCronJobs() {
  console.log('[cron] Starting background jobs manager...');
  
  // We'll run a check every 1 minute. 
  // In a real production system, you'd use a robust scheduler like node-cron.
  // Since this is a local app, setTimeout/setInterval is fine.
  setInterval(async () => {
    try {
      await checkTasksAndNotify();
      await checkReportSchedule();
      await checkGdriveBackupSchedule();
      await checkExerciseMediaEnrichmentSchedule();
    } catch (e) {
      console.error('[cron] Error running background jobs:', e);
    }
  }, 60 * 1000);
}

// Global state to prevent spamming
let lastPendingTaskNotification = 0;

async function checkTasksAndNotify() {
  const settings: any = repo.getSettings();
  if (!settings.telegramBotToken || !settings.telegramChatId) return;

  const pending = queue.getPendingTasks();
  if (pending.length === 0) return;

  const now = Date.now();
  // Notify at most once per 6 hours (21600000 ms)
  if (now - lastPendingTaskNotification < 21600000) return;
  
  const text = `🔔 <b>You have ${pending.length} pending tasks in Health OS:</b>\n` +
    pending.map(t => `- ${t.title}`).join('\n') +
    `\n\nOpen your dashboard to resolve them!`;

  await telegram.sendTelegramMessage(text, 'HTML');
  lastPendingTaskNotification = now;
}

let lastReportSentWeek = '';

async function checkReportSchedule() {
  const settings: any = repo.getSettings();
  if (!settings.telegramBotToken || !settings.telegramChatId) return;

  // Schedule format: 'Day HH:MM' e.g. 'Sunday 20:00'
  const schedule = settings.reportSchedule || 'Sunday 20:00';
  const [dayStr, timeStr] = schedule.split(' ');
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = days.indexOf(dayStr);
  if (dayIndex === -1 || !timeStr) return;

  const [targetHour, targetMin] = timeStr.split(':').map(Number);
  
  const now = new Date();
  if (now.getDay() === dayIndex && now.getHours() === targetHour && now.getMinutes() === targetMin) {
    const db = repo.loadAppDb();
    const activeWeek = db.weeks.find(w => w.id === db.meta.activeWeekId);
    if (!activeWeek) return;

    if (lastReportSentWeek === activeWeek.id) return; // Prevent duplicate within the minute

    console.log(`[cron] Generating weekly report for week: ${activeWeek.id}`);
    
    // Check if we have pending tasks before sending report?
    if (queue.getPendingTasks().length > 0) {
       await telegram.sendTelegramMessage(`⚠️ Weekly report delayed. Please log your pending tasks first!`, 'HTML');
       lastReportSentWeek = activeWeek.id; // Mark as done so we don't spam, they need to manually trigger later or wait till next week.
       return;
    }

    try {
      const buffer = await pdf.generateWeeklyReportHtml(activeWeek.id);
      await telegram.sendTelegramDocument(`weekly-report.html`, buffer, `Your weekly fitness report is ready!`);
      lastReportSentWeek = activeWeek.id;
    } catch (e) {
      console.error('[cron] Failed to generate/send report:', e);
    }
  }
}

let isBackupRunning = false;

export function shouldAttemptGdriveBackup(input: {
  enabled: boolean;
  schedule: 'daily' | 'weekly' | 'monthly';
  googleClientId?: string;
  googleClientSecret?: string;
  gdriveRefreshToken?: string;
  lastBackup?: string;
  lastFailureAt?: number;
  failureBackoffMs?: number;
  now?: number;
}): { attempt: boolean; skipReason?: 'disabled' | 'not-configured' | 'not-due' | 'backoff' } {
  if (!input.enabled) return { attempt: false, skipReason: 'disabled' };
  if (!input.googleClientId || !input.googleClientSecret || !input.gdriveRefreshToken) {
    return { attempt: false, skipReason: 'not-configured' };
  }
  const now = input.now ?? Date.now();
  if (input.lastFailureAt && now - input.lastFailureAt < (input.failureBackoffMs ?? 60 * 60 * 1000)) {
    return { attempt: false, skipReason: 'backoff' };
  }
  const lastBackup = input.lastBackup ? new Date(input.lastBackup).getTime() : 0;
  const intervals = { daily: 24, weekly: 24 * 7, monthly: 24 * 30 };
  if (lastBackup && now - lastBackup < intervals[input.schedule] * 60 * 60 * 1000) {
    return { attempt: false, skipReason: 'not-due' };
  }
  return { attempt: true };
}

async function checkGdriveBackupSchedule() {
  if (isBackupRunning) return;
  const settings: any = repo.getSettings();
  const decision = shouldAttemptGdriveBackup({
    enabled: Boolean(settings.gdriveEnabled),
    schedule: settings.gdriveSchedule || 'weekly',
    googleClientId: settings.googleClientId,
    googleClientSecret: settings.googleClientSecret,
    gdriveRefreshToken: settings.gdriveRefreshToken || settings.googleRefreshToken,
    lastBackup: settings.gdriveLastBackup,
  });
  if (decision.attempt) {
    console.log(`[cron] Running scheduled Google Drive backup (${settings.gdriveSchedule})`);
    isBackupRunning = true;
    try {
      await gdrive.uploadBackup();
    } catch (e) {
      console.error('[cron] Scheduled Drive backup failed:', e);
    } finally {
      isBackupRunning = false;
    }
  }
}
