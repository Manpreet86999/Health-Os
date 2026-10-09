import type { AppDb } from './types.js';
import { dateOf, live, type BioRecord } from './biology.js';
import { checkInReadiness } from './readiness.js';
export function legacyBiology(db: AppDb): BioRecord[] {
  const base = (id: string, date: string): Pick<BioRecord,'id'|'userId'|'timestamp'|'source'|'createdAt'|'updatedAt'|'deviceId'|'quality'|'syncState'|'revision'|'unit'> => {
    const timestamp = new Date(`${date || '2000-01-01'}T12:00:00`).toISOString();
    return {id:`legacy-${id}`,userId:'local-user',timestamp,source:'Existing Health OS',createdAt:timestamp,updatedAt:timestamp,deviceId:'web-local',quality:'manual',syncState:'saved',revision:1,unit:''};
  };
  const result: BioRecord[] = [];
  for (const r of db.readiness) {
    result.push({...base(`check-${r.id}`,r.date),createdAt:r.createdAt||base('',r.date).createdAt,updatedAt:r.updatedAt||base('',r.date).updatedAt,domain:'Recover',type:'checkIn',name:'Readiness check-in',metadata:{sleepHours:r.sleepHours,sleepQuality:r.sleepQuality,energy:r.energy,soreness:r.soreness,stress:r.stress,motivation:r.motivation,mood:r.mood,steps:r.steps,painFlag:r.painFlag,restingHeartRate:r.restingHeartRate,notes:r.notes,readinessScore:r.score}});
    if (Number(r.sleepHours)>0) result.push({...base(`sleep-${r.id}`,r.date),domain:'Recover',type:'sleep',name:'Self-reported sleep',value:Number(r.sleepHours),unit:'hours',metadata:{}});
  }
  for (const r of db.healthReadings || []) {
    const metric = ({HeartRateVariability:'HRV',RestingHeartRate:'Resting HR',Steps:'Steps',ActiveCalories:'Active Calories',Weight:'Weight'} as Record<string,string>)[r.kind];
    if (metric) result.push({...base(`health-${r.id}`,r.date),timestamp:r.startTime,source:r.source,sourceId:r.sourceRecordId,quality:'imported',domain:'Health',type:'vital',name:metric,value:r.value,unit:r.unit,metadata:{metric}});
  }
  for (const r of db.measurements) if (Number(r.weight)>0) result.push({...base(`weight-${r.id}`,r.date),domain:'Body',type:'vital',name:'Weight',value:Number(r.weight),unit:db.profile.units,metadata:{metric:'Weight'}});
  return result;
}

/** Prefer the shared full check-in; keep partial historical records in storage. */
export function effectiveBiology(db: AppDb, records: BioRecord[]): BioRecord[] {
  const dailyReadiness=new Map<string,AppDb['readiness'][number]>();
  for(const item of db.readiness)if(!dailyReadiness.has(item.date))dailyReadiness.set(item.date,item);
  const active = live(records).filter(record => {
    if (record.type !== 'checkIn') return true;
    const saved = dailyReadiness.get(dateOf(record.timestamp));
    return !saved || Boolean(checkInReadiness(record)) && (!saved.updatedAt || record.updatedAt >= saved.updatedAt);
  });
  const identity=(record:BioRecord)=>JSON.stringify([record.type,dateOf(record.timestamp),record.type==='vital'?typeof record.metadata.metric:'',record.type==='vital'?record.metadata.metric:'']);
  const observed=new Set(active.map(identity));
  const legacy = legacyBiology(db).filter(record => !observed.has(identity(record)));
  return [...legacy, ...active];
}
