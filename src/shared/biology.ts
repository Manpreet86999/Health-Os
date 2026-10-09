import { z } from 'zod';
import { checkInReadiness, readinessBand } from './readiness.js';

export const BIO_DOMAINS = ['Today', 'Train', 'Eat', 'Recover', 'Health', 'Body', 'Care', 'Insights'] as const;
export type BioDomain = typeof BIO_DOMAINS[number];
export const BIO_KINDS = ['meal', 'food', 'recipe', 'water', 'nutritionTarget', 'sleep', 'checkIn', 'vital', 'symptom', 'illness', 'supplement', 'medication', 'dose', 'habit', 'habitDone', 'experiment', 'researchConsent', 'sourcePriority', 'nudgePreference', 'recoveryNote', 'mealPlan', 'goal', 'goalCheckIn', 'automation', 'automationEvent', 'sleepPreference', 'nutritionDay', 'journal', 'environment', 'bodyMeasurement', 'routine'] as const;
export type BioKind = typeof BIO_KINDS[number];
export const bioSchema = z.object({
  id: z.string().min(1).max(150), userId: z.string().min(1).max(150), domain: z.enum(BIO_DOMAINS), type: z.enum(BIO_KINDS),
  timestamp: z.string().datetime({ offset: true }), endTime: z.string().datetime({ offset: true }).optional(),
  name: z.string().min(1).max(250), value: z.number().finite().optional(), unit: z.string().max(40).default(''),
  source: z.string().min(1).max(200), sourceId: z.string().max(200).optional(), deviceId: z.string().max(200),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  quality: z.enum(['measured', 'manual', 'estimated', 'imported']), syncState: z.enum(['pending', 'saved']),
  revision: z.number().int().positive(), deletedAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null()])).default({}),
}).superRefine((r, ctx) => {
  if(['symptom','recoveryNote'].includes(r.type)&&r.metadata.severity!==undefined&&(typeof r.metadata.severity!=='number'||r.metadata.severity<0||r.metadata.severity>10))ctx.addIssue({code:'custom',message:'Symptom severity must be between 0 and 10'});
  if(r.type==='symptom'&&r.metadata.snomedCode&&(!/^\d{6,18}$/.test(String(r.metadata.snomedCode))))ctx.addIssue({code:'custom',message:'A SNOMED code must be 6–18 digits; leave it blank if unknown'});
  if(['symptom','illness','medication','supplement','experiment'].includes(r.type))for(const key of ['start','end','onset'])if(r.metadata[key]){const value=String(r.metadata[key]);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)ctx.addIssue({code:'custom',message:`${key} must be a real YYYY-MM-DD date`});}
  if(r.type==='experiment')for(const key of ['baselineDays','days'])if(r.metadata[key]!==undefined&&(!Number.isInteger(r.metadata[key])||Number(r.metadata[key])<1||Number(r.metadata[key])>365))ctx.addIssue({code:'custom',message:`${key} must be a whole number from 1 to 365`});
  if (r.endTime && Date.parse(r.endTime) < Date.parse(r.timestamp)) ctx.addIssue({ code: 'custom', message: 'End time must follow start time' });
  const bounds: Partial<Record<BioKind, [number, number]>> = { water: [1, 20000], sleep: [0, 24] };
  const bound = bounds[r.type];
  const normalized=r.type==='water'?waterMillilitres(r):r.type==='sleep'?sleepDurationHours(r):r.value??null;
  if (bound && (normalized === null || normalized < bound[0] || normalized > bound[1])) ctx.addIssue({ code: 'custom', message: `${r.type} value must be between ${bound[0]} and ${bound[1]} in ${r.type==='water'?'mL':'hours'} using a supported unit` });
  for (const key of ['calories', 'protein', 'carbs', 'fat', 'fibre', 'sodium','saturatedFat','sugars','iron','calcium','potassium','magnesium','zinc','folate','vitaminB12','vitaminC','vitaminD']) {
    if (r.metadata[key] !== undefined && (typeof r.metadata[key] !== 'number' || Number(r.metadata[key]) < 0)) ctx.addIssue({ code: 'custom', message: `${key} must be a nonnegative number` });
  }
  for (const key of ['energy','soreness','stress','motivation','quality']) if (r.metadata[key] !== undefined && (typeof r.metadata[key] !== 'number' || Number(r.metadata[key]) < (['soreness','stress'].includes(key)?0:1) || Number(r.metadata[key]) > 10)) ctx.addIssue({code:'custom',message:`${key} must be between 1 and 10`});
  if (['goal','goalCheckIn'].includes(r.type) && (r.metadata.target !== undefined && (typeof r.metadata.target !== 'number' || Number(r.metadata.target) <= 0))) ctx.addIssue({code:'custom',message:'Goal target must be positive'});
  if (r.type === 'sleep' && ['deep','rem','light','awake'].reduce((sum,k)=>sum+(typeof r.metadata[k]==='number'?Number(r.metadata[k]):0),0) > (sleepDurationHours(r) || 0) + .05) ctx.addIssue({code:'custom',message:'Sleep stages cannot exceed session duration'});
});
export type BioRecord = z.infer<typeof bioSchema>;
export const dateOf = (stamp: string) => { const d = new Date(stamp); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const live = (records: BioRecord[]) => records.filter(r => !r.deletedAt);
export const mean = (numbers: number[]) => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
export const num = (r: BioRecord, key: string) => typeof r.metadata[key] === 'number' ? Number(r.metadata[key]) : null;
/** Canonical capture units used by every platform and derived view. */
export function waterMillilitres(record:{value?:number;unit:string}):number|null {
  if(record.value===undefined||!Number.isFinite(record.value))return null;
  const factor:Record<string,number>={'':1,ml:1,l:1000,oz:29.5735};
  const multiplier=factor[record.unit.trim().toLowerCase()];
  return multiplier===undefined?null:record.value*multiplier;
}
export function sleepDurationHours(record:{value?:number;unit:string}):number|null {
  if(record.value===undefined||!Number.isFinite(record.value))return null;
  const factor:Record<string,number>={'':1,h:1,hour:1,hours:1,min:1/60,minute:1/60,minutes:1/60,s:1/3600,seconds:1/3600};
  const multiplier=factor[record.unit.trim().toLowerCase()];
  return multiplier===undefined?null:record.value*multiplier;
}
export function nutrition(records: BioRecord[], date: string) {
  const meals = live(records).filter(r => r.type === 'meal' && dateOf(r.timestamp) === date);
  return Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'fibre'].map(k => [k, meals.reduce((sum, r) => sum + (num(r, k) || 0), 0)])) as Record<'calories' | 'protein' | 'carbs' | 'fat' | 'fibre', number>;
}
/** Select one source per metric/day. Never sum overlapping devices. */
export function preferredVitals(records: BioRecord[], metric: string) {
  const readings:BioRecord[]=[],corrected=new Set<string>();
  let priority:BioRecord|undefined;
  for(const record of records){
    if(record.deletedAt)continue;
    if(record.type==='sourcePriority'&&record.name===metric&&(!priority||record.updatedAt.localeCompare(priority.updatedAt)>0))priority=record;
    if(record.type==='vital'&&record.metadata.metric===metric){readings.push(record);if(record.metadata.correctionOf)corrected.add(String(record.metadata.correctionOf));}
  }
  const order = String(priority?.metadata.sources || '').split(',').map(s => s.trim());
  const ranks=new Map<string,number>();order.forEach((source,index)=>{if(!ranks.has(source))ranks.set(source,index);});
  const grouped = new Map<string, BioRecord>();
  // Keep one winner per day instead of repeatedly copying and sorting every sample.
  for (const r of readings) {
    if(corrected.has(r.id)||r.value===undefined)continue;
    const day=dateOf(r.timestamp),current=grouped.get(day);
    const rank=ranks.get(r.source)??1000,currentRank=current?(ranks.get(current.source)??1000):Infinity;
    if(!current||rank<currentRank||rank===currentRank&&r.timestamp.localeCompare(current.timestamp)>0)grouped.set(day,r);
  }
  return [...grouped.values()].sort((a,b) => a.timestamp.localeCompare(b.timestamp));
}
export function baseline(records: BioRecord[], metric: string, date: string, preferred=preferredVitals(records,metric)) {
  const end=Date.parse(`${date}T12:00:00`);
  const points = preferred.filter(r => dateOf(r.timestamp) < date && end - Date.parse(r.timestamp) < 29 * 86400000);
  const values = points.map(r => r.value!); const average = mean(values);
  const sd = average === null ? null : Math.sqrt(values.reduce((s,v) => s + (v-average)**2, 0)/values.length);
  const current = preferred.find(r => dateOf(r.timestamp) === date);
  return { metric, samples: values.length, average, sd, current, deviation: current && average ? (current.value! - average)/average*100 : null,
    anomalous: Boolean(current && values.length >= 14 && sd && Math.abs(current.value! - average!) > sd * 2) };
}
export function readiness(records: BioRecord[], date: string, snapshot?:{entries:BioRecord[];vitals:Map<string,BioRecord[]>}) {
  const entries = (snapshot?snapshot.entries.slice():live(records).filter(r => dateOf(r.timestamp) === date)).sort((a,b) => b.timestamp.localeCompare(a.timestamp));
  const full = entries.filter(r => r.type === 'checkIn' && checkInReadiness(r)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const check = full || entries.find(r => r.type === 'checkIn');
  const saved = full ? checkInReadiness(full) : undefined;
  const sleep = entries.find(r => r.type === 'sleep');
  const contributors: { label: string; score: number; detail: string; ids: string[] }[] = [];
  const add = (label: string, score: number, detail: string, ids: string[]) => contributors.push({ label, score: Math.max(0, Math.min(100, score)), detail, ids });
  if (saved) add('Sleep', saved.sleepHours / 8 * 100, `${saved.sleepHours.toFixed(1)} hours from your daily check-in`, [full!.id]);
  else if (sleep && sleepDurationHours(sleep)!==null) { const hours=sleepDurationHours(sleep)!; add('Sleep', hours / 8 * 100, `${hours.toFixed(1)} hours; 8-hour planning reference`, [sleep.id]); }
  if (check) {
    for (const [key, label, inverse] of [['energy','Energy',false],['soreness','Soreness',true],['stress','Stress',true]] as const) {
      const value = num(check, key); if (value !== null) add(label, (inverse ? 11-value : value)*10, `${value}/10 self-report`, [check.id]);
    }
  }
  if (saved) {
    for (const [key,label] of [['sleepQuality','Sleep quality'],['motivation','Motivation'],['mood','Mood']] as const) add(label, saved[key] * 10, `${saved[key]}/10 self-report`, [full!.id]);
    add('Movement', saved.steps / 8000 * 100, `${saved.steps} steps; optional daily movement context`, [full!.id]);
    add('Pain', saved.painFlag ? 0 : 100, saved.painFlag ? 'Pain flagged; training load guidance is reduced' : 'No pain flagged', [full!.id]);
  }
  for (const metric of ['HRV','Resting HR']) {
    const b = baseline(records, metric, date, snapshot?.vitals.get(metric));
    if (b.current && b.samples >= 7 && b.deviation !== null) add(metric, 75 + (metric === 'HRV' ? b.deviation : -b.deviation), `${b.current.value} ${b.current.unit}; ${b.deviation.toFixed(1)}% vs ${b.samples}-day baseline`, [b.current.id]);
  }
  if (saved && Number(saved.restingHeartRate) > 0 && !contributors.some(c => c.label === 'Resting HR')) add('Resting HR', 75, `${saved.restingHeartRate} bpm from your daily check-in; context only, not scored`, [full!.id]);
  const legacyScore = full?.id.startsWith('legacy-check-') && full.source === 'Existing Health OS' && typeof full.metadata.readinessScore === 'number' ? full.metadata.readinessScore : undefined;
  const score = saved ? legacyScore ?? saved.score : mean(contributors.map(c => c.score));
  return { score: score === null ? null : Math.round(score), contributors,
    category: score === null ? 'No data' : saved ? readinessBand(score).label : score >= 75 ? 'Ready' : score >= 50 ? 'Steady' : 'Take it easy',
    confidence: contributors.length >= 5 ? 'Moderate' : contributors.length ? 'Low' : 'Unavailable',
    missing: ['Sleep','Energy','Soreness','Stress','HRV','Resting HR'].filter(k => !contributors.some(c => c.label === k)) };
}
export function correlation(pairs: { date: string; x: number; y: number }[]) {
  if (pairs.length < 7) return { samples: pairs.length, r: null, confidence: 'Insufficient data', pairs };
  const x = mean(pairs.map(p => p.x))!, y = mean(pairs.map(p => p.y))!;
  const numerator = pairs.reduce((s,p) => s+(p.x-x)*(p.y-y),0);
  const denominator = Math.sqrt(pairs.reduce((s,p) => s+(p.x-x)**2,0)*pairs.reduce((s,p) => s+(p.y-y)**2,0));
  return { samples: pairs.length, r: denominator ? numerator/denominator : null, confidence: pairs.length >= 30 ? 'Moderate' : 'Low', pairs };
}
export function adaptiveTdee(records: BioRecord[], weights: { date: string; weight: number }[]) {
  const sorted = [...weights].filter(w => w.weight > 0).sort((a,b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) return { value: null, days: 0, weighIns: sorted.length, completeDays: 0, confidence: 'Insufficient data' };
  const first = sorted.slice(0,7), last = sorted.slice(-7);
  const start = first[0].date, end = last.at(-1)!.date;
  const days = (Date.parse(end)-Date.parse(start))/86400000;
  const targets = live(records).filter(r => r.type === 'nutritionTarget').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const completeDates = new Set(live(records).filter(r => (r.type === 'meal' && r.metadata.completeDay === true) || (r.type === 'nutritionDay' && r.metadata.complete === true)).map(r => dateOf(r.timestamp)));
  const valid = [...completeDates].filter(d => d >= start && d <= end);
  const intake = mean(valid.map(d => nutrition(records, d).calories));
  // Trend midpoints prevent treating endpoint noise as tissue change. Rough energy-balance estimate.
  const span = (mean(last.map(w => Date.parse(w.date)))! - mean(first.map(w => Date.parse(w.date)))!)/86400000;
  const value = days >= 21 && valid.length >= days*.8 && span > 0 && intake !== null
    ? Math.round(intake - (mean(last.map(w => w.weight))! - mean(first.map(w => w.weight))!) * 7700 / span) : null;
  return { value: value && value > 500 && value < 7000 ? value : null, days, weighIns: sorted.length, completeDays: valid.length, confidence: value ? 'Low — rough energy-balance estimate' : 'Insufficient complete days', target: targets[0] };
}
export function experimentResult(experiment: BioRecord, records: BioRecord[], asOf=dateOf(new Date().toISOString())) {
  const start = String(experiment.metadata.start || dateOf(experiment.timestamp));
  const bounded=(value:unknown,fallback:number)=>Math.max(1,Math.min(365,Math.floor(Number(value)||fallback)));
  const baselineDays = bounded(experiment.metadata.baselineDays,14), interventionDays = bounded(experiment.metadata.days,21);
  const metric = String(experiment.metadata.metric || 'Sleep');
  const observed=live(records).filter(r=>r.userId===experiment.userId&&r.quality!=='estimated'&&(r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true)&&dateOf(r.timestamp)<=asOf);
  // Never compare unlike units or label an unconverted reading with a canonical unit.
  const units:Record<string,{unit:string;factors:Record<string,number>}>={
    Weight:{unit:'kg',factors:{kg:1,kgs:1,kilogram:1,kilograms:1,lb:1/2.2046226218,lbs:1/2.2046226218}},
    HRV:{unit:'ms',factors:{ms:1,millisecond:1,milliseconds:1,s:1000,seconds:1000}},
    'Resting HR':{unit:'bpm',factors:{bpm:1,'beats/min':1}},
    Steps:{unit:'steps',factors:{steps:1,step:1,count:1}},
  };
  const definition=units[metric];
  const candidates = metric === 'Sleep' ? observed.filter(r => r.type === 'sleep' && !r.metadata.nap && sleepDurationHours(r)!==null).map(r=>({...r,value:sleepDurationHours(r)!})) : preferredVitals(observed, metric);
  const outcomeUnit=metric==='Sleep'?'h':definition?.unit||candidates.at(-1)?.unit||'';
  const points=candidates.flatMap(r=>{
    if(metric==='Sleep')return [r];
    const factor=definition?definition.factors[r.unit.trim().toLowerCase()]:r.unit===outcomeUnit?1:undefined;
    return factor===undefined||r.value===undefined?[]:[{...r,value:r.value*factor}];
  });
  const daily = new Map<string, number>();
  for (const r of [...points].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.updatedAt.localeCompare(b.updatedAt)||a.id.localeCompare(b.id))) if(Number.isFinite(r.value))daily.set(dateOf(r.timestamp),r.value!);
  const before: number[] = [], during: number[] = [];
  for (const [date, value] of daily) { const day = (Date.parse(date)-Date.parse(start))/86400000; if (day >= -baselineDays && day < 0) before.push(value); if (day >= 0 && day < interventionDays) during.push(value); }
  const b = mean(before), d = mean(during);
  const elapsedDays=Math.max(0,Math.min(interventionDays,Math.floor((Date.parse(asOf)-Date.parse(start))/86400000)+1));
  const adherenceMetric=String(experiment.metadata.adherenceMetric||''),target=Number(experiment.metadata.target);
  const intervention=observed.filter(r=>dateOf(r.timestamp)>=start&&(Date.parse(dateOf(r.timestamp))-Date.parse(start))/86400000<interventionDays);
  const totals=new Map<string,number>();
  for(const r of intervention){const value=adherenceMetric==='Water'&&r.type==='water'?waterMillilitres(r):adherenceMetric==='Protein'&&r.type==='meal'?num(r,'protein'):null;if(value!==null)totals.set(dateOf(r.timestamp),(totals.get(dateOf(r.timestamp))||0)+value);}
  const metDays=[...totals.values()].filter(value=>value>=target).length;
  return { before: b, during: d, difference: b !== null && d !== null ? d-b : null, baselineSamples: before.length, interventionSamples: during.length, confidence: before.length >= 7 && during.length >= 7 ? 'Low — observational' : 'Insufficient data',start,baselineDays,interventionDays,elapsedDays,metric,unit:outcomeUnit,excludedUnitSamples:candidates.length-points.length,adherence:target>0&&['Water','Protein'].includes(adherenceMetric)?{metric:adherenceMetric,target,unit:adherenceMetric==='Water'?'mL':'g',observedDays:totals.size,metDays,elapsedDays,percent:elapsedDays?metDays/elapsedDays*100:null}:null };
}
