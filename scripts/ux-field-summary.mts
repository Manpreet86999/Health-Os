import fs from 'node:fs';
// Read explicit local exports only. Never retain source filenames, page addresses,
// identifiers, or extra fields in the resulting aggregate.
const files=process.argv.slice(2);
if(!files.length)throw new Error('Provide local Health OS UX diagnostic JSON exports. No field results are prefilled.');
type Sample={lcpMs:number|null;inpMs:number|null;cls:number|null;viewportWidth:number};
const samples:Sample[]=files.map(file=>{
  const input=JSON.parse(fs.readFileSync(file,'utf8'));
  if(input.version!==2||!input.sample)throw new Error('Expected a version 2 diagnostic export containing a sample.');
  const value=input.sample;
  for(const metric of ['lcpMs','inpMs','cls'])if(value[metric]!==null&&(!Number.isFinite(value[metric])||value[metric]<0))throw new Error('Invalid numeric measurement.');
  if(!Number.isFinite(value.viewportWidth)||value.viewportWidth<=0)throw new Error('Invalid viewport width.');
  return {lcpMs:value.lcpMs,inpMs:value.inpMs,cls:value.cls,viewportWidth:value.viewportWidth};
});
const percentile=(values:number[])=>values.length?values.sort((a,b)=>a-b)[Math.ceil(values.length*.75)-1]:null;
function summarize(group:Sample[]){return Object.fromEntries((['lcpMs','inpMs','cls'] as const).map(metric=>{const values=group.map(s=>s[metric]).filter((n):n is number=>n!==null);return [metric,{sampleCount:values.length,p75:percentile(values)}];}));}
console.log(JSON.stringify({version:1,exportCount:samples.length,all:summarize(samples),mobile:summarize(samples.filter(s=>s.viewportWidth<1024)),desktop:summarize(samples.filter(s=>s.viewportWidth>=1024)),targets:{lcpMs:2500,inpMs:200,cls:.1},notes:['Nearest-rank sample percentiles; null measurements are excluded separately for each metric.','Export provenance, sampling bias, repeat visits and population representativeness require review. Small or convenience samples do not validate production population targets.','Only aggregate measurements and counts are included.']},null,2));
