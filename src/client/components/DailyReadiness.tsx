import { readDraft, writeDraft, draftScope } from '../lib/use-draft';
import { useCloudAccount } from '../state/CloudAccountContext';
import { useEffect, useState } from 'react';
import type { Readiness } from '../../shared/types';
import { dateOf, num, preferredVitals, type BioRecord } from '../../shared/biology';
import { normalizeReadiness } from '../../shared/readiness';
import { atTime } from '../../shared/biological-intelligence';
import { api } from '../lib/api';
import { useBiologicalData } from '../lib/use-biological-data';
import { useAutomations } from '../state/AutomationContext';
import { Modal } from './Modal';
import { ReadinessCards } from './ReadinessCards';
import { HealthReadings } from './HealthReadings';
import { useToast } from './Toast';

export function DailyReadiness({ initial, date: requestedDate, defaults = {}, onSaved, close }: {
  initial?: BioRecord; date?: string; defaults?: Record<string, string | number | boolean>;
  onSaved?: () => void | Promise<void>; close: () => void;
}) {
  const { app, bio, stored, records } = useBiologicalData(), { preferences } = useAutomations(), toast = useToast();
  const today = dateOf(new Date().toISOString()), date = requestedDate || (initial ? dateOf(initial.timestamp) : today);
  const saved = app.db!.readiness.find(item => item.date === date);
  const known = initial || stored.filter(record => record.type === 'checkIn' && dateOf(record.timestamp) === date && record.quality !== 'estimated' && (record.metadata.requiresConfirmation !== true || record.metadata.confirmed === true)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const sleep = records.filter(record => record.type === 'sleep' && dateOf(record.timestamp) === date).sort((a,b) => b.timestamp.localeCompare(a.timestamp))[0];
  const vital = (metric: string) => preferredVitals(records, metric).find(record => dateOf(record.timestamp) === date)?.value;
  const cloud=useCloudAccount();
  const draftKey = `readiness:${date}`;
  const storageKey=`${draftScope(cloud.savedConfig?.url||'local',cloud.user?.id||'guest')}|${draftKey}`;
  const [legacyKey,setLegacyKey]=useState(()=>{try{return Object.keys(localStorage).find(key=>(key.startsWith('body-os-readiness-v4:')&&key.endsWith(`:${date}`))||key===`body-os-readiness-v5:${date}`||key===`body-os-recover-${date}`)||'';}catch{return '';}});
  const [version, setVersion] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const previous: Record<string, any> = saved ? { ...saved } : {
      sleepHours: sleep?.value, sleepQuality: sleep ? num(sleep, 'quality') ?? undefined : undefined,
      restingHeartRate: vital('Resting HR'), steps: vital('Steps'),
      ...(preferences.adaptiveCheckin ? known?.metadata : {}),
    };
    if (initial) Object.assign(previous, initial.metadata);
    if (previous.painFlag === undefined && previous.painAnswer) previous.painFlag = previous.painAnswer === 'Yes';
    if (previous.painFlag === undefined && typeof previous.pain === 'boolean') previous.painFlag = previous.pain;
    return { ...previous, ...defaults };
  });
  useEffect(() => {
    const incoming = saved ? { ...saved } : known?.metadata || {};
    setValues(current => ({ ...incoming, ...Object.fromEntries(Object.entries(current).filter(([,value])=>value!==undefined)) }));
  }, [saved?.updatedAt, known?.updatedAt]);
  async function applyHealth(imported: Record<string, string>) {
    try {
      const draft = await readDraft<Record<string,any>>(storageKey) || {};
      const next = { ...values, ...draft, ...imported };
      await writeDraft(storageKey,next);
      setValues(next); setVersion(value => value + 1);
      return true;
    } catch { toast.push('Could not update the readiness draft. Enter the readings manually.', 'err'); return false; }
  }
  async function importGoogleFit() {
    const result = await api<{ dailyMetrics?: Record<string, { sleepHours?: number; steps?: number; hrCount?: number; hrSum?: number }> }>('/api/google-fit/sync?preview=true', { method: 'POST', body: '{}' });
    const metrics = result.dailyMetrics?.[date] || {};
    const imported = {
      sleepHours: metrics.sleepHours ? String(Math.round(metrics.sleepHours * 10) / 10) : '',
      restingHeartRate: metrics.hrCount ? String(Math.round((metrics.hrSum || 0) / metrics.hrCount)) : '',
      steps: metrics.steps !== undefined ? String(Math.round(metrics.steps)) : '',
    };
    if (!Object.values(imported).some(Boolean)) throw new Error('No sleep, heart-rate, or step data was available from Google Fit for today.');
    return { values: imported, labels: [imported.sleepHours && 'sleep', imported.restingHeartRate && 'heart rate', imported.steps && 'steps'].filter(Boolean) as string[] };
  }
  async function save(input: Record<string, any>) {
    const normalized = normalizeReadiness({ ...input, date }, app.db!.readiness);
    if (!normalized.item) throw new Error(normalized.error || 'Complete your readiness answers.');
    const item = normalized.item;
    const metadata = { ...known?.metadata };
    delete metadata.readinessScore;
    for (const key of ['sleepHours','sleepQuality','soreness','energy','stress','motivation','mood','steps','painFlag','restingHeartRate','hydration','mealProtein','notes'] as const) metadata[key] = item[key];
    metadata.confirmed = true;
    // One record per local calendar day; this same offline/cloud entry feeds Train.
    await bio.save({ id: known?.id || `check-in-${date}`, type: 'checkIn', domain: 'Recover', name: 'Daily readiness check-in', timestamp: known?.timestamp || (date === today ? new Date().toISOString() : atTime(date, '12:00')), source: 'Health OS daily check-in', quality: 'manual', metadata });
    await onSaved?.();
    toast.push('Readiness saved on this device — sync pending. Your workout uses this check-in.', 'ok');
    close();
  }
  return <Modal open title={date === today ? 'Today’s readiness check-in' : `Readiness · ${date}`} onClose={close} className="flow-modal daily-readiness-modal">
    {legacyKey && <div className="health-card"><p>An older check-in draft exists on this device. Import it only if it belongs to you.</p><button className="btn btn-soft" onClick={()=>{try{const older=JSON.parse(localStorage.getItem(legacyKey)||'{}');void applyHealth(older).then(ok=>{if(ok){localStorage.removeItem(legacyKey);setLegacyKey('');}});}catch{toast.push('The older draft could not be read.','err');}}}>Import older draft into my account</button></div>}
    {date === today && <HealthReadings activeDate={date} onApply={applyHealth}/>}
    <ReadinessCards key={version} initial={values} draftKey={draftKey} onSave={save} reuseAnswers={preferences.adaptiveCheckin} onGoogleFitImport={date === today && app.settings?.hasGoogleFit ? importGoogleFit : undefined}/>
  </Modal>;
}

export function DailyReadinessGuidance({ ready }: { ready: Readiness }) {
  const advice = ready.assistant;
  if (!advice) return null;
  return <details className="daily-readiness-guidance"><summary>Training guidance</summary>
    <dl>{[['Why',advice.reason],['Intensity',advice.intensity],['Warm-up',advice.warmup],['Recovery',advice.recovery]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </details>;
}
