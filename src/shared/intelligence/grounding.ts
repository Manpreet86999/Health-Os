import {z} from 'zod';
import type {AgentToolResult} from './agent-contracts.js';
import {canonicalFactUnit} from './fact-references.js';
export const groundedClaimSchema=z.object({id:z.string().min(1).max(100),class:z.enum(['record','calculated','knowledge','inference','recommendation','missing']),text:z.string().min(1).max(1200),sourceIds:z.array(z.string().min(1).max(200)).max(30),confidence:z.number().min(0).max(1),fact:z.object({tool:z.string().max(100),path:z.array(z.union([z.string().max(100),z.number().int().min(0).max(1000)])).max(20),value:z.union([z.string().max(500),z.number().finite(),z.boolean()]),unit:z.string().max(40).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),label:z.string().min(1).max(150)}).strict().optional()}).strict();
export type GroundedClaim=z.infer<typeof groundedClaimSchema>;
export interface GroundingResult {accepted:boolean;claims:GroundedClaim[];errors:string[];unsupportedCriticalFacts:number;}
const medicalAssertion=/\b(?:your|my|the)\s+(?:lab(?:oratory)?\s+(?:results?|values?)|HRV|medication\s+interaction)\s+(?:is|are|was|were|shows?|indicates?)\s+(?:normal|safe|negative|positive|diagnostic|compatible)/i;
const numericHealth=/\b(?:\d+(?:\.\d+)?)\s*(?:ms\b|bpm\b|kg\b|lb\b|cm\b|mmol\/L|mg(?:\/dL)?\b|g\/dL|mcg\b|µg\b|ng\/mL|mL\b|kcal\b|calories\b|grams?\b|g\b|hours?\b|h\b|%|sets?\b|RIR\b)/gi;
const personalUnitlessMeasurement=/\b(?:your|my|recorded|measured)\s+(?:average\s+)?(HRV|heart rate|resting heart rate|blood pressure|weight|sleep(?: duration)?|glucose|cholesterol|calorie intake|protein intake)\s+(?:is|was|were|averaged|equals?|of|:)\s*(\d+(?:\.\d+)?)/i;
const prohibited=/\b(?:stop taking|increase your dose|decrease your dose|double your dose|you have been diagnosed|you definitely have)\b/i;
export function hasProhibitedMedicalAssertion(text:string):boolean {
 // Only a direct, local negation can turn a treatment instruction into a safe refusal.
 for(const match of text.matchAll(new RegExp(prohibited.source,'gi'))){
  const prefix=text.slice(0,match.index);
  if(!/^(?:stop taking|increase your dose|decrease your dose|double your dose)$/i.test(match[0])||!/(?:\bdo not|\bdon['’]t|\bnever)\s+$/i.test(prefix))return true;
 }
 return false;
}
function pathMatchesRecord(result:AgentToolResult,path:(string|number)[],sourceIds:string[]):boolean{
 const authorized=new Set([...result.sourceIds,...(result.provenance||[]).map(p=>p.sourceId)]);
 let value:any=result.data,nearest:string[]=[];
 for(const part of path){
  if(!value||typeof value!=='object'||['__proto__','prototype','constructor'].includes(String(part))||!Object.hasOwn(value,part))return false;
  if(typeof value.id==='string'&&authorized.has(value.id))nearest=[value.id];
  else if(Array.isArray(value.sourceIds)){const own=value.sourceIds.filter((id:unknown)=>typeof id==='string'&&authorized.has(id));if(own.length)nearest=own;}
  value=value[part];
 }
 return !nearest.length||nearest.some(id=>sourceIds.includes(id));
}
/** Resolve facts only inside authorized tool outputs. Render their values deterministically. */
export function verifyGroundedResponse(summary:string,claims:GroundedClaim[]|undefined,results:AgentToolResult[]):GroundingResult {
 const errors:string[]=[],verified:GroundedClaim[]=[],verifiedMetrics=new Map<GroundedClaim,string[]>();
 for(const raw of claims||[]){const claim=groundedClaimSchema.parse(raw);
  if(hasProhibitedMedicalAssertion(claim.text)||medicalAssertion.test(claim.text)){errors.push(`Claim ${claim.id}: unsafe medical assertion.`);continue;}
  if(!['record','calculated'].includes(claim.class)&&claim.fact){errors.push(`Claim ${claim.id}: only record or calculated claims may contain a canonical fact reference.`);continue;}
  if(['record','calculated'].includes(claim.class)){
   const f=claim.fact,result=f&&[...results].reverse().find(r=>r.name===f.tool&&!r.error&&claim.sourceIds.every(id=>r.sourceIds.includes(id)||(r.provenance||[]).some(p=>p.sourceId===id))&&pathMatchesRecord(r,f.path,claim.sourceIds));
   if(!f||!result||!claim.sourceIds.length||!claim.sourceIds.every(id=>result.sourceIds.includes(id)||(result.provenance||[]).some(p=>p.sourceId===id))){errors.push(`Claim ${claim.id}: no authorized fact provenance.`);continue;}
   const authorized=new Set([...result.sourceIds,...(result.provenance||[]).map(p=>p.sourceId)]);
   let value:any=result.data,parent:any,recordId:string|undefined;
   for(const part of f.path){if(['__proto__','prototype','constructor'].includes(String(part))||value===null||typeof value!=='object'||!Object.hasOwn(value,part)){value=undefined;break;}if(typeof value.id==='string'&&authorized.has(value.id))recordId=value.id;parent=value;value=value[part as any];}
   if(recordId&&!claim.sourceIds.includes(recordId)){errors.push(`Claim ${claim.id}: source ID does not match the referenced record.`);continue;}
   if(value===undefined||value===null||value!==f.value){errors.push(`Claim ${claim.id}: recorded value is missing or differs.`);continue;}
   if(f.unit&&canonicalFactUnit(f.tool,f.path,parent,value)!==f.unit){errors.push(`Claim ${claim.id}: unit mismatch.`);continue;}
   if(f.date&&![parent?.date,parent?.timestamp?.slice(0,10)].includes(f.date)){errors.push(`Claim ${claim.id}: date mismatch.`);continue;}
   const actualLabel=String(f.path.at(-1)==='value'?(parent?.metric||parent?.metadata?.metric||parent?.name||f.path.at(-2)):typeof f.path.at(-1)==='number'?f.path.at(-2):f.path.at(-1));if(f.label.toLowerCase()!==actualLabel.toLowerCase()){errors.push(`Claim ${claim.id}: label must equal the source field ${actualLabel}.`);continue;}
   const rendered={...claim,text:`${actualLabel}${f.date?' on '+f.date:''}: ${f.value}${f.unit?' '+f.unit:''}.`};
   verified.push(rendered);
   const metrics=[f.label];
   if(f.path.at(-1)==='value'&&typeof parent?.metadata?.metric==='string')metrics.push(parent.metadata.metric);
   if(f.tool.startsWith('sleep.')&&(f.path.at(-1)==='value'&&(parent?.type==='sleep'||parent?.unit==='hours'&&parent?.hours===f.value)||['hours','durationHours'].includes(String(f.path.at(-1)))))metrics.push('sleep','sleepduration');
   verifiedMetrics.set(rendered,metrics.map(metric=>metric.toLowerCase().replace(/[^a-z]/g,'')));
  }else if(claim.class==='knowledge'){
   const sources=results.filter(r=>['research.search','attachment.search','knowledge.search','medical.search_knowledge'].includes(r.name)&&!r.error&&(r.data as any)?.sources).flatMap(r=>(r.data as any).sources).filter(s=>claim.sourceIds.includes(s.id)||claim.sourceIds.includes(s.url));
   if(!claim.sourceIds.length||!claim.sourceIds.every(id=>sources.some(s=>s.id===id||s.url===id))){errors.push(`Claim ${claim.id}: no retrieved knowledge source.`);continue;}
   numericHealth.lastIndex=0;const phrases=[...claim.text.matchAll(numericHealth)].map(m=>m[0]);
   if(phrases.length&&/\b(?:your|my|recorded|measured|dose|medication)\b/i.test(claim.text)){errors.push(`Claim ${claim.id}: knowledge excerpts cannot establish personal measured health values.`);continue;}
   if(phrases.some(p=>!sources.some(s=>String(s.excerpt||s.content||'').toLowerCase().replace(/\s+/g,'').includes(p.toLowerCase().replace(/\s+/g,''))))){errors.push(`Claim ${claim.id}: numerical knowledge claim differs from its retrieved excerpt.`);continue;}verified.push(claim);
  }else {
   const sources=new Set(results.filter(r=>!r.error).flatMap(r=>[...r.sourceIds,...(r.provenance||[]).map(p=>p.sourceId)]));
   if(claim.sourceIds.some(id=>!sources.has(id))||claim.class==='inference'&&!claim.sourceIds.length){errors.push(`Claim ${claim.id}: inference or recommendation has no authorized evidence.`);continue;}
   if(claim.class==='missing'&&claim.fact){errors.push(`Claim ${claim.id}: missing information cannot contain a measured value.`);continue;}
   numericHealth.lastIndex=0;
   if(personalUnitlessMeasurement.test(claim.text)||numericHealth.test(claim.text)&&/\b(?:your|my|recorded|measured|was|were|dose|medication)\b/i.test(claim.text)){errors.push(`Claim ${claim.id}: measured numbers require a record or calculated fact reference.`);continue;}
   verified.push(claim);
  }
 }
 const normalizeUnit=(unit:string)=>({h:'hours',hour:'hours',gram:'g',grams:'g',calories:'kcal',set:'sets'}[unit.toLowerCase()]||unit.toLowerCase());
 numericHealth.lastIndex=0;
 for(const phrase of [...summary.matchAll(numericHealth)].map(m=>m[0])){
  const parts=/^(\d+(?:\.\d+)?)\s*(.*)$/.exec(phrase)!;
  if(!verified.some(c=>c.text.includes(phrase)||typeof c.fact?.value==='number'&&c.fact.value===Number(parts[1])&&c.fact.unit&&normalizeUnit(c.fact.unit)===normalizeUnit(parts[2])))errors.push('Unverified numerical health statement in summary.');
 }
 if(medicalAssertion.test(summary))errors.push('Unverified medical result or interaction assertion.');
 for(const match of summary.matchAll(new RegExp(personalUnitlessMeasurement.source,'gi'))){
  const metric=match[1].toLowerCase().replace(/[^a-z]/g,'');
  const aliases:Record<string,string[]>={sleep:['hours','durationhours'],sleepduration:['hours','durationhours'],calorieintake:['calories','caloriesconsumed'],proteinintake:['protein','proteinconsumed']};
  if(!verified.some(c=>typeof c.fact?.value==='number'&&c.fact.value===Number(match[2])&&(verifiedMetrics.get(c)||[]).some(key=>[metric,...(aliases[metric]||[])].includes(key))))errors.push('Personal measurements require an authorized fact reference for that metric and value.');
 }
 if(hasProhibitedMedicalAssertion(summary))errors.push('Medical treatment or diagnostic assertion is prohibited.');
 if(/\b(?:I (?:have )?(?:successfully )?|successfully )(?:saved|logged|updated|applied|completed|modified)\b/i.test(summary)&&!results.some(r=>r.name==='action.verify'&&!r.error&&(r.data as any)?.success===true))errors.push('Claimed execution lacks a verified action result.');
 return {accepted:errors.length===0,claims:verified,errors:[...new Set(errors)],unsupportedCriticalFacts:errors.length};
}
export function assessUrgentSafety(question:string):{blocked:boolean;message?:string;category?:string}{
 const urgent=/\b(?:cannot breathe|can['’]?t breathe|severe (?:chest pain|breathing difficulty)|chest pain (?:with|and) (?:shortness of breath|fainting)|face droop|stroke symptoms|overdose|anaphylaxis|unconscious|vomiting blood)\b/i;
 // A historical or educational clause must not suppress a separate current emergency.
 const clauses=question.split(/[.!?;\n]|\b(?:but|however|and now)\b/i);
 const currentUrgency=clauses.some(clause=>urgent.test(clause)&&(
  /\b(?:now|currently|right now|today|started|I (?:cannot|can['’]?t)|(?:I|we|he|she) (?:have|has|am|is|are))\b/i.test(clause)
  ||!/\b(?:hypothetical|research paper|general information|history of|last year)\b/i.test(clause)
 ));
 if(currentUrgency)return {blocked:true,category:'urgent_symptoms',message:'The symptoms you described may need urgent assessment. Contact your local emergency service or seek emergency medical care now. Health OS cannot diagnose this, and it will pause health-plan changes.'};
 return {blocked:false};
}
/** Model prose never supplies measured numbers: authoritative fact renderings replace those sentences. */
export function renderGroundedAnswer(summary:string,verified:GroundedClaim[]):string {
 const narrative=summary.split(/(?<=[.!?])\s+|\n/).filter(sentence=>{numericHealth.lastIndex=0;return !numericHealth.test(sentence)&&!personalUnitlessMeasurement.test(sentence);}).join('\n').trim();
 const facts=verified.map(c=>c.class==='inference'?'Possible interpretation: '+c.text:c.class==='recommendation'?'Suggested next step: '+c.text:c.class==='knowledge'?'General evidence: '+c.text:c.text);
 return [narrative,...facts].filter(Boolean).join('\n\n');
}
