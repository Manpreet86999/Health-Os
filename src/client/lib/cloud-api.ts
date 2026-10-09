import { catalogExercise } from '../../shared/global-exercises';
import { isCompletedWorkout } from './completed-workout';
import { uxPreferencesSchema } from '../../shared/ux';
import { ensureLibraryExercise, ensureLibraryMedia } from './exercise-library-media';
import { readWorkspaceCache, writeWorkspaceCache, workspaceScope } from './workspace-cache';
import { bioSchema } from '../../shared/biology';
import { readBiologicalCloud, writeBiologicalCloud } from './biology-cloud';
import { activeSession, invokeCloud, storedSession } from './cloud-session';
import { runWorkerJob, workerStatus } from './local-worker';
import { uploadPhoto, photoUrls } from './cloud-storage';
import { portableRecords, backupRecords, compareBackup } from '../../shared/cloud-backup';
import { readCloud, writeCloud, pullCloudDelta, canonical, validateRecord, type CloudRecord } from '../../shared/cloud';
import { snapshotFromRecords } from '../../shared/record-snapshot';
import { computeMetrics } from '../../shared/metrics';
import { localCoach } from '../../shared/local-coach';
import { normalizeReadiness, readinessModifier } from '../../shared/readiness';
import { sessionInputSchema, measurementInputSchema } from '../../shared/schemas';
import { buildProgressionRules, buildDeloadWeekDays, sessionsToCsv, csvEscape, workSets, logTonnage, bestSetE1rm } from '../../shared/training';
import { careRecords, CARE_SYNC_TYPES } from '../../shared/care-sync';
import { emptySkinProfile, SKIN_PRODUCT_TEMPLATE, localLogReview } from '../../shared/skin';
import { syncRecordsFromDb, type SyncEntityType } from '../../shared/sync';
import { validateCareProposal } from '../../shared/care-proposal';
import { localDateKey } from '../../shared/evidence';
import { EMAIL_MESSAGES } from '../../shared/email-contract';
import type { AppDb, PublicSettings, Session, Week } from '../../shared/types';

type Data = Record<string, any>;
const now = () => new Date().toISOString();
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const json = (value: unknown, status = 200) => Response.json(value, { status });
async function restoreCloudBackup(ws: CloudWorkspace, backup: Data) {
  const incoming = backupRecords(backup);
  const biological = (backup.biologicalRecords || []).map((r: unknown) => bioSchema.parse(r));
  const comparison = compareBackup(incoming, ws.records);
  const existing = new Map((await readBiologicalCloud(ws.session)).map(r => [r.record_id, r]));
  let imported = 0, conflicts = comparison.filter(r => r.status === 'conflict').length;
  for (const row of biological) {
    const previous = existing.get(row.id);
    if (previous) { if (canonical(previous.payload) !== canonical(row)) conflicts++; continue; }
    const result = await writeBiologicalCloud(ws.session, { ...row, userId: ws.session.uid, syncState: 'saved' }, null);
    if (result.status === 'conflict') conflicts++; else imported++;
    existing.set(row.id, {record_id:row.id,payload:result.payload,revision:result.revision});
  }
  for (const item of comparison.filter(r => r.status === 'new')) {
    await ws.save(item.record.entityType, item.record.payload as Data, item.record.id); imported++;
  }
  return {ok:true, imported, conflicts, unchanged:comparison.filter(r => r.status === 'same').length};
}
let mutation: Promise<unknown> = Promise.resolve();

/** Supabase remains authoritative; optional local computation uses owner-scoped cloud jobs. */
export class CloudWorkspace {
  constructor(public records: CloudRecord[], public session: Awaited<ReturnType<typeof activeSession>>) {}
  catalog = new Map<string, Data>();
  catalogCheckedAt = 0;
  db(): AppDb { const db = snapshotFromRecords(this.records); db.meta.storage = 'supabase'; if (!this.get('trainingConfig') && !db.weeks.length) db.trainingConfig.preplannedWeekMode = false; db.exercises = Array.from(new Map([...db.exercises.map(e => [e.id, e] as const), ...Array.from(this.catalog, ([id, e]) => [id, { ...db.exercises.find(p => p.id === id), ...e, id }] as const)]).values()).filter(e => typeof e.name === 'string' && e.name.trim()).map(e => ({ ...e, name: e.name!, aliases: e.aliases || [], muscles: e.muscles || [], equipment: e.equipment || '', movementPattern: e.movementPattern || '', substitutions: e.substitutions || [] })); return db; }
  get(type: SyncEntityType, id?: string) { return this.records.find(r => !r.deletedAt && r.entityType === type && (!id || r.id === id)); }
  async save(type: SyncEntityType, payload: Data, id = String(payload.id || crypto.randomUUID())) {
    const previous = this.records.find(r => r.entityType === type && r.id === id);
    const updatedAt = now();
    const record = await writeCloud(this.session.config, this.session, { id, entityType: type, payload: { ...payload, id }, revision: (previous?.revision || 0) + 1, updatedAt, createdAt: previous?.createdAt || updatedAt, deviceId: 'body-os-cloud-web', workspace: type.startsWith('skin') || type.startsWith('care') ? 'care' : 'training', payloadVersion: 1 }, previous);
    this.records = [...this.records.filter(r => !(r.entityType === type && r.id === id)), record];
    await writeWorkspaceCache(this.session, [record], []);
    return record.payload as Data;
  }
  async remove(type: SyncEntityType, id: string) {
    const previous = this.get(type, id);
    if (!previous) return;
    const record = await writeCloud(this.session.config, this.session, { ...previous, deletedAt: now(), updatedAt: now(), revision: previous.revision + 1 }, previous);
    this.records = this.records.map(r => r === previous ? record : r);
    await writeWorkspaceCache(this.session, [record], []);
  }
  settings(): PublicSettings {
    const prefs = (this.get('sharedPreferences', 'shared-preferences')?.payload || {}) as Data;
    const profile = this.db().profile;
    const { aiApiKey, openRouterApiKey, nvidiaNimApiKey, tavilyApiKey, braveSearchApiKey, giphyApiKey, youtubeApiKey, ...publicPrefs } = prefs;
    return { ...publicPrefs, senderName: 'Health OS', streakStartDate: '', aiProvider: prefs.aiProvider || 'openrouter', aiModel: prefs.aiModel || 'openrouter/free', reportSchedule: prefs.reportSchedule || 'Sunday 20:00', profileName: profile.displayName, height: profile.height, units: profile.units || prefs.units || 'kg',
      isActivated: true, hasSeenFeatureGuide: true, userEmail: this.session.email, senderEmail: this.session.email, recipients: [this.session.email], hasAppPassword: true,
      hasPin: false, hasAiApiKey: Boolean(prefs.aiApiKey || prefs.openRouterApiKey || prefs.nvidiaNimApiKey), hasOpenRouterApiKey: Boolean(prefs.openRouterApiKey), hasNvidiaNimApiKey: Boolean(prefs.nvidiaNimApiKey),
      hasTelegramBot: Boolean(prefs.telegramEnabled), hasBraveSearchApiKey: Boolean(prefs.braveSearchApiKey), hasTavilyApiKey: Boolean(prefs.tavilyApiKey), hasYoutubeApiKey: Boolean(prefs.youtubeApiKey?.trim()), hasGdrive: false,
    };
  }
  async saveSession(body: Data) {
    const input = sessionInputSchema.parse(body) as Data;
    const db = this.db();
    const previous = input.id ? this.get('session', input.id) : undefined;
    if (previous) {
      const saved = previous.payload as Session;
      const strip = (logs: any[]) => logs.map(({ aiCoachComment, ...log }) => log);
      if (saved.date !== input.date || canonical(strip(saved.logs)) !== canonical(strip(input.logs))) fail('This workout ID has different saved sets. Open Records to edit it.', 409);
      return saved;
    }
    const date = input.date || localDateKey();
    if (db.sessions.some(s => s.weekId === input.weekId && s.dayKey === input.dayKey && s.date === date && ['completed', 'finished'].includes(s.status))) fail('This day already has a saved workout. Open Records to edit it.', 409);
    const week = db.weeks.find(w => w.id === input.weekId);
    const readiness = db.readiness.find(r => r.date === date && r.weekId === input.weekId && r.dayKey === input.dayKey) || db.readiness.find(r => r.date === date) || input.readiness || null;
    const session = await this.save('session', { ...input, units: db.profile.units, status: 'finished', date, createdAt: now(), updatedAt: now(),
      weekId: input.weekId || db.meta.activeWeekId, weekName: week?.name || input.weekName || '', weekNumber: week?.weekNumber || input.weekNumber || '',
      name: input.name || db.profile.displayName || 'Athlete', dayTitle: input.dayTitle || 'Workout', dayKey: input.dayKey || days[(new Date(`${date}T12:00:00`).getDay() + 6) % 7],
      sleep: readiness?.sleepHours ?? input.sleep ?? '', soreness: readiness?.soreness ?? input.soreness ?? '', readiness, endedAt: input.endedAt || now(),
    });
    // The saved session is the source of truth even if this secondary update fails.
    if (week?.mode === 'flexible') await this.advanceWeek(week, session.dayKey, 'workout').catch(() => {});
    return session;
  }
  async advanceWeek(week: Week, key: string, status: 'workout' | 'rest') {
    const dayStates = { ...week.dayStates };
    if (!dayStates[key]) fail('This flexible day is unavailable.');
    dayStates[key] = { ...dayStates[key], status, completedAt: now() };
    const next = days[days.indexOf(key) + 1];
    if (next && dayStates[next]?.status === 'locked') dayStates[next] = { ...dayStates[next], status: 'ready' };
    await this.save('week', { ...week, dayStates }, week.id);
  }
}

let cached: { owner: string; workspace: CloudWorkspace; cursor: number; checkedAt: number } | null = null;
let invalidationVersion=0;
export function invalidateCloudWorkspace(){invalidationVersion++;if(cached){cached.checkedAt=0;cached.workspace.catalogCheckedAt=0;}}
let loading: Promise<CloudWorkspace> | null = null;
let loadController: AbortController | null = null;
const loadProgress = (message:string) => window.dispatchEvent(new CustomEvent('health-os-workspace-progress',{detail:message}));
window.addEventListener('body-os-cloud-refresh', invalidateCloudWorkspace);
window.addEventListener('body-os-account-changed', () => { loadController?.abort(); cached = null; loading = null; });
async function fillMissingCatalog(workspace: CloudWorkspace, controller: AbortController) {
  if (Date.now() - workspace.catalogCheckedAt < 60000) return [];
  const session = workspace.session;
  const added: (Data & { id: string })[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${session.config.url}/rest/v1/body_os_exercises?catalog_status=neq.disabled&select=*,body_os_exercise_media!body_os_exercise_media_exercise_id_fkey(*)&order=id&limit=1000&offset=${offset}`, {
      headers: { apikey: session.config.publishableKey, Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
    });
    if (!response.ok) fail('Could not load the shared exercise library.', response.status);
    const rows = await response.json();
    for (const row of rows) {
      const entry = catalogExercise(row, [], (row.body_os_exercise_media || []).filter((m: Data) => m.media_type === 'tutorial'));
      added.push(entry);
    }
    if (rows.length < 1000) break;
  }
  workspace.catalog = new Map(added.map(entry => [entry.id, entry]));
  workspace.catalogCheckedAt = Date.now();
  return added;
}
async function loadWorkspace() {
  const session = await activeSession();
  const owner = workspaceScope(session);
  if (loading) { const ws = await loading; if (workspaceScope(ws.session) === owner && cached?.checkedAt) return ws; }
  if (cached?.owner === owner && Date.now() - cached.checkedAt < 5000) return cached.workspace;
  const controller=new AbortController();loadController=controller;
  const taskVersion=invalidationVersion;
  const timeout=window.setTimeout(()=>controller.abort(new Error('Cloud loading took too long. Check your connection and retry.')),90000);
  const checkAccount = () => {
    controller.signal.throwIfAborted();
    const current = storedSession();
    if (!current || workspaceScope(current) !== owner) fail('Account changed.', 401);
  };
  const task = (async () => {
    if (cached?.owner !== owner) {
      loadProgress('Opening your saved workspace…');
      const saved = await readWorkspaceCache(session);
      checkAccount();
      if (saved) {
        const workspace = new CloudWorkspace(saved.records, session);
        workspace.catalog = new Map(saved.catalog.map(entry => [entry.id, entry]));
        cached = { owner, workspace, cursor: saved.cursor, checkedAt: 0 };
      }
    }
    if (cached?.owner === owner) {
      const current = cached;
      current.workspace.session = session;
      loadProgress('Checking for new cloud records…');
      let more = true;
      while (more) {
        checkAccount();
        const previousCursor=current.cursor;
        const delta = await pullCloudDelta(session.config, session, previousCursor, 500,controller.signal);
        checkAccount();
        if(!Number.isSafeInteger(delta.cursor)||delta.cursor<previousCursor||(delta.hasMore&&delta.cursor<=previousCursor)||delta.records.some(r=>!r.changeVersion||r.changeVersion<=previousCursor||r.changeVersion>delta.cursor))fail('Cloud updates did not advance. Retry loading your workspace.');
        const values = new Map(current.workspace.records.map(r => [`${r.entityType}:${r.id}`, r]));
        for (const record of delta.records) {
          const key = `${record.entityType}:${record.id}`, old = values.get(key);
          if (!old || (record.changeVersion || 0) >= (old.changeVersion || 0)) values.set(key, record);
        }
        current.workspace.records = [...values.values()]; current.cursor = delta.cursor; more = delta.hasMore;
        if (delta.records.length || delta.cursor !== previousCursor) await writeWorkspaceCache(session, delta.records, [], delta.cursor, false, previousCursor);
      }
      const added = await fillMissingCatalog(current.workspace, controller);
      checkAccount();
      if (added.length) await writeWorkspaceCache(session, [], added, current.cursor, false, current.cursor);
      current.checkedAt = taskVersion===invalidationVersion?Date.now():0;
      return current.workspace;
    }
    loadProgress('Downloading your cloud records…');
    const records = await readCloud(session.config, session,{keyset:true,signal:controller.signal,onProgress:count=>loadProgress(`Loaded ${count.toLocaleString()} cloud records…`)});
    const workspace = new CloudWorkspace(records, session);
    await fillMissingCatalog(workspace, controller);
    checkAccount();
    loadProgress('Opening your workspace…');
    const cursor = records.reduce((value, record) => Math.max(value, record.changeVersion || 0), 0);
    // These records are already in the account. A derivative browser cache
    // must not hold the first usable screen behind a large IndexedDB commit.
    // Its cursor and rows still commit atomically; failure falls back to cloud.
    void writeWorkspaceCache(session, records, [...workspace.catalog.values()] as (Data & {id:string})[], cursor, true);
    cached = { owner, workspace, cursor, checkedAt: taskVersion===invalidationVersion?Date.now():0 };
    return workspace;
  })();
  loading = task;
  try { return await task; } catch(error) { if(controller.signal.aborted)throw controller.signal.reason;throw error; } finally { window.clearTimeout(timeout);if(loadController===controller)loadController=null;if (loading === task) loading = null; }
}
async function email(reportType: string, reportId?: string) { return invokeCloud('body-os-email', { reportType, ...(reportId ? { reportId } : {}) }); }
async function delivery(id: string) {
  try { return await email('workout', id); } catch (error) { return { ok: false, error: (error as Error).message, sentTo: [] }; }
}

async function route(url: URL, method: string, body: any, signal?:AbortSignal|null): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/auth/status') { await activeSession(); return json({ hasPin: false }); }
  if (path === '/health') return json({ ok: true, storage: 'supabase' });
  if (path === '/voice/status') {
    const {workers}=await workerStatus();
    const online=workers.filter((w:any)=>w.online);
    const available=online.some((w:any)=>w.capabilities.voice?.available);
    const message=available ? undefined : !workers.length
      ? 'Connect your personal worker to this Health OS account. Open Settings → Connections → Local worker for setup, then try again. You can also type below.'
      : !online.length
        ? 'Your personal worker is offline. Start it on your computer, keep it running, then try again. Check Settings → Connections → Local worker. You can also type below.'
        : 'Your online worker needs voice setup. Run npm run voice:setup on its computer, then restart the worker and try again. You can also type below.';
    return json({available,busy:false,provider:'personal-worker',message});
  }
  if (path === '/voice/transcribe') return json(await runWorkerJob('voice.transcribe',body,180000,signal));
  if (path === '/send-dummy-email') return json(await email('test'));
  if (path === '/feedback') return json(await invokeCloud('body-os-email', { reportType: 'feedback', category: body.category, message: body.message }));
  if (path === '/send-report') return json(await email('workout', body.sessionId));
  if (path.startsWith('/ai/') || path === '/ai-coach') return json(await invokeCloud('body-os-ai', { action: path, ...body }));
  if (path.startsWith('/updates/')) return json({ updateAvailable: false, currentVersion: '5.1.0', latestVersion: '5.1.0', notice: null, phase: 'idle', message: 'Your web app updates automatically.' });
  if (path === '/queue/pending') return json([]);
  const ws = await loadWorkspace();
  let db = ws.db();
  if (path === '/exercise-catalog/media' && method === 'POST') return json(await ensureLibraryMedia(ws, body));
  if(path.startsWith('/visuals/')){
    const id=decodeURIComponent(path.slice('/visuals/'.length));if(!id||id.length>200)fail('Invalid photo identity.');
    if(method==='GET'){const record=ws.get('personalPhoto',id);return json(record?(await photoUrls(ws.session,[record.payload as Data]))[0]:{dataUrl:''});}
    if(method==='DELETE'){if(ws.get('personalPhoto',id))await ws.remove('personalPhoto',id);return json({ok:true});}
    const preview=body.copyFrom?(ws.get('personalPhoto',body.copyFrom)?.payload as Data)?.preview:await uploadPhoto(ws.session,body.dataUrl);
    if(preview)await ws.save('personalPhoto',{id,preview,createdAt:now()},id);return json({ok:true});
  }
  if(path==='/automations/state') {
    if(method==='GET')return json({state:(ws.get('automationState','health-os-automations')?.payload as Data)?.state});
    if(!body.state||typeof body.state!=='object'||JSON.stringify(body.state).length>10000000)fail('Invalid automation state.');
    await ws.save('automationState',{state:body.state},'health-os-automations');return json({ok:true});
  }
  if(path.startsWith('/medical/')) {
    const {medicalCloudRoute}=await import('./medical-cloud');return medicalCloudRoute(path,method,body,ws);
  }
  if(path==='/biology/foods')return json(await invokeCloud('body-os-integrations',{action:path,query:url.searchParams.get('q'),barcode:url.searchParams.get('barcode')==='true'}));
  if(path.startsWith('/biology/'))return json(await invokeCloud('body-os-ai',{action:path,...body}));
  const prefs = () => (ws.get('sharedPreferences', 'shared-preferences')?.payload || {}) as Data;
  if (path === '/bootstrap') {
    // Repair flexible-day state from durable sessions after an interrupted request.
    for (const week of db.weeks.filter(w => w.mode === 'flexible' && w.status === 'draft')) {
      for (const session of db.sessions.filter(s => s.weekId === week.id && ['finished', 'completed'].includes(s.status))) {
        const current = ws.db().weeks.find(w => w.id === week.id)!;
        if (current.dayStates?.[session.dayKey]?.status !== 'workout') await ws.advanceWeek(current, session.dayKey, 'workout');
      }
    }
    db = ws.db();
    const settings = ws.settings();
    const ready = db.readiness.find(r => r.date === localDateKey());
    const draft=(ws.get('workoutDraft','active-workout')?.payload as Data)?.draft;
    return json({ db, skin: db.skin, settings, currentDraft:isCompletedWorkout(draft,db.sessions)?null:draft, analytics: computeMetrics(db), coach: localCoach(db), programming: ready ? readinessModifier(ready.score, ready.painFlag) : null, urls: { local: location.origin, network: [] } });
  }
  if (path === '/workout-draft') {
    if(isCompletedWorkout(body.draft,db.sessions))return json({ok:true,completed:true});
    if (body.draft) await ws.save('workoutDraft', { draft: body.draft }, 'active-workout');
    else await ws.remove('workoutDraft', 'active-workout');
    return json({ ok: true });
  }
  if (path === '/settings') {
    if (method !== 'GET') {
      const allowed = ['uxPreferences', 'weeklyGoal', 'restSeconds', 'aiProvider', 'aiModel', 'aiApiKey', 'openRouterApiKey', 'nvidiaNimApiKey', 'tavilyApiKey', 'braveSearchApiKey', 'gender', 'hasSeenFeatureGuide', 'workoutReportEnabled', 'weeklyReportEnabled', 'monthlyReportEnabled', 'healthReportEnabled', 'skincareReportEnabled', 'reportSchedule', 'emailTimezone', 'telegramEnabled'];
      if(body.uxPreferences!==undefined) body.uxPreferences=uxPreferencesSchema.parse(body.uxPreferences);
      if(body.units!==undefined&&!['kg','lb'].includes(body.units))fail('Choose kilograms or pounds.');
      if(body.aiProvider!==undefined&&!['openrouter','nvidia'].includes(body.aiProvider))fail('Choose a cloud AI provider.');
      if(body.weeklyGoal!==undefined&&(!Number.isInteger(Number(body.weeklyGoal))||Number(body.weeklyGoal)<1||Number(body.weeklyGoal)>7))fail('Weekly workout goal must be between 1 and 7.');
      if(body.restSeconds!==undefined&&(!Number.isFinite(Number(body.restSeconds))||Number(body.restSeconds)<0||Number(body.restSeconds)>3600))fail('Rest timer must be between 0 and 3600 seconds.');
      if(body.reportSchedule!==undefined&&!/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) ([01][0-9]|2[0-3]):[0-5][0-9]$/.test(body.reportSchedule))fail('Use a schedule such as Sunday 20:00.');
      const patch = Object.fromEntries(allowed.filter(k => body[k] !== undefined && (!k.endsWith('ApiKey') || body[k] !== '')).map(k => [k, body[k]]));
      if(body.aiApiKey)patch[(body.aiProvider||prefs().aiProvider)==='nvidia'?'nvidiaNimApiKey':'openRouterApiKey']=body.aiApiKey;
      await ws.save('sharedPreferences', { version: 1, ...prefs(), ...patch, units: body.units || db.profile.units, updatedAt: now() }, 'shared-preferences');
      await ws.save('profile', { ...db.profile, displayName: body.profileName ?? db.profile.displayName, units: body.units || db.profile.units, height: body.height ?? db.profile.height }, ws.get('profile')?.id || 'profile');
    }
    return json(ws.settings());
  }
  if (path === '/sessions' || path === '/sessions/finish-and-send') {
    if (method === 'GET') return json({ sessions: db.sessions });
    const session = await ws.saveSession(body);
    await ws.remove('workoutDraft', 'active-workout').catch(() => {});
    // Email and optional AI are separate from the durable workout save.
    return json({ session });
  }
  if (path === '/sessions/import') {
    let imported = 0, skipped = 0;
    for (const session of (Array.isArray(body) ? body : body.sessions || [])) { if (ws.get('session', session.id)) { skipped++; continue; } await ws.saveSession(session); imported++; }
    return json({ imported, skipped });
  }
  if (['/sessions/previous', '/sessions/previous-sets'].includes(path)) {
    const name = String(url.searchParams.get('exercise') || url.searchParams.get('name') || '').toLowerCase();
    const session = db.sessions.filter(s => ['finished', 'completed'].includes(s.status)).sort((a, b) => b.date.localeCompare(a.date)).find(s => s.logs.some(l => l.name.toLowerCase() === name));
    return json({ sets: session?.logs.find(l => l.name.toLowerCase() === name)?.sets || [] });
  }
  if (path === '/sessions/progression' || path === '/progression') return json({ tips: buildProgressionRules(db).filter(t => !url.searchParams.get('exercise') || t.exercise === url.searchParams.get('exercise')) });
  if (path === '/sessions/missed') return json({ session: await ws.save('session', { ...body, logs: [], status: 'skipped', createdAt: now() }) });
  if (path === '/readiness') {
    const result = normalizeReadiness(body, db.readiness);
    if (!result.item) fail(result.error || 'Check readiness inputs.');
    const item = result.item!;
    const existing = db.readiness.find(r => r.date === item.date && r.weekId === item.weekId && r.dayKey === item.dayKey);
    return json(await ws.save('readiness', item, existing?.id || item.id || `readiness-${item.date}-${item.weekId || ''}-${item.dayKey || ''}`));
  }
  if (path === '/reports/pending' || path === '/reports/pending/retry' || path === '/reports/deliver-session') {
    const { jobs } = await invokeCloud('body-os-email', { action: 'queue' });
      const pending = jobs.map((j: Data) => ({ sessionId: j.report_id, createdAt: j.created_at, attempts: j.attempts || 0, status: j.status, nextAttemptAt: j.next_attempt_at, lastError: EMAIL_MESSAGES[j.last_error as keyof typeof EMAIL_MESSAGES] || (j.status === 'processing' ? 'Generating AI report and delivering email.' : 'AI report is queued for automatic retry.') }));
    if (method === 'GET') return json({ pending, reports: pending });
    if (body.sessionId) { const result = await delivery(body.sessionId); if (!result.ok) fail(result.error || 'Report delivery failed.', 503); return json({ delivery: result }); }
    const results = []; for (const item of pending) results.push(await delivery(item.sessionId));
    return json({ results });
  }
  if (path.startsWith('/reports/')) {
    const {reportHtml}=await import('../../shared/report-html');
    const parts = path.split('/');
    const kind = parts[2] as 'session' | 'week' | 'progress';
    if (url.searchParams.get('from')) db.sessions = db.sessions.filter(s => s.date >= url.searchParams.get('from')!);
    if (url.searchParams.get('to')) db.sessions = db.sessions.filter(s => s.date <= url.searchParams.get('to')!);
    return new Response(reportHtml(db, kind, parts[3]), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (path === '/export/csv') return new Response(sessionsToCsv(db.sessions), { headers: { 'Content-Type': 'text/csv' } });
  if (path === '/export/measurements.csv') return new Response(['date,weight,bodyFat,waist', ...db.measurements.map(m => [m.date, m.weight, m.bodyFat, m.waist].map(csvEscape).join(','))].join('\r\n'), { headers: { 'Content-Type': 'text/csv' } });
  if (path === '/backup') return json({ ...db, format:'body-os-cloud-v1',ownerId:ws.session.uid,cloudRecords:portableRecords(ws.records),biologicalRecords:(await readBiologicalCloud(ws.session)).map(r=>r.payload) });
  if(path === '/backup/preview' && method === 'POST'){
    const incoming=backupRecords(body),biological=(body.biologicalRecords||[]).map((row:unknown)=>bioSchema.parse(row));
    const comparison=compareBackup(incoming,ws.records),existing=new Map((await readBiologicalCloud(ws.session)).map(row=>[row.record_id,row.payload]));
    return json({newRecords:comparison.filter(row=>row.status==='new').length+biological.filter((row:any)=>!existing.has(row.id)).length,unchanged:comparison.filter(row=>row.status==='same').length,conflicts:comparison.filter(row=>row.status==='conflict').length+biological.filter((row:any)=>existing.has(row.id)&&canonical(existing.get(row.id))!==canonical(row)).length,total:incoming.length+biological.length,differentOwner:Boolean(body.ownerId&&body.ownerId!==ws.session.uid)});
  }
  if (path === '/backup/restore') {
    return json(await restoreCloudBackup(ws, body));
  }
  if(path.startsWith('/gdrive/')||path.startsWith('/telegram/')){
    if(path==='/gdrive/backup')return json(await invokeCloud('body-os-integrations',{action:path,backup:{format:'body-os-cloud-v1',ownerId:ws.session.uid,cloudRecords:portableRecords(ws.records),biologicalRecords:(await readBiologicalCloud(ws.session)).map(r=>r.payload)}}));
    if(path==='/gdrive/restore'){
      const {backup}=await invokeCloud('body-os-integrations',{action:path,...body});
      return json(await restoreCloudBackup(ws, backup));
    }
    return json(await invokeCloud('body-os-integrations',{action:path,...body}));
  }
  if (path === '/analytics') return json(computeMetrics(db));
  if (path === '/analytics-lab/rebuild') return json(await runWorkerJob('analytics.rebuild'));
  if (path === '/analytics-lab/status') {const status=await workerStatus();return json({available:status.workers.some((w:any)=>w.online&&w.capabilities.duckdb?.available),engine:'DuckDB on your personal worker'});}
  if (path === '/reports/workout-pdf') return json(await runWorkerJob('report.pdf',{sessionId:body.sessionId}));
  if (path === '/exercise-history') {
    const name = url.searchParams.get('name') || '';
    const familyId = db.trainingConfig.exerciseFamilies?.[name.toLowerCase()] || db.exercises.find(e => e.name.toLowerCase() === name.toLowerCase())?.familyId;
    const names = new Set([name.toLowerCase(), ...db.exercises.filter(e => familyId && e.familyId === familyId).map(e => e.name.toLowerCase()), ...Object.entries(db.trainingConfig.exerciseFamilies || {}).filter(([,id]) => familyId && id === familyId).map(([n]) => n.toLowerCase())]);
    return json({ name, familyId, history: db.sessions.filter(s => ['completed', 'finished'].includes(s.status)).sort((a,b) => a.date.localeCompare(b.date)).flatMap(s => s.logs.filter(l => l.status !== 'skipped' && (names.has(l.name.toLowerCase()) || (familyId && l.familyId === familyId))).map(l => ({ name:l.name, date:s.date, sessionId:s.id, dayTitle:s.dayTitle, sets:workSets(l.sets), bestE1rm:Math.round(bestSetE1rm(l)*10)/10, tonnage:logTonnage(l,true) }))) });
  }
  if (path === '/training-config') { if (method === 'GET') return json(db.trainingConfig); return json(await ws.save('trainingConfig', { ...db.trainingConfig, ...body }, ws.get('trainingConfig')?.id || 'training-config')); }
  if (path === '/flexible-weeks/start') {
    const today = localDateKey();
    const resumed = db.weeks.find(w => w.mode === 'flexible' && w.status === 'draft' && w.flexibleStartDate! <= today && w.flexibleEndDate! >= today);
    if (resumed) return json({ week: resumed, resumed: true });
    const date = new Date(`${today}T12:00:00`); const index = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - index + (body.strategy === 'next-monday' ? 7 : 0));
    const at = (n: number) => { const d = new Date(date); d.setDate(d.getDate() + n); return localDateKey(d); };
    const first = body.strategy === 'today' ? index : 0;
    const week = await ws.save('week', { name: 'Flexible training week', weekNumber: '', startDate: at(0), notes: '', active: true, status: 'draft', mode: 'flexible', flexibleStartDate: at(first), flexibleEndDate: at(6), flexibleFirstDayKey: days[first], dayStates: Object.fromEntries(days.map((key, i) => [key, { date: at(i), status: i < first ? 'not_in_week' : i === first ? 'ready' : 'locked' }])), days: days.map(key => ({ key, type: 'flexible', title: 'Flexible workout', subtitle: '', muscles: [], exercises: [] })) });
    await ws.save('workspaceState', { activeWeekId: week.id }, 'workspace-state');
    return json({ week });
  }
  const flex = path.match(/^\/flexible-weeks\/([^/]+)\/(rest|complete)$/);
  if (flex) {
    const week = db.weeks.find(w => w.id === flex[1]); if (!week || week.mode !== 'flexible') fail('Flexible week not found.', 404);
    if (flex[2] === 'rest') { if (week!.dayStates?.[body.dayKey]?.status !== 'ready') fail('Complete earlier days first.'); await ws.advanceWeek(week!, body.dayKey, 'rest'); return json({ ok: true }); }
    if (!String(body.name || '').trim()) fail('Name your completed week.');
    if (Object.values(week!.dayStates || {}).some(s => !['workout', 'rest', 'not_in_week'].includes(s.status))) fail('Complete every available day first.');
    const template = await ws.save('librarySplit', { ...week, id: crypto.randomUUID(), name: body.name, active: false, status: 'program', mode: 'planned', days: week!.days.map(d => { const s = db.sessions.find(s => s.weekId === week!.id && s.dayKey === d.key); return { ...d, exercises: (s?.logs || []).filter(l => l.status === 'completed').map(l => ({ name: l.name, target: l.target, vol: `${l.sets.length} x ${l.sets[0]?.r || 10}`, cue: '', trackingMode: l.trackingMode })) }; }) });
    await ws.save('week', { ...week, name: body.name, status: 'completed' }, week!.id); return json({ ok: true, templateId: template.id });
  }
  const weekAction = path.match(/^\/weeks\/(?:deload-from\/)?([^/]+)(?:\/(activate|complete|duplicate))?$/);
  if (method === 'POST' && (path === '/weeks/import' || path === '/library-splits')) {
    const value = body.week || body;
    if (!Array.isArray(value.days)) fail('Week must contain days.');
    const linkedDays = [];
    const linked = new Map<string, { name: string; exerciseId: string }>();
    for (const day of value.days) {
      const exercises = [];
      for (const item of day.exercises || []) {
        const exercise = await ensureLibraryExercise(ws, item);
        linked.set(exercise.id, { name: exercise.name, exerciseId: exercise.id });
        exercises.push({ ...item, exerciseId: exercise.id });
      }
      linkedDays.push({ ...day, exercises });
    }
    // Save the plan before optional provider calls; media failures never discard an import.
    const saved = await ws.save(path === '/library-splits' ? 'librarySplit' : 'week', { active: false, name: 'Training week', weekNumber: '', notes: '', startDate: localDateKey(), ...value, days: linkedDays, id: value.id || crypto.randomUUID() });
    const mediaErrors: string[] = [];
    const inputs = [...linked.values()];
    for (let i = 0; i < inputs.length; i += 3) {
      const results = await Promise.allSettled(inputs.slice(i, i + 3).map(input => ensureLibraryMedia(ws, input)));
      for (const result of results) {
        if (result.status === 'fulfilled') mediaErrors.push(...result.value.errors);
        else mediaErrors.push(result.reason instanceof Error ? result.reason.message : 'Could not save exercise media.');
      }
    }
    return json({ ...saved, mediaErrors: [...new Set(mediaErrors)] });
  }
  if (weekAction) {
    const week = db.weeks.find(w => w.id === weekAction[1]);
    const action = weekAction[2];
    if (method === 'GET') { if (!week) fail('Week not found.', 404); return json(week); }
    if (method === 'DELETE') { await ws.remove('week', weekAction[1]); return json({ ok: true }); }
    if (action && !week) fail('Week not found.', 404);
    if (action === 'activate') { await ws.save('workspaceState', { activeWeekId: week!.id }, 'workspace-state'); return json({ ok: true }); }
    if (action === 'complete') return json(await ws.save('week', { ...week, status: 'completed', active: false }, week!.id));
    if (action === 'duplicate' || path.includes('deload-from')) return json(await ws.save('week', { ...week, id: crypto.randomUUID(), active: false, name: `${week!.name} · ${action === 'duplicate' ? 'copy' : 'deload'}`, ...(path.includes('deload-from') ? { days: buildDeloadWeekDays(week!, Number(body.volumeMultiplier || 0.6)) } : {}) }));
    return json(await ws.save('week', { name: 'Training week', weekNumber: '', startDate: '', notes: '', active: false, days: [], ...week, ...body }, weekAction[1]));
  }
  if (path === '/skin') return json(db.skin);
  if (path === '/medical-reports') return json({reports:ws.records.filter(r=>r.entityType==='medicalReport'&&!r.deletedAt).map(r=>r.payload)});
  if (path === '/skin/photos') {
    if (method === 'GET') return json(await photoUrls(ws.session, ws.records.filter(r => r.entityType === 'carePhoto' && !r.deletedAt).map(r => r.payload as Data)));
    const previous = body.id ? ws.get('carePhoto', body.id)?.payload as Data : undefined;
    const preview = body.dataUrl?.startsWith('data:') ? await uploadPhoto(ws.session, body.dataUrl) : previous?.preview;
    if (!preview) fail('Choose a photo to upload.');
    if (!['face','body','hair','scalp'].includes(body.area) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) fail('Choose a valid photo date and area.');
    const photo = await ws.save('carePhoto', { id:body.id, area:body.area, date:body.date, note:String(body.note || '').slice(0,2000), aiObservation:body.aiObservation ?? previous?.aiObservation ?? '', preview, original:body.dataUrl?.startsWith('data:') ? preview : previous?.original || preview, createdAt:previous?.createdAt || now() });
    return json((await photoUrls(ws.session,[photo]))[0]);
  }
  if (path === '/skin/photos/observe') return json(await invokeCloud('body-os-ai', { action:path, ...body }));
  if (path === '/skin/photos/migrate') {
    let migrated=0;
    for(const record of ws.records.filter(r=>r.entityType==='carePhoto'&&!r.deletedAt&&(r.payload as Data).dataUrl?.startsWith('data:'))){const photo=record.payload as Data;const preview=await uploadPhoto(ws.session,photo.dataUrl);const {dataUrl,...metadata}=photo;await ws.save('carePhoto',{...metadata,preview,original:photo.original||preview},record.id);migrated++;}
    return json({ok:true,migrated});
  }
  if (path === '/skin/products/read-label' || path === '/skin/products/search-web') return json(await invokeCloud('body-os-ai', { action:path, ...body }));
  if (path.startsWith('/skin/photos/') && method === 'DELETE') { await ws.remove('carePhoto', path.split('/').pop()!); return json({ ok: true }); }
  if (path === '/skin/proposal/validate') return json(validateCareProposal(body, db.skin!));
  if (path === '/skin/proposal/apply') {
    const care = db.skin!.care;
    if (body.baseRevision !== care.revision || body.baseUpdatedAt !== care.updatedAt) fail('Care changed. Review a fresh proposal.', 409);
    const proposal = validateCareProposal(body, db.skin!);
    body = { ...care, tasks: proposal.tasks, planHistory: [...care.planHistory, { id: crypto.randomUUID(), createdAt: now(), reason: proposal.reason, tasks: proposal.tasks }] };
  }
  if (path === '/skin/profile') return json(await ws.save('skinProfile', { ...emptySkinProfile(), ...db.skin?.profile, ...body }, ws.get('skinProfile')?.id || 'skin-profile'));
  if (path === '/skin/products/template') return json(SKIN_PRODUCT_TEMPLATE);
  if (path === '/skin/care' || path === '/skin/proposal/apply') {
    const current = db.skin!.care;
    if (body.revision !== current.revision || body.updatedAt !== current.updatedAt) fail('Care changed elsewhere. Reload before saving.', 409);
    if (!['tasks', 'goals', 'events', 'checkIns', 'reviews', 'planHistory'].every(key => Array.isArray(body[key]))) fail('Invalid care data.');
    const records = careRecords({ ...body, revision: current.revision + 1, updatedAt: now() }, 'cloud-web');
    const careTypes = new Set<string>(CARE_SYNC_TYPES);
    const response=await fetch(`${ws.session.config.url}/rest/v1/rpc/body_os_save_care`,{method:'POST',headers:{apikey:ws.session.config.publishableKey,Authorization:`Bearer ${ws.session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({expected_revision:current.revision,expected_updated_at:current.updatedAt,entries:records,expected_versions:Object.fromEntries(ws.records.filter(r=>!r.deletedAt&&careTypes.has(r.entityType)).map(r=>[`${r.entityType}:${r.id}`,r.changeVersion]))}),signal:AbortSignal.timeout(30000)});
    if(!response.ok){const error=await response.json().catch(()=>({}));fail(error.message||'Care cloud save failed.',response.status===409||error.code==='40001'?409:response.status);}
    const updated=(await response.json()).map((r:Data)=>({...validateRecord({...r,deletedAt:r.deletedAt||undefined}),changeVersion:r.changeVersion}));
    ws.records=[...ws.records.filter(r=>!careTypes.has(r.entityType)),...updated];
    await writeWorkspaceCache(ws.session, updated, []);
    return json(ws.db().skin!.care);
  }
  if (path === '/skin/logs' && method === 'POST') {
    const date = body.date || localDateKey();
    const log = await ws.save('skinLog', { ...body, date, createdAt: body.createdAt || now() }, body.id || db.skin!.logs.find(l => l.date === date)?.id || `skin-log-${date}`);
    return json({ log, skin: ws.db().skin, review: body.skipReview ? null : localLogReview(ws.db().skin!, log as any) });
  }
  if (path.endsWith('/import') && ['/exercises/import', '/skin/products/import'].includes(path)) {
    const list = Array.isArray(body) ? body : body.exercises || body.products || [];
    if (!Array.isArray(list)) fail('Choose a valid list.');
    for (const item of list) { if (path.startsWith('/skin')) await ws.save('skinProduct', item); else await ensureLibraryMedia(ws, { ...item, name: item.name, exerciseId: item.id, youtubeUrl: item.tutorialLink || undefined, action: item.tutorialLink ? 'contribute' : 'resolve' }); }
    return json({ imported: list.length, skipped: 0, errors: [] });
  }
  const routes: Record<string, SyncEntityType> = { sessions: 'session', targets: 'target', measurements: 'measurement', habits: 'habit', 'habit-logs': 'habitLog', cardio: 'cardio', 'goal-checkins': 'goalCheckIn', 'weekly-reviews': 'weeklyReview', exercises: 'exercise', programs: 'program', 'pain-logs': 'painLog', schedule: 'scheduledWorkout', 'library-splits': 'librarySplit', 'skin/products': 'skinProduct', 'skin/routines': 'skinRoutine', 'skin/logs': 'skinLog' };
  for (const [resource, type] of Object.entries(routes)) {
    if (path !== `/${resource}` && !path.startsWith(`/${resource}/`)) continue;
    const id = path.slice(resource.length + 2);
    if (method === 'DELETE') { if (type === 'exercise' && ws.catalog.has(id)) { const previous = ws.get(type, id)?.payload as Data | undefined; await ws.save(type, { ...previous, id, meta: { ...previous?.meta, archived: true } }, id); } else await ws.remove(type, id); return json({ ok: true }); }
    if (method === 'GET') return json({ [resource]: type === 'exercise' ? db.exercises : ws.records.filter(r => r.entityType === type && !r.deletedAt).map(r => r.payload) });
    if (type === 'exercise') {
      const shared = ws.catalog.get(id || body.id);
      if (shared && body.meta && Object.keys(body).every(key => ['id','name','meta'].includes(key))) return json(await ws.save('exercise', { ...ws.get(type, shared.id)?.payload as Data, ...body, id: shared.id }, shared.id));
      const result = await ensureLibraryMedia(ws, { ...body, name: body.name, exerciseId: id || body.id, youtubeUrl: body.tutorialLink || undefined, updateDetails: true, action: body.tutorialLink ? 'contribute' : 'resolve' });
      return json(result.exercise);
    }
    const existing = id ? ws.get(type, id)?.payload as Data : {};
    const value = type === 'measurement' ? measurementInputSchema.parse(body) : body;
    const record = await ws.save(type, { createdAt: now(), ...existing, ...value, updatedAt: now() }, id || body.id || undefined);
    return json(type === 'session' ? { session: record } : record);
  }
  return fail('This integration is not configured for the cloud web app.', 501);
}

/** Explicit transport for all web features, including HTML/CSV and former raw fetch calls. */
export async function cloudFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const address = input instanceof Request ? input.url : String(input);
  const url = new URL(address, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const owner = storedSession()?.uid;
  const run = async () => {
    try {
      if (!owner || storedSession()?.uid !== owner) return json({ error: 'Account changed. Try again after signing in.' }, 401);
      let body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      if(url.pathname==='/api/voice/transcribe'&&init.body instanceof Blob){
        if(init.body.size>3000000) return json({error:'Record a shorter clip (maximum 3 MB).'},413);
        const bytes=new Uint8Array(await init.body.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));body={base64:btoa(binary)};
      }
      const response = await route(url, method, body,init.signal);
      if (method !== 'GET' && response.ok) window.dispatchEvent(new Event('body-os-cloud-saved'));
      return response;
    } catch (error) {
      const e = error as Error & { status?: number; issues?: unknown[]; code?: string };
      return json({ error: e.message || 'Cloud request failed. Your draft is still available.', code: e.code }, e.status || (e.issues ? 400 : 503));
    }
  };
  // Long-running computation must not block workout saves behind the mutation queue.
  if (method === 'GET'||/\/api\/(voice\/transcribe|analytics-lab\/rebuild|reports\/workout-pdf|medical\/research\/|medical\/reports\/[^/]+\/(cql|validate-fhir|units))/.test(url.pathname)) return run();
  const result = mutation.then(run, run); mutation = result.catch(() => {}); return result;
}
