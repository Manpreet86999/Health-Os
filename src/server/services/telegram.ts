import * as repo from '../db/repository.js';
import type { PlannedExercise, Readiness, WeekDay } from '../../shared/types.js';

function escapeTelegramHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function presentDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .format(new Date(`${date}T12:00:00`));
}

function exerciseLine(exercise: PlannedExercise, index: number) {
  const prescription = escapeTelegramHtml(exercise.vol || 'Log your working sets');
  const details = [
    exercise.target && `Target · ${escapeTelegramHtml(exercise.target)}`,
    exercise.tempo && `Tempo · ${escapeTelegramHtml(exercise.tempo)}`,
    exercise.restSec !== '' && exercise.restSec != null && `Rest · ${escapeTelegramHtml(exercise.restSec)} sec`,
    exercise.rirTarget !== '' && exercise.rirTarget != null && `RIR ${escapeTelegramHtml(exercise.rirTarget)}`,
    exercise.rpeTarget !== '' && exercise.rpeTarget != null && `RPE ${escapeTelegramHtml(exercise.rpeTarget)}`,
  ].filter(Boolean).join('  •  ');
  return `<b>${index + 1}. ${escapeTelegramHtml(exercise.name)}</b>\n${prescription}${details ? `\n<i>${details}</i>` : ''}\n↳ ${escapeTelegramHtml(exercise.cue || exercise.notes || 'Move with control.')}`;
}

/** A compact, scan-friendly message designed for use while training on a phone. */
export function telegramWorkoutPlanHtml(input: { date: string; weekName: string; day: WeekDay; readiness?: Readiness | null }) {
  const { date, weekName, day, readiness } = input;
  const readinessLine = readiness
    ? `🟢 <b>Readiness ${escapeTelegramHtml(readiness.score)}</b> · ${escapeTelegramHtml(readiness.band)}\n${escapeTelegramHtml(readiness.recommendation)}`
    : '⚪ <b>Readiness</b> · Complete your check-in when you are home.';
  const workout = day.exercises.length ? day.exercises.map(exerciseLine).join('\n\n') : '<i>Recovery day — no lifting is planned.</i>';
  return `🏋️ <b>HEALTH OS · TODAY\'S MISSION</b>\n<b>${escapeTelegramHtml(presentDate(date))}</b>  ·  ${escapeTelegramHtml(day.key)}  ·  ${escapeTelegramHtml(day.title)}\n<i>${escapeTelegramHtml(weekName)}</i>\n\n${readinessLine}\n\n━━━━━━━━━━━━\n<b>YOUR SESSION</b>\n\n${workout}\n\n━━━━━━━━━━━━\n✅ <b>Gym win:</b> send each completed exercise as <code>1: 60 kg × 10, 10, 8</code>.\n📝 Add a note with <code>note: felt strong</code>.\n\n<i>Finish strong. Your home dashboard will be ready to import this session.</i>`;
}

/** Each sent workout carries a read-only snapshot, so the Mini App opens the exact plan selected at home. */
export function telegramMiniAppUrl(baseUrl: string, day: WeekDay, date: string, weekName: string, weekId = '') {
  let target: URL;
  try { target = new URL(String(baseUrl || '').trim()); }
  catch { throw new Error('The Telegram Mini App URL in Settings is invalid.'); }
  if (target.protocol !== 'https:') throw new Error('Telegram requires the Mini App URL to use HTTPS.');
  const plan = {
    date, weekId, dayKey: day.key, weekName, title: day.title,
    exercises: day.exercises.map((exercise) => ({
      name: exercise.name,
      target: exercise.target,
      prescription: exercise.vol,
      cue: exercise.cue,
      restSec: exercise.restSec,
      tempo: exercise.tempo,
      rirTarget: exercise.rirTarget,
      rpeTarget: exercise.rpeTarget,
      trackingMode: exercise.trackingMode,
    })),
  };
  target.searchParams.set('p', Buffer.from(JSON.stringify(plan)).toString('base64url'));
  return target.toString();
}

export async function sendTelegramMessage(text: string, parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2', replyMarkup?: unknown) {
  const s = repo.getSettings();
  if (!s.telegramBotToken || !s.telegramChatId) throw new Error('Telegram is not connected.');

  const chatIds = s.telegramChatId.split(',').map(id => id.trim()).filter(Boolean);
  if (!chatIds.length) throw new Error('Telegram has no recipient chat.');

  const url = `https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`;
  
  const failures: string[] = [];
  for (const chatId of chatIds) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`Telegram API error for chat ${chatId}:`, err.replace(s.telegramBotToken, '[REDACTED]'));
        failures.push('Telegram rejected the message. Check the bot connection and chat permissions.');
      }
    } catch (e) {
      console.error(`Failed to send telegram message to ${chatId}:`, e);
      failures.push('Telegram could not be reached. Check your internet connection and try again.');
    }
  }
  if (failures.length) throw new Error(failures[0]);
}

export async function sendTelegramMiniAppPlan(text: string, miniAppUrl: string) {
  await sendTelegramMessage(text, 'HTML', { inline_keyboard: [[{ text: '🏋️ Open gym logger', web_app: { url: miniAppUrl } }]] });
}

export async function sendTelegramDocument(filename: string, buffer: Buffer, caption?: string) {
  const s = repo.getSettings();
  if (!s.telegramBotToken || !s.telegramChatId) return;

  const chatIds = s.telegramChatId.split(',').map(id => id.trim()).filter(Boolean);
  if (!chatIds.length) return;

  const url = `https://api.telegram.org/bot${s.telegramBotToken}/sendDocument`;
  
  for (const chatId of chatIds) {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      if (caption) formData.append('caption', caption);
      
      const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
      formData.append('document', blob, filename);

      const res = await fetch(url, {
        method: 'POST',
        body: formData as any
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`Telegram API error for chat ${chatId}:`, err.replace(s.telegramBotToken, '[REDACTED]'));
      }
    } catch (e) {
      console.error(`Failed to send telegram document to ${chatId}:`, e);
    }
  }
}

export async function getUpdatesToFindChatId(token: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?limit=1&offset=-1`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (data.ok && data.result.length > 0) {
      const msg = data.result[0].message;
      if (msg && msg.chat && msg.chat.id) {
        return String(msg.chat.id);
      }
    }
  } catch (e) {
    console.error('Failed to fetch updates:', e);
  }
  return null;
}

export type TelegramGymEntry = { exerciseIndex: number; sets: Array<{ w: number; r: number }>; note?: string };

/** Pulls the simple, copy-friendly gym fallback format after the desktop is back online. */
export async function getRecentGymEntries(): Promise<TelegramGymEntry[]> {
  const s = repo.getSettings();
  if (!s.telegramBotToken || !s.telegramChatId) throw new Error('Telegram is not connected.');
  const allowed = new Set(s.telegramChatId.split(',').map((id) => id.trim()));
  const response = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/getUpdates?limit=100`);
  const payload: any = await response.json();
  if (!response.ok || !payload.ok) throw new Error('Telegram could not fetch your gym messages.');
  const entries: TelegramGymEntry[] = [];
  for (const update of payload.result || []) {
    const message = update.message;
    if (!message || !allowed.has(String(message.chat?.id))) continue;
    if (message.web_app_data?.data) {
      try {
        const session = JSON.parse(message.web_app_data.data);
        if (session?.kind === 'body-os-gym-session' && Array.isArray(session.exercises)) {
          session.exercises.forEach((exercise: any, index: number) => {
            const sets = (exercise.sets || []).map((set: any) => ({ w: Number(set.weight), r: Number(set.reps) })).filter((set: {w:number;r:number}) => Number.isFinite(set.w) && Number.isFinite(set.r) && set.r > 0);
            if (sets.length) entries.push({ exerciseIndex: index + 1, sets, note: String(exercise.sets?.at(-1)?.note || '') });
          });
          if (session.note) entries.push({ exerciseIndex: 0, sets: [], note: String(session.note) });
        }
      } catch { /* Ignore malformed third-party payloads. */ }
      continue;
    }
    if (!message.text) continue;
    const note = String(message.text).match(/^note\s*:\s*(.+)$/i);
    if (note) { entries.push({ exerciseIndex: 0, sets: [], note: note[1].trim() }); continue; }
    const head = String(message.text).match(/^\s*(\d+)\s*:\s*(.+)$/);
    if (!head) continue;
    const sets = [...head[2].matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|lb)?\s*[x×]\s*(\d+)/gi)]
      .map((match) => ({ w: Number(match[1]), r: Number(match[2]) }))
      .filter((set) => Number.isFinite(set.w) && Number.isFinite(set.r) && set.r > 0);
    if (sets.length) entries.push({ exerciseIndex: Number(head[1]), sets });
  }
  return entries;
}
