/** Platform-independent statistics. Missing dates are never filled with zero. */
export type DailyObservation = {date:string;value:number|null};
export type TrendState = 'increasing'|'decreasing'|'stable'|'unusually variable'|'insufficient data';
const average=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
export function dailyObservations(points:DailyObservation[]) {
  // A duplicate date is ambiguous: callers must select their authoritative source first.
  const grouped=new Map<string,number[]>();
  for(const point of points)if(validDate(point.date)&&point.value!==null&&Number.isFinite(point.value))grouped.set(point.date,[...(grouped.get(point.date)||[]),point.value]);
  return [...grouped].filter(([,values])=>values.length===1).map(([date,values])=>({date,value:values[0]})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function personalTrend(points:DailyObservation[],minimumChange=0) {
  const observations=dailyObservations(points);
  const ordered=[...points].filter(point=>validDate(point.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const windowDays=ordered.length?(Date.parse(ordered.at(-1)!.date)-Date.parse(ordered[0].date))/86400000+1:0;
  const firstHalf=Math.floor(windowDays/2);
  const boundary=ordered.length?new Date(Date.parse(ordered[0].date)+firstHalf*86400000).toISOString().slice(0,10):'';
  const before=observations.filter(point=>point.date<boundary),after=observations.filter(point=>point.date>=boundary);
  const result={samples:observations.length,from:ordered[0]?.date??null,to:ordered.at(-1)?.date??null,beforeCount:before.length,afterCount:after.length};
  if(before.length<5||after.length<5||before.length/Math.max(1,firstHalf)<.25||after.length/Math.max(1,windowDays-firstHalf)<.25)return {...result,state:'insufficient data' as TrendState,change:null,threshold:null};
  const first=average(before.map(point=>point.value)),last=average(after.map(point=>point.value)),change=last-first;
  const variance=(rows:typeof observations,center:number)=>rows.reduce((sum,row)=>sum+(row.value-center)**2,0)/(rows.length-1);
  const error=Math.sqrt(variance(before,first)/before.length+variance(after,last)/after.length);
  const threshold=Math.max(minimumChange,Math.abs(first)*.03,1.96*error);
  const center=average(observations.map(point=>point.value));
  const spread=Math.sqrt(variance(observations,center));
  const state:TrendState=Math.abs(change)>threshold?(change>0?'increasing':'decreasing'):spread>Math.max(minimumChange,Math.abs(center)*.3)?'unusually variable':'stable';
  return {...result,state,change,threshold};
}
export function baselineQuality(points:DailyObservation[],from:string,to:string,minimumChange=0) {
  if(!validDate(from)||!validDate(to)||from>to)throw new RangeError('Baseline requires a valid, ordered calendar window.');
  const observations=dailyObservations(points).filter(point=>point.date>=from&&point.date<=to),values=observations.map(point=>point.value);
  const samples=values.length,days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  const enough=samples>=14&&samples/Math.max(1,days)>=.5;
  const sorted=[...values].sort((a,b)=>a-b),quantile=(fraction:number)=>{const position=(sorted.length-1)*fraction,low=Math.floor(position);return sorted[low]+(sorted[Math.ceil(position)]-sorted[low])*(position-low);};
  return {from,to,samples,coverage:samples/days,missingness:1-samples/days,confidence:enough?(samples>=28&&samples/days>=.8?'high':'medium'):'low',state:enough?'available':'building',range:enough?{low:quantile(.1),high:quantile(.9)}:null,trend:personalTrend([{date:from,value:null},...points.filter(point=>point.date>=from&&point.date<=to),{date:to,value:null}],minimumChange)};
}

/** Today's observation is never included in its own reference window. */
export function baselineComparison(points:DailyObservation[],date:string,minimumChange=0) {
  if(!validDate(date))throw new RangeError('Comparison requires a valid calendar date.');
  const day=(offset:number)=>new Date(Date.parse(date)+offset*86400000).toISOString().slice(0,10);
  const quality=baselineQuality(points,day(-28),day(-1),minimumChange);
  const current=dailyObservations(points).find(point=>point.date===date)?.value??null;
  const reference=dailyObservations(points).filter(point=>point.date>=quality.from&&point.date<=quality.to);
  const center=quality.range?average(reference.map(point=>point.value)):null;
  return {...quality,current,average:center,deviation:current!==null&&center!==null?current-center:null,
    position:current===null?'missing':!quality.range?'building':current<quality.range.low-minimumChange?'below':current>quality.range.high+minimumChange?'above':'within'};
}

/** Rankings are planning guidance, never diagnoses or automatic writes. */
export function todayPriority(input:{activeWorkout?:string;plannedWorkout?:string;medicationReminder?:string;readiness:number|null;readinessCategory:string;confidence:string}) {
  if(input.activeWorkout)return {title:input.activeWorkout,description:'Pick up where you left off. Your session is saved.',action:'Resume workout',destination:'Tracker' as const,status:'In progress',kind:'train'};
  if(input.medicationReminder)return {title:'Review your saved reminder',description:input.medicationReminder+' · Follow your prescribed schedule. Confirm only what you actually took; a reminder does not establish a missed dose.',action:'Review schedule',destination:'Timeline' as const,status:'Scheduled reminder',kind:'health'};
  if(input.readiness===null)return {title:'Start with you',description:'A quick check-in helps put today’s training and recovery in context.',action:'Check in',destination:'checkIn' as const,status:'Check-in needed',kind:'checkIn'};
  if(['Recovery','Reduced','Take it easy'].includes(input.readinessCategory))return {title:'Make room to recover',description:'Your recorded signals suggest a lighter day. Review your recovery guidance.',action:'View recovery',destination:'Recover' as const,status:input.readinessCategory,kind:'recover'};
  if(input.plannedWorkout)return {title:input.plannedWorkout,description:'Your plan for today. Find your rhythm, one set at a time.',action:'View workout',destination:'Dashboard' as const,status:input.confidence==='Low'?'Limited signals':input.readinessCategory,kind:'train'};
  return {title:'Move at your pace',description:'Explore your training plan or make time for a little recovery.',action:'Explore training',destination:'Dashboard' as const,status:'Your day',kind:'train'};
}
