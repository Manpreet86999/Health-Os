import {z} from 'zod';
import {actionDefinitions,type ActionId} from './mcp-contracts.js';

export const executionClasses=['CLOUD_NATIVE','CLOUD_READ_ONLY','DEVICE_PREFERRED','DEVICE_REQUIRED','UNSUPPORTED_REMOTE'] as const;
export type ExecutionClass=typeof executionClasses[number];
export type ExecutorType='cloud'|'web'|'android';
export const cloudWriteActions=['nutrition.set_daily_totals','body.log_weight','recovery.log_soreness','nutrition.log_usual_meal','nutrition.log_natural_language','nutrition.log_water','sleep.log_session','body.log_measurement','recovery.add_note','recovery.log_check_in'] as const;
const deviceReads=new Set<string>(['training.get_active_workout','training.create_adaptation_plan']);
const preferredReads=new Set<string>(['health.get_current_state','health.get_today','health.get_priorities','health.get_context','intelligence.get_current_state','nutrition.get_today','recovery.get_current','recovery.get_readiness']);
export function executionClass(action:ActionId):ExecutionClass{
 const def=actionDefinitions[action];if((['R3'] as string[]).includes(def.risk)||['admin.mcp','developer.diagnostics','medical.write'].includes(def.scope))return 'UNSUPPORTED_REMOTE';
 if(deviceReads.has(action)||def.risk==='R2'||def.risk==='R1'&&!(cloudWriteActions as readonly string[]).includes(action))return 'DEVICE_REQUIRED';
 if(preferredReads.has(action))return 'DEVICE_PREFERRED';
 if(def.risk==='R0'&&(def.scope==='medical.read'||action==='training.get_program'))return 'CLOUD_READ_ONLY';
 return 'CLOUD_NATIVE';
}
export function cloudSupports(action:ActionId){return ['CLOUD_NATIVE','CLOUD_READ_ONLY','DEVICE_PREFERRED'].includes(executionClass(action));}
export const executorAnnouncement=z.object({executorId:z.string().min(1).max(100),type:z.enum(['web','android']),version:z.string().min(1).max(40),capabilities:z.array(z.enum(Object.keys(actionDefinitions) as [ActionId,...ActionId[]])).max(150),unsyncedChanges:z.boolean().default(false),activeWorkoutId:z.string().max(150).nullable().default(null)}).strict();
export type ExecutorState={executorId:string;type:ExecutorType;account:string;online:boolean;lastHeartbeat:number;lastActiveAt:number;version:string;capabilities:ActionId[];unsyncedChanges:boolean;activeWorkoutId:string|null};
export type ExecutionDecision={executor:ExecutorType|'unavailable';reason:string;requiredCapability:ActionId;availableExecutors:ExecutorType[]};
/** Device health and capabilities are scoped to the authenticated owner, never model input. */
export class ExecutionRouter{
 choose(action:ActionId,account:string,executors:ExecutorState[],workoutId?:string):ExecutionDecision{
  const states=executors.filter(e=>e.account===account&&e.online&&(e.type==='cloud'||Date.now()-e.lastHeartbeat<120000)&&e.capabilities.includes(action)&&(!workoutId||e.type==='cloud'||e.activeWorkoutId===workoutId||e.version==='legacy-bridge'));
  const availableExecutors=[...new Set(states.map(e=>e.type))],classification=executionClass(action);
  const result=(executor:ExecutionDecision['executor'],reason:string)=>({executor,reason,requiredCapability:action,availableExecutors});
  if(classification==='UNSUPPORTED_REMOTE')return result('unavailable','This action is not permitted remotely.');
  const devices=states.filter(e=>e.type!=='cloud').sort((a,b)=>b.lastActiveAt-a.lastActiveAt),cloud=states.find(e=>e.type==='cloud');
  if(classification==='DEVICE_REQUIRED'){
   const device=devices[0];
   return device?result(device.type,'An active compatible device owns this local workflow.'):result('unavailable','This action requires an active compatible Health OS device.');
  }
  const fresh=devices.find(e=>e.unsyncedChanges);
  if(classification==='DEVICE_PREFERRED'&&fresh)return result(fresh.type,'An active device has newer unsynchronized observations.');
  if(cloud)return result('cloud',actionDefinitions[action].risk==='R0'?'Account-scoped synchronized read.':'Cloud-safe synchronized append.');
  return devices.length?result(devices[0].type,'Cloud execution is unavailable; a compatible device is online.'):result('unavailable','Authorize cloud access for this connection or open a compatible Health OS device.');
 }
}

export function dayInZone(stamp:string,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp));const get=(key:string)=>parts.find(p=>p.type===key)!.value;return `${get('year')}-${get('month')}-${get('day')}`;}
export function validTimeZone(value:string){try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format();return value;}catch{throw new Error('Choose a valid IANA time zone.');}}
export function calendarStamp(stamp:string,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp));const get=(key:string)=>parts.find(p=>p.type===key)!.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`;}
export function noonInZone(date:string,timeZone:string){const wanted=Date.parse(date+'T12:00:00Z'),offset=Date.parse(calendarStamp(new Date(wanted).toISOString(),timeZone))-wanted;return new Date(wanted-offset).toISOString();}
