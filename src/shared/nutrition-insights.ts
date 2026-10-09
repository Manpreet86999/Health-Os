import { correlation, mean } from './biology.js';

export type InsightPoint={date:string;value:number|null};
export function observedChange(points:InsightPoint[]) {
  const middle=Math.floor(points.length/2),before=points.slice(0,middle).filter((p):p is InsightPoint&{value:number}=>p.value!==null&&Number.isFinite(p.value)),after=points.slice(middle).filter((p):p is InsightPoint&{value:number}=>p.value!==null&&Number.isFinite(p.value));
  const first=mean(before.map(p=>p.value)),last=mean(after.map(p=>p.value));
  const enough=before.length>=5&&after.length>=5;
  return {before:first,after:last,beforeCount:before.length,afterCount:after.length,difference:enough&&first!==null&&last!==null?last-first:null};
}

// One prespecified nonmedical association. Do not search many pairs for a winning claim.
// Reuse the existing paired-day correlation calculation, with stricter presentation gates.
export function proteinEnergyInsight(series:{date:string;Protein:number|null;Energy:number|null}[]) {
  const pairs=series.filter(row=>row.Protein!==null&&row.Energy!==null&&Number.isFinite(row.Protein)&&Number.isFinite(row.Energy)).map(row=>({date:row.date,x:row.Protein!,y:row.Energy!})).sort((a,b)=>a.date.localeCompare(b.date));
  if(pairs.length<28||new Set(pairs.map(row=>row.date)).size!==pairs.length)return null;
  const windowDays=(Date.parse(pairs.at(-1)!.date)-Date.parse(pairs[0].date))/86400000+1;
  if(windowDays<28)return null;
  const result=correlation(pairs),half=Math.floor(pairs.length/2),first=correlation(pairs.slice(0,half)),last=correlation(pairs.slice(half));
  if(result.r===null||result.r<.6||(first.r??0)<.4||(last.r??0)<.4)return null;
  const ordered=pairs.map(row=>row.x).sort((a,b)=>a-b),median=(ordered[Math.floor((ordered.length-1)/2)]+ordered[Math.floor(ordered.length/2)])/2;
  const lower=pairs.filter(row=>row.x<median),higher=pairs.filter(row=>row.x>=median);
  if(lower.length<10||higher.length<10)return null;
  const average=(group:typeof pairs)=>mean(group.map(row=>row.y))!;
  const low=average(lower),high=average(higher),difference=high-low;
  const error=(group:typeof pairs,avg:number)=>Math.sqrt(group.reduce((sum,row)=>sum+(row.y-avg)**2,0)/(group.length-1)/group.length);
  if(difference<1||high-1.96*error(higher,high)<=low+1.96*error(lower,low))return null;
  return {from:pairs[0].date,to:pairs.at(-1)!.date,samples:pairs.length,lowerCount:lower.length,higherCount:higher.length,median,low,high,difference,r:result.r};
}
