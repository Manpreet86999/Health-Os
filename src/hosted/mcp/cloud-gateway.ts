import {bioSchema,live,type BioRecord} from '../../shared/biology.js';
import {snapshotFromRecords} from '../../shared/record-snapshot.js';
import {validateRecord,type CloudRecord} from '../../shared/cloud.js';
import {executeHealthAction,type ActionRecord} from '../../shared/health-action-registry.js';
import {HealthStateService} from '../../shared/intelligence/state.js';
import {actionDefinitions,McpDomainError,responseSchema,type ActionId} from '../../shared/mcp-contracts.js';
import {cloudSupports,calendarStamp,dayInZone,noonInZone} from '../../shared/mcp-execution.js';
import {fingerprint} from '../../shared/automation-model.js';
import type {RecordService} from '../../shared/intelligence/contracts.js';
import type {SupabaseAccountSession} from '../../shared/supabase-auth.js';
import {DEFAULT_SUPABASE_CONFIG} from '../../shared/supabase-project.js';

export class CloudBackendUnavailable extends McpDomainError{constructor(public safeToFallback:boolean,detail=''){super('CLOUD_UNAVAILABLE','Synchronized Health OS services are temporarily unavailable.'+(detail?' '+detail:'')+' Retry the same action key.',true);}}
const workspaceKinds=['profile','workspaceState','week','session','readiness','measurement','trainingConfig','scheduledWorkout','healthReading','target','habit','habitLog','cardio','goalCheckIn'];
const biologicalKinds=['vital','sleep','checkIn','meal','water','nutritionTarget','sleepPreference','bodyMeasurement','recoveryNote','goal','goalCheckIn','nutritionDay','routine','food','recipe','mealPlan'];
const maxRows=6000,maxBytes=8*1024*1024;
type Job={id:string;action:ActionId;input:unknown;receiptId:string};
type Context={userId:string;clientId:string;scopes:string[];timeZone:string;authorize:()=>void};
/** Keep each source's daily candidate using the same timestamp ordering as preferredVitals.
 * Imported sample pages are streamed; no sums or synthetic measurements are produced. */
export function compactHealthSamples(rows:any[],timeZone:string){
 const days=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}),kept=new Map<string,any>();
 for(const row of rows){
  if(row.entity_type!=='healthReading'){kept.set(row.entity_type+':'+row.record_id,row);continue;}
  if(row.deleted_at)continue;
  const reading=row.payload;if(!reading||typeof reading.startTime!=='string'||!Number.isFinite(Date.parse(reading.startTime)))throw new McpDomainError('INVALID_UPSTREAM','Invalid imported health sample timestamp.');
  const key=JSON.stringify([reading.kind,reading.source,days.format(new Date(reading.startTime))]),old=kept.get(key);
  if(!old||Date.parse(reading.startTime)>Date.parse(old.payload.startTime))kept.set(key,row);
 }
 return [...kept.values()].sort((a,b)=>a.change_version-b.change_version);
}
/** Semantic shared actions over ordinary account-owned synchronized data; no general DB endpoint. */
export class CloudActionGateway{
 constructor(private fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
 private async request(session:SupabaseAccountSession,path:string,body?:unknown,write=false){
  let response:Response;try{response=await this.fetcher(DEFAULT_SUPABASE_CONFIG.url+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:DEFAULT_SUPABASE_CONFIG.publishableKey,Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch(e){throw new CloudBackendUnavailable(!write,`Request to ${path.split('?')[0]} failed (${(e as any)?.name==='TimeoutError'?'timeout':'network'}).`);}
  const raw=await response.text();if(raw.length>maxBytes)throw new McpDomainError('DATA_LIMIT','This synchronized data window exceeds the cloud execution limit. Use a smaller history window.');let result:any;try{result=JSON.parse(raw);}catch{throw new CloudBackendUnavailable(!write,`Request to ${path.split('?')[0]} returned HTTP ${response.status}.`);}
  if(!response.ok){if(response.status===401||response.status===403)throw new McpDomainError('CLOUD_AUTH_REQUIRED','Cloud account access was denied. Reconnect this client.');if(response.status===409||result?.code==='40001')throw new McpDomainError('CONFLICT','A synchronized source changed. Review the latest record before retrying.');throw new CloudBackendUnavailable(!write,`Request to ${path.split('?')[0]} returned HTTP ${response.status}${typeof result?.code==='string'&&/^[A-Z0-9]{5}$/.test(result.code)?' ('+result.code+')':''}.`);}
  return result;
 }
 private async pages(session:SupabaseAccountSession,table:string,query:URLSearchParams,idKey:string,compact?:(rows:any[])=>any[]){
  let rows:any[]=[],cursor:any=idKey==='change_version'?0:'';
  for(let page=0;page<(compact?120:30);page++){
   const params=new URLSearchParams(query);params.set('order',idKey+'.asc');params.set('limit','500');if(cursor)params.set(idKey,'gt.'+cursor);
   const batch=await this.request(session,table+'?'+params);if(!Array.isArray(batch))throw new CloudBackendUnavailable(true);if(!batch.length)return rows;
   for(const row of batch){if(row.user_id!==session.uid)throw new McpDomainError('PERMISSION_DENIED','Cloud page owner mismatch.');if(typeof row[idKey]!==typeof cursor||row[idKey]<=cursor)throw new McpDomainError('INVALID_UPSTREAM','Cloud pagination did not advance.');cursor=row[idKey];}
   rows=compact?compact([...rows,...batch]):[...rows,...batch];
   if(rows.length>maxRows||JSON.stringify(rows).length>maxBytes){const counts=new Map<string,number>();for(const r of rows){const kind=r.entity_type||r.payload?.type||'unknown';counts.set(kind,(counts.get(kind)||0)+1);}throw new McpDomainError('DATA_LIMIT',`This synchronized data window is too large (${table}: ${rows.length} rows; ${[...counts].map(([kind,count])=>kind+'='+count).join(', ')}). Use a smaller history window.`);}
   if(batch.length<500)return rows;
  }
  throw new McpDomainError('DATA_LIMIT','Cloud pagination limit reached.');
 }

 private async projectionPages(session:SupabaseAccountSession,kind:'workspace'|'biology',params:Record<string,unknown>){
  const idKey=kind==='workspace'?'change_version':'record_id',rows:any[]=[];let cursor:any=kind==='workspace'?0:'';
  for(let page=0;page<30;page++){
   const batch=await this.request(session,`rpc/health_os_mcp_${kind}_page`,{...params,p_after:cursor,p_page_size:500});
   if(!Array.isArray(batch))throw new CloudBackendUnavailable(true);
   for(const row of batch){if(row.user_id!==session.uid)throw new McpDomainError('PERMISSION_DENIED','Cloud projection owner mismatch.');if(typeof row[idKey]!==typeof cursor||row[idKey]<=cursor||(kind==='workspace'&&!Number.isSafeInteger(row[idKey])))throw new McpDomainError('INVALID_UPSTREAM','Cloud projection pagination did not advance.');cursor=row[idKey];rows.push(row);}
   if(rows.length>maxRows||JSON.stringify(rows).length>maxBytes)throw new McpDomainError('DATA_LIMIT','The projected data window is too large. Use a smaller history window.');
   if(batch.length<500)return rows;
  }
  throw new McpDomainError('DATA_LIMIT','Cloud projection pagination limit reached.');
 }

 async execute(job:Job,session:SupabaseAccountSession,context:Context){
  const started=Date.now(),def=actionDefinitions[job.action];context.authorize();
  if(!cloudSupports(job.action)||!['R0','R1'].includes(def.risk))throw new McpDomainError('DEVICE_REQUIRED','This action requires a compatible active Health OS device.');
  if(session.uid!==context.userId||!context.scopes.includes(def.scope)||session.config.url!==DEFAULT_SUPABASE_CONFIG.url)throw new McpDomainError('PERMISSION_DENIED','Cloud action authorization mismatch.');
  const input=def.schema.safeParse(job.input);if(!input.success)throw new McpDomainError('INVALID_INPUT','Parameters do not match the shared action schema.');
  const today=dayInZone(new Date().toISOString(),context.timeZone),date=(input.data as any).date||today;
  // Keep the 90-day comparison plus its prior seven-day baseline. Explicit periods retain their history.
  const requestedFrom=(input.data as any).from,requestedTo=(input.data as any).to;
  if(requestedFrom&&requestedTo&&(requestedFrom>requestedTo||requestedTo>date||(Date.parse(requestedTo)-Date.parse(requestedFrom))/86400000>365))throw new McpDomainError('INVALID_INPUT','Choose a bounded past history window.');
  const requestedDays=requestedFrom?Math.ceil((Date.parse(date)-Date.parse(requestedFrom))/86400000)+1:Number((input.data as any).days||String((input.data as any).timeRange||'').replace('d',''))||0;
  const from=new Date(date+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-Math.max(job.action==='body.get_weight_trend'?366:97,requestedDays));
  // Include timezone boundary days; canonical actions select the exact local dates.
  const bioFrom=new Date(from);bioFrom.setUTCDate(bioFrom.getUTCDate()-1);
  const through=new Date(date+'T00:00:00Z');through.setUTCDate(through.getUTCDate()+2);
  const weightOnly=job.action==='body.get_weight_trend';
  const recordOnlyTypes:Partial<Record<ActionId,string[]>>={
   'medical.get_notes':['journal'],'reports.get_saved':['journal'],'reminders.get':['journal'],'knowledge.search':['journal'],'medical.search_knowledge':['journal'],'sleep.get_latest':['sleep'],'sleep.get_history':['sleep'],'body.get_weight_trend':['vital'],'body.get_history':['vital'],'body.get_measurements':['bodyMeasurement'],
   'nutrition.get_today':['meal','nutritionDay','water','nutritionTarget'],'nutrition.get_remaining_targets':['meal','nutritionDay','water','nutritionTarget'],'nutrition.get_usual_meals':['routine'],'nutrition.get_meals':['meal'],'nutrition.get_recent_meals':['meal'],'nutrition.get_water':['water','nutritionDay'],'nutrition.get_meal_plans':['mealPlan'],
   'goals.get_active':['goal'],'medical.get_recent_symptoms':['symptom'],'recovery.get_history':['recoveryNote'],
   'sleep.get_trend':['sleep'],'sleep.get_debt':['sleep','sleepPreference'],
   'body.get_weight_history':['vital'],'body.get_measurement_history':['vital','bodyMeasurement'],'body.get_activity_history':['vital'],'body.get_trends':['vital','bodyMeasurement'],
   'nutrition.get_history':['meal','water','nutritionDay','nutritionTarget'],'nutrition.get_targets':['nutritionTarget'],'nutrition.get_adherence':['meal','nutritionDay','nutritionTarget'],'nutrition.search_food':['food','recipe'],
   'medical.get_medications':['medication'],'medical.get_conditions':['illness'],'medical.get_symptoms':['symptom'],'medical.get_timeline':['symptom','illness'],
   'profile.get':[],'profile.get_preferences':[],'profile.get_goals':['goal'],'profile.get_constraints':['recoveryNote'],
   'training.search_exercises':[],'training.get_exercise_history':[],'training.get_progression':[],'training.get_load':[],'training.get_plan_week':[],
   'goals.get_history':['goal','goalCheckIn'],'habits.get_schedule':['habit'],'habits.get_completions':['habitDone'],'experiments.get':['experiment'],'experiments.get_results':['experiment'],
  };
  const appendTypes=def.risk==='R1'?(job.action==='nutrition.set_daily_totals'?['nutritionDay','water']:job.action==='nutrition.log_usual_meal'?['routine','food','recipe']:job.action==='nutrition.log_natural_language'?['food','recipe']:[]):undefined;
  const isolatedTypes=recordOnlyTypes[job.action]??appendTypes;
  const workspaceTypes=job.action.startsWith('medical.')?['profile','medicalReport']:job.action.startsWith('care.')?['profile','careSettings','careTask','careGoal','careEvent','careCheckIn','careReview','carePlanVersion','skinProduct']:job.action.startsWith('training.')||job.action==='profile.get_constraints'?workspaceKinds:isolatedTypes?['profile',...(job.action==='profile.get_goals'?['target']:[])]:workspaceKinds;
  const summaryRead=['health.get_today','health.get_current_state','health.get_priorities','health.get_context','intelligence.get_current_state','intelligence.analyze_period','reports.get_period','recovery.get_current','recovery.get_readiness','body.get_current','body.get_activity_history','body.get_trends','sleep.get_baseline','training.get_recent_load','intelligence.get_predictions'].includes(job.action);
  const bioTypes=isolatedTypes??(job.action.startsWith('medical.')?['symptom']:job.action.startsWith('care.')?[]:summaryRead?biologicalKinds.filter(t=>!['food','recipe'].includes(t)):biologicalKinds);
  const extraTypes=job.action.startsWith('care.')?['skinProfile','skinRoutine','skinLog','skinCareData']:job.action.startsWith('training.')?['exercise','librarySplit','program']:job.action==='profile.get_preferences'?['sharedPreferences']:job.action==='profile.get_constraints'?['painLog']:job.action.startsWith('habits.')?['habit','habitLog']:[];
  const [projectedWorkspaceRaw,windowBioRaw,receiptRaw,extraWorkspaceRaw]=await Promise.all([
   this.projectionPages(session,'workspace',{p_from:from.toISOString().slice(0,10),p_through:date,p_time_zone:context.timeZone,p_types:workspaceTypes}),
   bioTypes.length===0?Promise.resolve([]):summaryRead?this.projectionPages(session,'biology',{p_from:bioFrom.toISOString(),p_until:through.toISOString(),p_time_zone:context.timeZone,p_types:bioTypes}):job.action==='sleep.get_latest'?this.request(session,'health_os_biological_records?'+new URLSearchParams({select:'user_id,record_id,payload,revision',user_id:'eq.'+context.userId,'mcp_record_type':'eq.sleep',order:'payload->>timestamp.desc,record_id.desc',limit:'1'})):this.pages(session,'health_os_biological_records',new URLSearchParams({select:'user_id,record_id,payload,revision',user_id:'eq.'+context.userId,'mcp_record_type':'in.('+bioTypes.join(',')+')',...(job.action==='medical.get_notes'?{'payload->>domain':'eq.Health','payload->metadata->>clinicalInterpretation':'eq.false'}:job.action==='reports.get_saved'?{'payload->metadata->>intelligenceSavedReport':'eq.true'}:job.action==='reminders.get'?{'payload->metadata->>intelligenceReminder':'eq.true'}:{}),...(weightOnly||job.action==='body.get_weight_history'?{'mcp_metric':'eq.Weight'}:job.action==='body.get_history'?{'mcp_metric':'eq.'+(input.data as any).metric}:{}),...(['knowledge.search','medical.search_knowledge'].includes(job.action)?{'payload->metadata->>knowledgeDocument':'eq.true','payload->metadata->>knowledgeDomain':'in.('+((input.data as any).domains as string[]).join(',')+')'}:{or:`(mcp_record_type.in.(nutritionTarget,sleepPreference,goal,routine,food,recipe,mealPlan,medication,illness,habit,experiment),and(payload->>timestamp.gte.${bioFrom.toISOString()},payload->>timestamp.lt.${through.toISOString()}))`})}), 'record_id'),
   def.risk==='R1'?this.request(session,'health_os_biological_records?'+new URLSearchParams({select:'user_id,record_id,payload,revision',user_id:'eq.'+context.userId,record_id:'eq.mcp-receipt-'+job.receiptId})):Promise.resolve([]),
   extraTypes.length?this.pages(session,'body_os_records',new URLSearchParams({select:'user_id,entity_type,record_id,payload,updated_at,cloud_updated_at,revision,device_id,deleted_at',user_id:'eq.'+context.userId,deleted_at:'is.null',entity_type:'in.('+extraTypes.join(',')+')'}),'record_id'):Promise.resolve([]),
  ]);
  const workspaceRaw=[...projectedWorkspaceRaw,...extraWorkspaceRaw];
  // Summaries need saved food profiles only for referenced planned meals, not the whole catalog.
  const profileIds=summaryRead?[...new Set(windowBioRaw.filter((row:any)=>row.payload?.type==='mealPlan').map((row:any)=>row.payload.metadata?.recipeId).filter((id:any)=>typeof id==='string'))]:[];
  const profiles:any[]=[];for(let i=0;i<profileIds.length;i+=100){context.authorize();profiles.push(...await this.pages(session,'health_os_biological_records',new URLSearchParams({select:'user_id,record_id,payload,revision',user_id:'eq.'+context.userId,record_id:'in.('+profileIds.slice(i,i+100).join(',')+')','mcp_record_type':'in.(food,recipe)'}),'record_id'));}
  const bioRaw=[...windowBioRaw,...profiles];
  const workspace:CloudRecord[]=[...new Map(workspaceRaw.map(row=>[row.entity_type+':'+row.record_id,row])).values()].map(row=>{if(row.user_id!==context.userId)throw new McpDomainError('PERMISSION_DENIED','Cloud workspace owner mismatch.');return validateRecord({id:row.record_id,entityType:row.entity_type,payload:row.payload,updatedAt:row.updated_at,revision:row.revision,deviceId:row.device_id,...(row.deleted_at?{deletedAt:row.deleted_at}:{}),cloudVersion:row.cloud_updated_at});});
  const records:BioRecord[]=[...bioRaw,...receiptRaw].map(row=>{const record=bioSchema.parse(row.payload);if(row.user_id!==context.userId||record.userId!==context.userId||record.id!==row.record_id)throw new McpDomainError('PERMISSION_DENIED','Cloud biological owner or identity mismatch.');if(!Number.isSafeInteger(row.revision)||row.revision<1)throw new McpDomainError('INVALID_UPSTREAM','Invalid cloud biological revision.');return record;});
  // Device payload revisions and server CAS revisions are distinct in the sync protocol.
  const cloudRevisions=new Map<string,number>([...bioRaw,...receiptRaw].map(row=>[row.record_id,row.revision]));
  // Domain calculators use host-local Date getters. Floating local-calendar
  // timestamps prevent the account offset from being applied a second time on
  // Windows/Android; original UTC timestamps are restored in returned records.
  const localStamp=(stamp:string)=>calendarStamp(stamp,context.timeZone).replace(/Z$/,'');
  const preference=Object.fromEntries(Object.entries(workspace.find(r=>r.entityType==='sharedPreferences')?.payload||{})),safePreferences=Object.fromEntries(['trainingStyle','dietPreferences','trainingSchedule','equipment','dislikedExercises','communicationStyle'].filter(k=>preference[k]!==undefined).map(k=>[k,preference[k]]));
  const view=records.map(r=>({...r,timestamp:localStamp(r.timestamp)})),db=snapshotFromRecords(workspace),dataset={userId:context.userId,db,skin:db.skin!,records:view,preferences:safePreferences,freshness:'synchronized' as const,profileProvided:workspace.some(r=>r.entityType==='profile'),medicalReports:job.action.startsWith('medical.')?workspace.filter(r=>r.entityType==='medicalReport'&&!r.deletedAt).map(r=>r.payload as any):[]},states=new HealthStateService();
  // Legacy imported readings must use the same account-local calendar as biological reads.
  db.healthReadings=(db.healthReadings||[]).map(r=>({...r,startTime:localStamp(r.startTime),endTime:localStamp(r.endTime)}));
  const commit:RecordService['commit']=async(writes,deletes,expectations)=>{
   context.authorize();if(deletes.length||def.risk!=='R1')throw new McpDomainError('PERMISSION_DENIED','Cloud mutation is not allowed.');
   const now=new Date().toISOString(),prepared=writes.map(input=>{const old=records.find(r=>r.id===input.id),isReceipt=input.id==='mcp-receipt-'+job.receiptId;return bioSchema.parse({...input,id:input.id,userId:context.userId,deviceId:'mcp-cloud:'+context.clientId,quality:old?.quality||'manual',unit:input.unit||'',source:input.source||'HEOS MCP',timestamp:isReceipt?now:input.timestamp?noonInZone(date,context.timeZone):old?.timestamp||now,createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1,syncState:'saved',metadata:{...input.metadata,...(isReceipt?{executor:'cloud',clientId:context.clientId,risk:def.risk,requestId:job.id,verificationStatus:'pending',latencyMs:Date.now()-started}: {})}});});
   const result=await this.request(session,'rpc/health_os_commit_biological_records',{p_writes:prepared,p_expectations:expectations.map(e=>{const current=records.find(r=>r.id===e.id);if((current?.revision??null)!==e.revision)throw new McpDomainError('CONFLICT','A synchronized source changed.');return {id:e.id,revision:cloudRevisions.get(e.id)??null};})},true);
   if(!Array.isArray(result.records)||result.records.length!==prepared.length)throw new McpDomainError('VERIFY_FAILED','Cloud commit acknowledgement was incomplete.',true);
   for(const value of result.records){const row=bioSchema.parse(value);if(row.userId!==context.userId||!prepared.some(r=>r.id===row.id))throw new McpDomainError('PERMISSION_DENIED','Cloud write acknowledgement owner mismatch.');const index=records.findIndex(r=>r.id===row.id);if(index<0)records.push(row);else records[index]=row;cloudRevisions.set(row.id,(cloudRevisions.get(row.id)||0)+1);}
  };
  const saveMany=async(writes:ActionRecord[])=>commit(writes,[],writes.map(row=>({id:row.id,revision:records.find(r=>r.id===row.id)?.revision??null})));
  let result=await executeHealthAction(job.action,input.data,{dataset,today,hour:Number(calendarStamp(new Date().toISOString(),context.timeZone).slice(11,13)),readRecords:async()=>view,commit,saveMany,getState:day=>states.observe(dataset,day)},job.receiptId) as any;
  if(def.risk==='R1'){
   context.authorize();const auditId='mcp-receipt-'+job.receiptId,ids=[auditId,...(result.changedRecords||[]).map((r:any)=>r.id)];
   const verified=await this.request(session,'health_os_biological_records?'+new URLSearchParams({select:'user_id,record_id,payload,revision',user_id:'eq.'+context.userId,record_id:'in.('+ids.join(',')+')'}),undefined,true);
   const actual:BioRecord[]=verified.map((row:any)=>{const r=bioSchema.parse(row.payload);if(row.user_id!==context.userId||r.userId!==context.userId||r.id!==row.record_id)throw new McpDomainError('PERMISSION_DENIED','Cloud verification owner mismatch.');return r;});
   const receipt=actual.find(r=>r.id===auditId),changed=actual.find(r=>r.id===result.changedRecords?.[0]?.id);
   if(!receipt||!changed||fingerprint({type:changed.type,name:changed.name,value:changed.value,unit:changed.unit,metadata:changed.metadata})!==receipt.metadata.recordFingerprint)throw new McpDomainError('VERIFY_FAILED','The cloud action may have committed, but its saved record could not be verified. Retry the original key.',true);
   result={...result,execution:{executor:'cloud',reason:'Cloud-safe synchronized append.',source:'synchronized',verified:true,asOf:new Date().toISOString()}};
   const revised=bioSchema.parse({...receipt,revision:receipt.revision+1,updatedAt:new Date().toISOString(),metadata:{...receipt.metadata,verificationStatus:'verified',result:JSON.stringify(result)}});
   context.authorize();const ack=await this.request(session,'rpc/health_os_commit_biological_records',{p_writes:[revised],p_expectations:[{id:receipt.id,revision:verified.find((row:any)=>row.record_id===receipt.id).revision}]},true);if(ack.records?.[0]?.metadata?.verificationStatus!=='verified')throw new McpDomainError('VERIFY_FAILED','Cloud receipt verification could not be saved. Retry the original key.',true);
  }else{
   const original=new Map(records.map(r=>[r.id,r]));const restore=(value:any):any=>{if(Array.isArray(value))return value.map(restore);if(value&&typeof value==='object'){const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,restore(v)]));if(typeof out.id==='string'&&out.timestamp&&original.has(out.id))out.timestamp=original.get(out.id)!.timestamp;return out;}return value;};
   result={...result,data:restore(result.data),execution:{executor:'cloud',reason:'Account-scoped synchronized read.',source:'synchronized',verified:true,asOf:new Date().toISOString()},warnings:[...(result.warnings||[]),'Unsynchronized device changes are not included.']};
  }
  context.authorize();return responseSchema.parse(result);
 }
}
