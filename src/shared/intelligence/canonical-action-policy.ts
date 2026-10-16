import {z} from 'zod';
import {actionDefinitions,type ActionId} from '../mcp-contracts.js';
import type {ChatDomain} from '../intelligence-chat.js';
/** R3/admin, destructive undo and treatment actions never enter the model action catalog. */
export const agentCanonicalActions=Object.keys(actionDefinitions).filter(name=>{const d=actionDefinitions[name as ActionId];return ['R1','R2'].includes(d.risk)&&!['admin.mcp','developer.diagnostics'].includes(d.scope)&&(d.scope!=='medical.write'||['medical.add_note','medical.log_symptom'].includes(name))&&name!=='health.undo_action';}) as [ActionId,...ActionId[]];
export function canonicalActionDomain(action:ActionId):ChatDomain{const scope=actionDefinitions[action]?.scope.split('.')[0];return scope==='training'?'training':scope==='nutrition'?'nutrition':scope==='sleep'?'sleep':scope==='recovery'?'recovery':scope==='body'?'body':scope==='care'?'care':scope==='medical'?'medical':'goals';}
export function permittedCanonicalActions(domains:ChatDomain[]){return agentCanonicalActions.filter(action=>domains.includes(canonicalActionDomain(action))&&(action!=='reports.save_period'||(['training','nutrition','sleep','recovery','body'] as ChatDomain[]).every(domain=>domains.includes(domain))));}
export function canonicalModelActionSchema(domains:ChatDomain[]){
 const variants=permittedCanonicalActions(domains).map(action=>z.object({kind:z.literal('canonical_action'),action:z.literal(action),input:actionDefinitions[action].schema as z.ZodType<Record<string,unknown>>,reason:z.string().min(1).max(500)}).strict());
 return variants.length===0?z.never():variants.length===1?variants[0]:z.union(variants as [typeof variants[number],typeof variants[number],...typeof variants[number][]]);
}
export function validateCanonicalAction(action:ActionId,input:unknown,domains:ChatDomain[],identity:string,defaultDate?:string){
 if(!permittedCanonicalActions(domains).includes(action))throw new Error('This canonical action is outside the approved health context.');
 const raw=z.record(z.string(),z.unknown()).parse(input),schema=actionDefinitions[action].schema;return schema.parse({...raw,...(defaultDate&&schema instanceof z.ZodObject&&Object.hasOwn(schema.shape,'date')&&raw.date===undefined?{date:defaultDate}:{}),idempotencyKey:identity});
}
/** Stable UUID receipts retain compatibility with canonical undo across devices. */
export async function canonicalReceiptId(owner:string,proposalId:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,proposalId]))));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
export async function approvalFingerprint(proposal:unknown){const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(proposal))));return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');}
const observationFields:Partial<Record<ActionId,string[]>>={'body.log_weight':['weight'],'body.log_measurement':['value'],'body.log_steps':['steps'],'sleep.log_session':['hours'],'nutrition.log_water':['amount'],'recovery.log_soreness':['severity'],'recovery.log_check_in':['energy','soreness','stress','motivation','mood'],'medical.log_symptom':['severity'],'training.log_set':['weight','reps'],'training.log_timed_set':['seconds'],'training.log_reps_set':['reps']};
/** A review card cannot manufacture a missing measured/self-reported quantity. */
export function unsupportedObservationFields(action:ActionId,input:Record<string,unknown>,question:string){
 const fields=observationFields[action]||[],text=question.replace(/\b\d{4}-\d{2}-\d{2}(?:T[^\s]+)?\b/g,'');
 const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
 const withoutDenominators=text.replace(/(\d+(?:\.\d+)?)\s*\/\s*10\b/g,'$1');
 const supplied=[...(withoutDenominators.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),...words.flatMap((word,value)=>new RegExp('\\b'+word+'\\b','i').test(text)?[value]:[])];
 const quantities=(pattern:RegExp,convert:(amount:number,unit:string)=>number|null)=>[...unitText.matchAll(pattern)].flatMap(match=>{const clause=unitText.slice(0,match.index).split(/[.!?;]|\b(?:and|but)\b/i).at(-1)||'';if(/\b(?:goal|target|aim|planned|proposed|friend|partner|sister|brother|mother|father)\b/i.test(clause))return [];const value=convert(Number(match[1]),match[2].toLowerCase());return value===null?[]:[value];});
 const unitText=words.reduce((value,word,number)=>value.replace(new RegExp('\\b'+word+'\\b','gi'),()=>String(number)),text);
 let exact:number[]|undefined;
 if(action==='body.log_weight')exact=quantities(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|lb|lbs|pounds?)\b/gi,(n,u)=>{const kg=u.startsWith('kg')||u.startsWith('kilogram');return input.unit==='lb'?(kg?n/.45359237:n):(kg?n:n*.45359237);});
 if(action==='sleep.log_session')exact=quantities(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)\b/gi,(n,u)=>u.startsWith('m')?n/60:u.startsWith('s')?n/3600:n);
 if(action==='nutrition.log_water')exact=quantities(/(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?)\b/gi,(n,u)=>{const ml=u.startsWith('ml')||u.startsWith('millil')?n:u.startsWith('o')?n*29.5735:n*1000;return input.unit==='L'?ml/1000:input.unit==='oz'?ml/29.5735:ml;});
 return fields.filter(field=>typeof input[field]==='number'&&!(exact||supplied).some(value=>Math.abs(value-Number(input[field]))<.0001));
}
