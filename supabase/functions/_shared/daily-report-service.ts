import {dailyReportTemplate,type DailyReportData} from '../../../src/shared/daily-report.ts';
import {canSendDailyReport,istDate,validReportDate} from '../../../src/shared/daily-report-policy.ts';
import {dailyNutrition,preferredVitals,type BioRecord} from '../../../src/shared/biology.ts';
import {EmailError} from '../../../src/shared/email-contract.ts';
import {analyzeDailyReport} from './workout-analysis.ts';
import {mergeDailyReadiness} from '../../../src/shared/readiness.ts';
type Row=Record<string,any>;
type Db=(path:string,init?:RequestInit)=>Promise<any>;
export function dailyReports(db:Db,records:(owner:string,type:string,filter?:string)=>Promise<Row[]>,provider:(owner:string)=>Promise<any>,analyze=analyzeDailyReport){
  const path=(owner:string,date:string)=>`body_os_daily_reports?user_id=eq.${encodeURIComponent(owner)}&report_date=eq.${date}`;
  async function generate(owner:string,date:string){
    if(!canSendDailyReport(date))throw new EmailError('REPORT_TOO_EARLY');
    const cached=(await db(path(owner,date)+'&select=html,text,payload&limit=1'))[0];
    if(cached?.html)return cached;
    const cutoff=`${date}T23:00:00+05:30`,cutoffMs=Date.parse(cutoff);
    const types=['session','readiness','measurement','cardio','week','profile','workspaceState'];
    const loaded=await Promise.all(types.map(type=>records(owner,type)));
    const byType=Object.fromEntries(types.map((type,index)=>[type,loaded[index].map(row=>row.payload)]));
    const bio:BioRecord[]=[];
    // Filter in Postgres: an owner may have years of per-minute device samples.
    // A broad calendar window covers every timestamp offset; exact IST cutoff stays below.
    const from=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const until=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    const relevant=`or=(payload->>type.in.(nutritionTarget,sourcePriority),and(payload->>timestamp.gte.${from},payload->>timestamp.lt.${until},or(payload->>type.in.(meal,water,nutritionDay,checkIn,dose),and(payload->>type.eq.vital,payload->metadata->>metric.eq.Steps))))`;
    for(let offset=0;;offset+=500){
      const rows=await db(`health_os_biological_records?user_id=eq.${encodeURIComponent(owner)}&${relevant}&select=payload&order=record_id&limit=500&offset=${offset}`);
      bio.push(...rows.map((r:Row)=>r.payload));if(rows.length<500)break;
    }
    const visible=bio.filter(r=>!r.deletedAt&&(r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true)&&Date.parse(r.timestamp)<=cutoffMs&&Date.parse(r.updatedAt)<=cutoffMs);
    const dayBio=visible.filter(r=>istDate(new Date(r.timestamp))===date);
    // Canonical helpers use IST themselves; retain sample times for source selection.
    const nutrition:Row=dailyNutrition(dayBio,date);
    const workouts=byType.session.filter((r:Row)=>r.date===date&&['finished','completed'].includes(r.status)&&Date.parse(r.endedAt||r.createdAt||cutoff)<=cutoffMs);
    const readiness=mergeDailyReadiness(byType.readiness.filter((r:Row)=>Date.parse(r.updatedAt||r.createdAt||cutoff)<=cutoffMs),dayBio.filter(r=>r.type==='checkIn')).find(r=>r.date===date)||workouts.at(-1)?.readiness||null;
    const merged=readiness?{...readiness}:null;
    const steps=preferredVitals(visible,'Steps').find(r=>istDate(new Date(r.timestamp))===date);
    if(steps&&merged)merged.steps=steps.value;
    const week=byType.week.find((w:Row)=>w.id===workouts.at(-1)?.weekId)||byType.week.filter((w:Row)=>validReportDate(w.startDate)&&w.startDate<=date&&date<=String(w.flexibleEndDate||new Date(Date.parse(w.startDate+'T00:00:00Z')+6*86400000).toISOString().slice(0,10))).sort((a:Row,b:Row)=>b.startDate.localeCompare(a.startDate))[0];
    const target=visible.filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    const goals=week?.nutritionGoals||target?.metadata||{};
    const measurements=byType.measurement.filter((r:Row)=>r.date<=date&&Date.parse(r.updatedAt||r.createdAt||cutoff)<=cutoffMs).sort((a:Row,b:Row)=>b.date.localeCompare(a.date));
    const cardio=byType.cardio.filter((r:Row)=>r.date===date&&Date.parse(r.createdAt||cutoff)<=cutoffMs);
    const meals=dayBio.filter(r=>r.type==='meal');
    nutrition.sugars=meals.length&&meals.every(r=>typeof r.metadata.sugars==='number')?meals.reduce((s,r)=>s+Number(r.metadata.sugars),0):null;
    nutrition.supplements=dayBio.filter(r=>r.type==='dose'&&r.metadata.kind==='supplement'&&(r.metadata.status==='taken'||r.metadata.taken===true)).map(r=>r.name).join(', ')||null;
    const data:DailyReportData={date,cutoff:'23:00',weekName:week?.name||workouts[0]?.weekName||'',dayName:new Intl.DateTimeFormat('en',{weekday:'long',timeZone:'Asia/Kolkata'}).format(new Date(date+'T12:00:00+05:30')),units:byType.profile[0]?.units||'kg',height:byType.profile[0]?.height,readiness:steps?{...(merged||{}),steps:steps.value}:merged,nutrition,goals,movement:{cardioMinutes:cardio.length?cardio.reduce((s:number,r:Row)=>s+Number(r.durationMinutes||r.duration||0),0):null,mobilityMinutes:null,activeMinutes:null},workouts,measurement:measurements[0]||null,previousMeasurement:measurements[1]||null,analysis:'',recommendations:[]};
    const analyzed=await analyze(data,await provider(owner));
    const rendered=dailyReportTemplate(analyzed);
    // First successful generation wins. Retries send the same persisted snapshot.
    await db('body_os_daily_reports?on_conflict=user_id,report_date',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({user_id:owner,report_date:date,payload:analyzed,...rendered})});
    return (await db(path(owner,date)+'&select=html,text,payload&limit=1'))[0];
  }
  return {generate,async sent(owner:string,date:string){await db(path(owner,date)+'&sent_at=is.null',{method:'PATCH',body:JSON.stringify({sent_at:new Date().toISOString()})});}};
}
