import test from 'node:test';
import assert from 'node:assert/strict';
import { bioSchema } from './biology.js';
import { labSchema, type MedicalReport } from './medical.js';
import { cachedMedicalSignals, emptyMedicalActions, followupStatus, matchingRepeatResults, medicalTimeline, prospectiveResearchRows, reconcileMedicalActions, rankedMedicalInbox, type MedicalFollowUp } from './medical-actions.js';
const now='2026-10-02T10:00:00Z';
function report(id='r1',value=11,revision=1):MedicalReport{return {id,title:'Ferritin report',category:'laboratory',status:'reviewed',revision,createdAt:now,reviewedAt:now,collectedAt:'2026-09-01T08:00:00Z',laboratory:'Lab',narrative:'PRIVATE REPORT TEXT',results:[labSchema.parse({id:'ferritin',name:'Ferritin',loinc:'2276-4',value,unit:'ng/mL',referenceLow:20,referenceHigh:250,collectedAt:'2026-09-01T08:00:00Z',laboratory:'Lab',method:'assay',specimen:'serum'})],original:{name:'lab.txt',mime:'text/plain',sha256:id,size:1},warnings:[]};}
function vital(day:number,metric='Resting HR',value=60){const timestamp=new Date(Date.UTC(2026,8,day,8)).toISOString();return bioSchema.parse({id:`${metric}-${day}`,userId:'local-user',type:'vital',domain:'Health',timestamp,createdAt:timestamp,updatedAt:timestamp,revision:1,name:metric,value,unit:metric==='HRV'?'ms':'bpm',deviceId:'watch',source:'watch',quality:'measured',syncState:'saved',metadata:{metric}});}
const history=()=>['Resting HR','HRV'].flatMap(metric=>Array.from({length:32},(_,i)=>vital(i+1,metric,i===31?(metric==='HRV'?20:90):60)));
test('reviewed abnormal evidence yields one alert, replay is idempotent and corrections/deletions expire stale alerts',()=>{
  const state=emptyMedicalActions(),r=report();reconcileMedicalActions(state,[{...r,status:'draft'}],[],now);assert.equal(state.inbox.length,0);
  reconcileMedicalActions(state,[r],[],now,{r1:['source-event']});reconcileMedicalActions(state,[r],[],now);assert.equal(state.inbox.filter(i=>i.type==='abnormal_result').length,1);assert.deepEqual(state.inbox[0].sourceEventIds,['source-event']);
  const abnormal=state.inbox.find(i=>i.type==='abnormal_result')!;abnormal.status='reviewed';reconcileMedicalActions(state,[report('r1',10,2)],[],now);assert.equal(abnormal.status,'pending');assert.match(abnormal.title,/10/);
  reconcileMedicalActions(state,[report('r1',40,3)],[],now);assert.equal(abnormal.status,'expired');reconcileMedicalActions(state,[],[],now);assert.equal(rankedMedicalInbox(state).length,0);
});
test('follow-up due state, snooze and conservative repeat-result matching',()=>{
  const r=report(),f:MedicalFollowUp={id:'fu',title:'Repeat ferritin',type:'repeat_test',createdAt:'2026-09-02T08:00:00Z',dueAt:'2026-10-01T08:00:00Z',status:'pending',provenance:'user',sourceRefs:[{kind:'report',id:r.id,resultId:'ferritin'}],notes:''};
  assert.equal(followupStatus(f,now),'overdue');assert.equal(followupStatus({...f,snoozedUntil:'2026-10-05T08:00:00Z'},now),'snoozed');
  const repeat=report('r2',31);repeat.results[0].collectedAt='2026-09-29T08:00:00Z';
  assert.equal(matchingRepeatResults(f,[r,repeat]).length,1);assert.equal(matchingRepeatResults(f,[r,{...repeat,status:'draft'}]).length,0);
  assert.equal(matchingRepeatResults(f,[r,{...repeat,results:[{...repeat.results[0],method:'different'}]}]).length,0);
  const state=emptyMedicalActions();state.followups.push({...f,snoozedUntil:'2026-10-05T08:00:00Z'});reconcileMedicalActions(state,[r,repeat],[],now);assert.equal(state.inbox.some(i=>i.type==='followup_due'),false);assert.equal(state.followups[0].candidates?.length,1);
  reconcileMedicalActions(state,[],[],now);assert.equal(state.followups[0].sourceInvalid,true);
});
test('timeline orders reports, explicit symptoms, measured readings and calculated evidence distinctly',()=>{
  const state=emptyMedicalActions(),records=history(),symptom={...vital(32),id:'symptom',type:'symptom' as const,name:'Fatigue',quality:'manual' as const,metadata:{concept:'Fatigue',status:'Active'}};
  reconcileMedicalActions(state,[report()],records,now);const rows=medicalTimeline([report()],[...records,symptom],state);
  assert.deepEqual(rows.map(r=>Date.parse(r.at)),rows.map(r=>Date.parse(r.at)).sort((a,b)=>a-b));assert.equal(rows.find(r=>r.id==='symptom')?.category,'SELF-REPORTED');assert.ok(rows.some(r=>r.category==='CALCULATED'));assert.ok(rows.some(r=>r.category==='REPORT-DERIVED'));assert.ok(rows.some(r=>r.category==='MEASURED'));
});
test('study opt-in, feeling prompt cooldown, missing outcome and explicitly confirmed self-report',()=>{
  const state=emptyMedicalActions(),records=history();reconcileMedicalActions(state,[],records,now);assert.equal(state.inbox.some(i=>i.type==='research_feeling_check'),false);
  state.enrollment={active:true,participantId:'participant-example',consentedAt:'2026-09-01T08:00:00Z',purpose:'Local prospective research',fields:[],version:1};
  reconcileMedicalActions(state,[],records,now);const prompt=state.inbox.find(i=>i.type==='research_feeling_check')!;assert.ok(prompt);prompt.status='completed';
  state.checkins.push({id:'check',date:'2026-10-02',at:now,feeling:'Normal',source:'user',noIllnessConfirmed:false,sourceRefs:prompt.sourceRefs});
  reconcileMedicalActions(state,[],records,now);assert.equal(state.inbox.filter(i=>i.type==='research_feeling_check').length,1);assert.equal(state.checkins[0].feeling,'Normal');
  let rows=prospectiveResearchRows(state,records,['2026-10-01']);assert.equal(rows[0].outcomeIllnessWithin3Days,null);
  const illness={...vital(32),id:'illness',type:'illness' as const,name:'Reported episode',metadata:{start:'2026-10-02',notes:'PRIVATE NOTES'}};
  rows=prospectiveResearchRows(state,[...records,illness],['2026-10-01']);assert.equal(rows[0].outcomeIllnessWithin3Days,null);
  state.outcomes=[{recordId:illness.id,onset:'2026-10-02',confirmedAt:now,labelSource:'self_report',labelQuality:'self-reported'}];rows=prospectiveResearchRows(state,[...records,illness],['2026-10-01']);assert.equal(rows[0].outcomeIllnessWithin3Days,1);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));assert.ok(!JSON.stringify(rows).includes('notes'));
});
test('research features exclude today and future; edits rebuild only dependent baseline windows',()=>{
  const state=emptyMedicalActions(),records=history();state.enrollment={active:true,participantId:'participant-example',consentedAt:'2026-09-01T08:00:00Z',purpose:'test',fields:[],version:1};
  const before=cachedMedicalSignals(state,records,'2026-10-02');assert.equal(before.signals[0].windows[2].median,60);assert.equal(before.signals[0].windows[2].samples,28);
  const row=prospectiveResearchRows(state,records,['2026-10-02'])[0];assert.equal(row.rhrDeviation1d,0);assert.equal(row.featureThrough,'2026-10-01');
  const changed=records.map(r=>r.id==='Resting HR-31'?{...r,value:180,revision:2}:r);reconcileMedicalActions(state,[],changed,now);assert.notEqual(cachedMedicalSignals(state,changed,'2026-10-02').signals[0].windows[2].mean,before.signals[0].windows[2].mean);
  assert.equal(cachedMedicalSignals(emptyMedicalActions(),[vital(32)],'2026-10-02').signals[0].robustZ,null);
});
