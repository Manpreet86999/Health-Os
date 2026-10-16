import test from 'node:test';
import assert from 'node:assert/strict';
import {referencedReasoning} from './intelligence/claim-references.js';
import {agentRequestSchema} from './intelligence/agent-contracts.js';
import {verifyGroundedResponse} from './intelligence/grounding.js';
const request=agentRequestSchema.parse({requestId:'references',phase:'reason',question:'What was my sleep duration?',power:'recover',mode:'ask',policy:{mode:'auto',domains:['sleep'],recordIds:[],date:'2026-10-14',research:'off'},conversation:[],memories:[],attachments:[],toolResults:[{name:'sleep.get_history',domains:['sleep'],sourceIds:['night'],data:{items:[{id:'night',name:'Evening rest',date:'2026-10-12',value:5.75,hours:5.75,unit:'hours'}]}}]});
const answer={responseType:'analysis',summary:'Your sleep was 5.75 hours.',toolCalls:[],evidence:[],proposedActions:[],confidence:'high',needsEscalation:false};
test('a strict model reference resolves exact canonical values and provenance without regenerating them',()=>{
 const wire=referencedReasoning(request),reference=wire.references.find(r=>r.fact.path.at(-1)==='value')!;
 const result=wire.resolve({...answer,claims:[{id:'sleep',class:'record',text:'Recorded duration.',sourceIds:[],confidence:1,factReferenceId:reference.id}]});
 assert.deepEqual(result.claims![0].sourceIds,['night']);assert.deepEqual(result.claims![0].fact,reference.fact);
 assert.equal(verifyGroundedResponse(result.summary,result.claims,request.toolResults).accepted,true);
 assert.ok(!('factReferenceId' in result.claims![0]));
});
test('unknown references, forged source IDs, regenerated values and a reference from another evidence snapshot are rejected',()=>{
 const wire=referencedReasoning(request),reference=wire.references.find(r=>r.fact.path.at(-1)==='value')!;
 const claim={id:'sleep',class:'record',text:'Recorded duration.',sourceIds:[],confidence:1,factReferenceId:reference.id};
 for(const patch of [{factReferenceId:'F999'},{sourceIds:['foreign']},{fact:{value:85}}])assert.throws(()=>wire.resolve({...answer,claims:[{...claim,...patch}]}));
 const noEvidence=referencedReasoning({...request,toolResults:[]});assert.throws(()=>noEvidence.resolve({...answer,claims:[claim]}));
 const changed=structuredClone(request);(changed.toolResults[0].data as any).items[0].value=6;(changed.toolResults[0].data as any).items[0].hours=6;assert.throws(()=>referencedReasoning(changed).resolve({...answer,claims:[claim]}));
 assert.throws(()=>wire.resolve({...answer,claims:[{id:'fake',class:'inference',text:'Possible association.',sourceIds:['invented-state'],confidence:1}]}));
});
test('the provider must select a permitted tool with its actual strict argument contract',()=>{
 const wire=referencedReasoning(request),step={...answer,responseType:'tools',summary:'Read sleep records.',claims:[]};
 assert.ok(wire.schema.safeParse({...step,toolCalls:[{name:'sleep.get_history',arguments:{date:'2026-10-12',days:1}}]}).success);
 for(const call of [{name:'medical.get_reports',arguments:{}},{name:'sleep.get_history',arguments:{sql:'select all'}},{name:'sleep.get_history',arguments:{days:0}}])assert.equal(wire.schema.safeParse({...step,toolCalls:[call]}).success,false);
 const none=referencedReasoning({...request,policy:{...request.policy,mode:'none',domains:[]},toolResults:[]});assert.equal(none.schema.safeParse({...step,toolCalls:[{name:'sleep.get_history',arguments:{}}]}).success,false);
});
test('reference tables retain distinct dated queries, replace stale identical queries and cap aggregate provenance',()=>{
 const first=structuredClone(request.toolResults[0]),second={...structuredClone(first),arguments:{date:'2026-10-13',days:1}};
 first.arguments={date:'2026-10-12',days:1};(second.data as any).items=[{id:'other-night',name:'Sleep',date:'2026-10-13',value:6,hours:6,unit:'hours'}];
 first.sourceIds=['night','other-night'];second.sourceIds=['night','other-night'];
 const wire=referencedReasoning({...request,toolResults:[first,second]});const ref=wire.references.find(r=>r.fact.value===5.75&&r.fact.path.at(-1)==='value')!;
 const decoded=wire.resolve({...answer,claims:[{id:'previous-night',class:'record',text:'Recorded duration.',confidence:1,sourceIds:[],factReferenceId:ref.id}]});assert.equal(verifyGroundedResponse(decoded.summary,decoded.claims,[first,second]).accepted,true);
 const latest=structuredClone(first);(latest.data as any).items[0].value=7;(latest.data as any).items[0].hours=7;
 assert.equal(referencedReasoning({...request,toolResults:[first,latest]}).references.some(r=>r.fact.value===5.75),false);
 const aggregate={name:'goals.get_active',arguments:{},domains:['goals'] as any,sourceIds:Array.from({length:100},(_,i)=>'goal-'+i),data:[]};
 assert.ok(referencedReasoning({...request,policy:{...request.policy,domains:['goals']},toolResults:[aggregate]}).references.every(r=>r.sourceIds.length<=30));
});
