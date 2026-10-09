import { z } from 'zod';
import { bioSchema, dateOf, type BioRecord } from '../../shared/biology';
import { reportInputSchema, reportBundle, labTrends, parseReportText, type MedicalReport } from '../../shared/medical';
import { calculateMedical, CLINICAL_RULES, evidenceCards, medicationReview, physiologicalSignals } from '../../shared/medical-intelligence';
import { emptyMedicalActions, reconcileMedicalActions, rankedMedicalInbox, medicalTimeline, followupInputSchema, evidenceRefSchema, researchFields, prospectiveResearchRows, matchingRepeatResults, type MedicalActionState } from '../../shared/medical-actions';
import { invokeCloud } from './cloud-session';
import { runWorkerJob, submitWorkerJob, workerJobs, workerJob, workerStatus } from './local-worker';
import { researchWorkbenchSchema } from '../../shared/research-workbench';
import { appointmentsCloudRoute } from './appointments-cloud';
import { readBiologicalCloud } from './biology-cloud';

type Workspace = {session:any;records:any[];get:(type:any,id:string)=>any;save:(type:any,payload:any,id?:string)=>Promise<any>;remove:(type:any,id:string)=>Promise<void>};
const json=(value:unknown,status=200)=>Response.json(value,{status});
const hash=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))].map(n=>n.toString(16).padStart(2,'0')).join('');
const now=()=>new Date().toISOString();
const actionRequests=new Map<string,Promise<Response>>();
export function medicalCloudRoute(path:string,method:string,body:any,ws:Workspace):Promise<Response>{
  if(!path.startsWith('/medical/actions/'))return medicalCloudRequest(path,method,body,ws);
  // Snapshot reconciliation and explicit actions share one versioned envelope.
  // Serialize this tab's read/modify/save transactions; remote edits still use
  // the existing revision checks. This is not an offline write queue.
  const scope=`${ws.session.config.url}|${ws.session.uid}`;
  const request=(actionRequests.get(scope)||Promise.resolve()).catch(()=>{}).then(()=>medicalCloudRequest(path,method,body,ws));
  actionRequests.set(scope,request);
  void request.finally(()=>{if(actionRequests.get(scope)===request)actionRequests.delete(scope);}).catch(()=>{});
  return request;
}
async function medicalCloudRequest(path:string,method:string,body:any,ws:Workspace):Promise<Response>{
  const reports=ws.records.filter(r=>r.entityType==='medicalReport'&&!r.deletedAt).map(r=>r.payload as MedicalReport);
  const records:BioRecord[]=Array.isArray(body.records)?body.records.map((r:unknown)=>bioSchema.parse(r)):[];
  const state:MedicalActionState=structuredClone(ws.get('automationState','health-os-medical-actions')?.payload.state||emptyMedicalActions());
  if (path.startsWith('/medical/appointments')) {
    const ownedRecords = method === 'GET' && !path.endsWith('/summary') ? [] : (await readBiologicalCloud(ws.session)).map(row => row.payload);
    return appointmentsCloudRoute(path, method, body, ws, { reports, records: ownedRecords, state });
  }
  const saveState=async()=>{
    state.updatedAt=now();state.inbox.forEach(i=>i.userId=ws.session.uid);
    const previous=ws.get('automationState','health-os-medical-actions')?.payload.audit||[];
    await ws.save('automationState',{state,audit:[...previous,{id:crypto.randomUUID(),at:now(),action:path,method}].slice(-500)},'health-os-medical-actions');
  };
  const validateRefs=(refs:any[])=>{for(const ref of refs){
    const valid=ref.kind==='report'?reports.some(r=>r.id===ref.id&&r.status==='reviewed'&&(!ref.resultId||r.results.some(x=>x.id===ref.resultId))):ref.kind==='record'?records.some(r=>r.id===ref.id&&!r.deletedAt):ref.kind==='followup'?state.followups.some(r=>r.id===ref.id):state.checkins.some(r=>r.id===ref.id);
    if(!valid)throw new Error('Linked evidence is no longer available.');
  }};
  if(path==='/medical/reports'){
    if(reports.some((r:any)=>r.extractionJobId&&r.status==='draft')){
      const jobs=await workerJobs();
      for(let i=0;i<reports.length;i++){
        const report=reports[i] as any,metadata=jobs.find(j=>j.id===report.extractionJobId&&j.status==='completed');
        const job=metadata?await workerJob(metadata.id):undefined;
        if(!job||report.status!=='draft'||job.result?.reportRevision!==report.revision)continue;
        reports[i]=await ws.save('medicalReport',{...report,...job.result.report,extractionJobId:undefined,warnings:[...(job.result.report.warnings||[]),'Local extraction is an unverified draft. Confirm every result against the original.']},report.id);
      }
    }
    return json({reports});
  }
  if(path==='/medical/import'){
    const input=z.object({name:z.string().min(1).max(250),mime:z.string().max(100),base64:z.string().max(8100000),collectedAt:z.string().datetime({offset:true}),laboratory:z.string().max(250).default('')}).parse(body);
    const binary=atob(input.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(bytes.length>6000000)return json({error:'Maximum report size is 6 MB.'},413);
    const digest=await hash(bytes),duplicate=reports.find(r=>r.original.sha256===digest);if(duplicate)return json({report:duplicate,duplicate:true});
    const wrapped=new TextEncoder().encode(JSON.stringify({name:input.name,mime:input.mime,base64:input.base64})),storageHash=await hash(wrapped);
    const headers={apikey:ws.session.config.publishableKey,Authorization:`Bearer ${ws.session.accessToken}`};
    const uploaded=await fetch(`${ws.session.config.url}/storage/v1/object/health-os-private/${ws.session.uid}/${storageHash}`,{method:'POST',headers:{...headers,'Content-Type':'application/json','x-upsert':'false'},body:wrapped,signal:AbortSignal.timeout(30000)});
    if(!uploaded.ok&&uploaded.status!==409)throw new Error('Could not preserve your private report original. Nothing was imported.');
    const report:any={id:crypto.randomUUID(),title:input.name,category:'other',collectedAt:input.collectedAt,laboratory:input.laboratory,narrative:'',results:[],status:'draft',createdAt:now(),revision:1,original:{name:input.name,mime:input.mime,sha256:digest,size:bytes.length},originalStorage:{sha256:storageHash},warnings:[]};
    try{
      let text='';
      if(input.mime==='application/pdf'||/\.pdf$/i.test(input.name)){
        const pdfjs=await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        const task=pdfjs.getDocument({data:bytes});const pdf=await task.promise;
        try{for(let i=1;i<=Math.min(pdf.numPages,200)&&text.length<200000;i++){const content=await(await pdf.getPage(i)).getTextContent();text+=content.items.map((r:any)=>r.str||'').join(' ')+'\n';}}finally{await task.destroy();}
      }else if(/^text\//.test(input.mime)||/\.(txt|csv|json)$/i.test(input.name)||input.mime==='application/json')text=new TextDecoder().decode(bytes);
      else report.warnings.push('The original is preserved. Local OCR/DICOM extraction will be queued for your personal worker; results require review.');
      report.narrative=text.slice(0,200000);
      if(text){const parsed=parseReportText(text,input.collectedAt,input.laboratory);Object.assign(report,parsed);}
      report.warnings.push('Extraction is an unverified draft. Confirm the patient and correct every result before marking reviewed.');
    }catch(error){report.warnings.push(`Extraction failed: ${(error as Error).message}. Original preserved; no results inferred.`);}
    let saved=await ws.save('medicalReport',report,report.id);
    if(/^image\//.test(input.mime)||['application/dicom','application/fhir+json','application/json'].includes(input.mime)){
      const job=await submitWorkerJob('medical.extract',{reportId:report.id});
      saved=await ws.save('medicalReport',{...saved,extractionJobId:job.id,warnings:[...saved.warnings,'Extraction queued for your personal worker. Refresh reports after it completes.']},report.id);
    }
    return json({report:saved,duplicate:false});
  }
  const match=path.match(/^\/medical\/reports\/([^/]+)(?:\/(.+))?$/);
  if(match){
    const report=reports.find(r=>r.id===match[1]) as any;if(!report)return json({error:'Report not found.'},404);
    if(method==='DELETE'){await ws.remove('medicalReport',report.id);return json({ok:true,originalRetained:true});}
    const action=match[2];
    if(action==='extract'){
      if(report.status!=='draft')return json({error:'A reviewed report cannot be replaced by extraction.'},409);
      if(report.extractionJobId){const previous=await workerJob(report.extractionJobId).catch(()=>null);if(previous&&['queued','running'].includes(previous.status))return json({jobId:previous.id});}
      const job=await submitWorkerJob('medical.extract',{reportId:report.id});await ws.save('medicalReport',{...report,extractionJobId:job.id},report.id);return json({jobId:job.id});
    }
    if(action==='review'){
      const input=z.object({revision:z.number().int().positive(),report:reportInputSchema,confirmPatient:z.literal(true)}).parse(body);
      if(input.revision!==report.revision)return json({conflict:true,report,error:'Report changed. Reload before reviewing.'},409);
      const {versions:oldVersions=[],...snapshot}=report;
      return json({report:await ws.save('medicalReport',{...report,...input.report,status:'reviewed',reviewedAt:now(),revision:report.revision+1,versions:[...oldVersions,snapshot].slice(-25)},report.id),conflict:false});
    }
    if(action==='original'){
      if(!report.originalStorage?.sha256)return json({error:'The original has not been uploaded to cloud Storage.'},404);
      const response=await fetch(`${ws.session.config.url}/storage/v1/object/authenticated/health-os-private/${ws.session.uid}/${report.originalStorage.sha256}`,{headers:{apikey:ws.session.config.publishableKey,Authorization:`Bearer ${ws.session.accessToken}`},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Could not open your private report original.');return json(await response.json());
    }
    if(action==='history')return json({versions:[...(report.versions||[]),report]});
    if(action==='fhir'){if(report.status!=='reviewed')return json({error:'Review this report before FHIR export.'},409);return json(reportBundle(report,ws.session.uid));}
    if(action==='explain'){
      z.object({consent:z.literal(true)}).parse(body);if(report.status!=='reviewed')return json({error:'Review this report first.'},409);
      const evidence=labTrends(reports).filter(t=>t.points.some(p=>p.reportId===report.id)).map(t=>({test:t.name,unit:t.unit,points:t.points.map(p=>({date:p.collectedAt,value:p.value,low:p.referenceLow,high:p.referenceHigh})),direction:t.direction,comparison:t.flag}));
      return json(await invokeCloud('body-os-ai',{action:'/biology/coach',consent:true,question:'Explain the reviewed structured lab evidence; no diagnosis or treatment.',evidence}));
    }
    if(action==='units')return json(await runWorkerJob('medical.units',{reportId:report.id}));
    if(action==='validate-fhir')return json(await runWorkerJob('medical.fhir',{reportId:report.id}));
    if(action==='cql')return json(await runWorkerJob('medical.cql',{reportId:report.id}));
  }
  if(path==='/medical/rules')return json({rules:CLINICAL_RULES});
  if(path==='/medical/calculate')return json(calculateMedical(body));
  if(path==='/medical/analyze')return json({trends:labTrends(reports),signals:physiologicalSignals(records,body.date),cards:evidenceCards(reports,records,body.date),medications:medicationReview(records)});
  if(path==='/medical/capabilities')return json({storage:'Private Supabase Storage and owner-scoped records',reports:'Browser text/PDF extraction; personal worker OCR, DICOM metadata and structured FHIR import',calculations:'Evidence-labelled deterministic calculations',research:'Personal Python worker with Supabase job queue',voice:'Personal Whisper worker; install the model on each computer'});
  if(path==='/medical/research/status'){const status=await workerStatus();const online=status.workers.find((w:any)=>w.online);return json(online?{available:true,...online.capabilities.research,worker:online.name}:{available:false,reason:'Start your personal worker. Core records remain available.'});}
  if(path==='/medical/research/workbench')return json(await runWorkerJob('research.workbench',researchWorkbenchSchema.parse(body)));
  if(path==='/medical/research/statistics')return json(await runWorkerJob('research.statistics',body));
  if(path==='/medical/research/notebook')return json(await runWorkerJob('research.notebook'));
  if(path==='/medical/cds-services')return json({services:[{hook:'patient-view',id:'health-os-report-review',title:'Health OS report evidence',description:'Owner-scoped reviewed evidence'}]});
  if(path==='/medical/cds-services/health-os-report-review'){
    const input=z.object({hook:z.literal('patient-view'),hookInstance:z.string().uuid(),context:z.object({patientId:z.literal(ws.session.uid)})}).parse(body);
    return json({cards:evidenceCards(reports,records,dateOf(now())).map(c=>({uuid:c.id,summary:c.summary.slice(0,140),detail:c.detail,indicator:'info',source:{label:'Health OS supplied range rule',url:c.source}})),hookInstance:input.hookInstance});
  }
  if(path==='/medical/research-export'){
    const input=z.object({consent:z.literal(true),purpose:z.string().trim().min(3).max(500),domains:z.array(z.enum(['vital','sleep','symptom','illness'])).min(1),participantId:z.string().regex(/^[A-Za-z0-9_-]{8,80}$/)}).parse(body);
    const rows=records.filter(r=>!r.deletedAt&&(input.domains as string[]).includes(r.type)).map(r=>({participantId:input.participantId,type:r.type,date:dateOf(r.timestamp),metric:r.type==='vital'?r.metadata.metric:undefined,value:r.value,unit:r.unit,source:r.source,deviceId:r.deviceId,quality:r.quality,episodeStart:r.type==='illness'?r.metadata.start:undefined,episodeEnd:r.type==='illness'?r.metadata.end:undefined,severity:r.type==='symptom'?r.metadata.severity:undefined,label:r.type==='illness'?'illness':r.type==='symptom'?String(r.metadata.concept||r.name):undefined}));
    return json({schemaVersion:'1.0',consent:{purpose:input.purpose,at:now(),domains:input.domains},rows,limitations:'Pseudonymous export. Dates, devices and sources may identify participants. No narrative or medication data included.'});
  }
  if(path==='/medical/doctor-summary'){
    const date=z.union([z.iso.date(),z.string().datetime({offset:true}).transform(dateOf)]);
    const range=z.object({from:date,to:date}).parse(body);
    if(range.from>range.to)return json({error:'Start date must be on or before end date.'},400);
    const within=(timestamp:string)=>{const date=dateOf(timestamp);return date>=range.from&&date<=range.to;};
    const selected=records.filter(r=>!r.deletedAt&&within(r.timestamp)),reviewed=reports.filter(r=>r.status==='reviewed'&&within(r.collectedAt));
    const medications=records.filter(r=>!r.deletedAt&&dateOf(r.timestamp)<=range.to&&(r.type==='dose'?within(r.timestamp):['medication','supplement'].includes(r.type)&&(!r.metadata.end||String(r.metadata.end)>=range.from)));
    return json({generatedAt:now(),period:range,reports:reviewed,trends:labTrends(reviewed),vitals:selected.filter(r=>r.type==='vital'),symptoms:selected.filter(r=>r.type==='symptom'),illness:selected.filter(r=>r.type==='illness'),medications,notes:selected.filter(r=>r.type==='journal'),medicalActions:{followups:state.followups.filter(f=>!['completed','cancelled'].includes(f.status)),questions:state.questions.filter(q=>!q.answered),inbox:rankedMedicalInbox(state),signals:physiologicalSignals(records.filter(r=>!r.deletedAt),range.to)},limitations:'Recorded observations and reviewed extraction; missing data is unknown. Not a diagnosis.'});
  }
  if(path.startsWith('/medical/actions/')){
    const route=path.slice('/medical/actions/'.length);
    if(route==='snapshot'||route==='rebuild'){reconcileMedicalActions(state,reports,records);await saveState();return json({state,inbox:rankedMedicalInbox(state),timeline:medicalTimeline(reports,records,state)});}
    if(route==='audit')return json({entries:ws.get('automationState','health-os-medical-actions')?.payload.audit||[]});
    if(route==='enrollment'){
      if(method==='DELETE'){const input=z.object({deleteData:z.boolean()}).parse(body);if(input.deleteData){state.enrollment=null;state.checkins=[];state.outcomes=[];}else if(state.enrollment){state.enrollment.active=false;state.enrollment.endedAt=now();}state.inbox.filter(i=>i.type==='research_feeling_check').forEach(i=>i.status='expired');await saveState();return json({ok:true});}
      const input=z.object({consent:z.literal(true),purpose:z.string().trim().min(3).max(500)}).parse(body);
      if(!state.enrollment?.active)state.enrollment={active:true,participantId:state.enrollment?.participantId||crypto.randomUUID(),consentedAt:now(),purpose:input.purpose,fields:researchFields,version:1};await saveState();return json({enrollment:state.enrollment});
    }
    if(route==='research-days'){
      const input=z.object({consent:z.literal(true),from:z.string().date(),to:z.string().date()}).parse(body);
      if(!state.enrollment)return json({error:'Study enrollment is required.'},409);
      const count=Math.floor((Date.parse(input.to)-Date.parse(input.from))/86400000)+1;
      if(count<1||count>366||input.from<dateOf(state.enrollment.consentedAt)||input.to>dateOf(now()))return json({error:'Choose up to 366 days within your enrolled study period.'},400);
      const dates=Array.from({length:count},(_,i)=>dateOf(new Date(Date.parse(input.from)+i*86400000).toISOString()));
      return json({schemaVersion:'prospective-1.0',rows:prospectiveResearchRows(state,records,dates),enrollment:state.enrollment});
    }
    if(route==='outcomes'){
      z.object({confirm:z.literal(true),recordId:z.string().min(1)}).parse(body);if(!state.enrollment?.active)return json({error:'Active study consent is required.'},409);
      const record=records.find(r=>r.id===body.recordId&&r.type==='illness'&&!r.deletedAt);if(!record)return json({error:'Illness source unavailable.'},404);
      const onset=String(record.metadata.start||dateOf(record.timestamp));if(onset>dateOf(now()))return json({error:'Confirm an observed onset, not a future illness.'},400);
      const outcome={recordId:record.id,onset,recovery:record.metadata.end?String(record.metadata.end):undefined,confirmedAt:now(),labelSource:'self_report' as const,labelQuality:'self-reported' as const};state.outcomes=[...(state.outcomes||[]).filter(o=>o.recordId!==record.id),outcome];await saveState();return json({outcome});
    }
    if(route==='followups'){
      const input=followupInputSchema.extend({id:z.string().uuid().optional(),provenance:z.enum(['user','doctor_instruction','report']).default('user')}).parse(body);validateRefs(input.sourceRefs);
      if(input.provenance!=='user'&&!input.notes.trim())return json({error:'Record the instruction and its source.'},400);
      if(input.provenance==='report'&&!input.sourceRefs.some(ref=>ref.kind==='report'&&reports.some(r=>r.id===ref.id&&r.status==='reviewed'&&r.narrative.includes(input.notes))))return json({error:'Quote the explicit instruction from a linked reviewed report.'},400);
      if(input.id&&state.followups.some(item=>item.id===input.id)){const existing=state.followups.find(item=>item.id===input.id)!;if(existing.title!==input.title||existing.dueAt!==input.dueAt||existing.notes!==input.notes)return json({error:'This follow-up was already saved with different details. Open Follow-ups to edit it; your current draft is retained.'},409);return json({followup:existing});}
      const followup={...input,id:input.id||crypto.randomUUID(),createdAt:now(),status:'pending' as const};state.followups.push(followup);await saveState();return json({followup});
    }
    if(route==='questions'){const input=z.object({id:z.string().uuid().optional(),text:z.string().trim().min(1).max(2000),source:z.enum(['user','template']).default('user'),sourceRefs:z.array(evidenceRefSchema).max(300).default([])}).parse(body);validateRefs(input.sourceRefs);if(input.id&&state.questions.some(item=>item.id===input.id)){const existing=state.questions.find(item=>item.id===input.id)!;if(existing.text!==input.text)return json({error:'This question was already saved with different text. Open Doctor Questions to edit it; your current draft is retained.'},409);return json({question:existing});}const question={...input,id:input.id||crypto.randomUUID(),createdAt:now(),answered:false};state.questions.push(question);await saveState();return json({question});}
    if(route==='checkins'){
      if(!state.enrollment?.active)return json({error:'Explicit study enrollment is required.'},409);
      const input=z.object({feeling:z.enum(['Normal','Tired','Unwell']),noIllnessConfirmed:z.boolean().default(false),inboxId:z.string().optional()}).parse(body);
      if(input.feeling==='Unwell'&&input.noIllnessConfirmed)return json({error:'Unwell cannot confirm an illness-free day.'},400);
      const date=dateOf(now()),existing=state.checkins.find(c=>c.date===date),item=state.inbox.find(i=>i.id===input.inboxId&&i.type==='research_feeling_check'&&i.status!=='expired');
      const checkin={id:existing?.id||crypto.randomUUID(),at:now(),date,feeling:input.feeling,noIllnessConfirmed:input.noIllnessConfirmed,source:'user' as const,sourceRefs:item?.sourceRefs||[]};state.checkins=[...state.checkins.filter(c=>c.date!==date),checkin];if(item){item.status='completed';item.resolvedAt=now();}await saveState();return json({checkin,state,symptomDraftAvailable:input.feeling==='Unwell'});
    }
    const item=route.match(/^(followups|questions|inbox)\/(.+)$/);
    if(item){
      const row=(state[item[1] as 'followups'|'questions'|'inbox'] as any[]).find(r=>r.id===item[2]);if(!row)return json({error:'Saved item not found.'},404);
      if(item[1]==='questions')Object.assign(row,z.object({text:z.string().trim().min(1).max(2000),answered:z.boolean()}).parse(body));
      else{
        const input=item[1]==='followups'?z.object({confirm:z.literal(true),status:z.enum(['pending','scheduled','completed','snoozed','cancelled']),dueAt:z.string().datetime({offset:true}).optional(),snoozedUntil:z.string().datetime({offset:true}).optional(),completionSourceRefs:z.array(evidenceRefSchema).max(10).default([])}).parse(body):z.object({status:z.enum(['reviewed','completed','dismissed','snoozed']),snoozedUntil:z.string().datetime({offset:true}).optional()}).parse(body);
        if(input.status==='snoozed'&&(!input.snoozedUntil||input.snoozedUntil<=now()))return json({error:'Choose a future snooze time.'},400);
        if('completionSourceRefs' in input){validateRefs(input.completionSourceRefs);const candidates=matchingRepeatResults(row,reports);if(input.completionSourceRefs.some(ref=>!candidates.some(c=>c.id===ref.id&&c.resultId===ref.resultId)))return json({error:'Completion must use a comparable reviewed repeat result.'},400);}
        Object.assign(row,input,{completedAt:input.status==='completed'?now():undefined,resolvedAt:item[1]==='inbox'&&input.status!=='snoozed'?now():undefined,snoozedUntil:input.status==='snoozed'?input.snoozedUntil:undefined});
      }
      await saveState();return json({item:row,followup:row,question:row});
    }
  }
  return json({error:'This advanced service is not connected to the cloud app. Your records remain saved; no local engine is used.'},501);
}
