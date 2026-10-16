import {searchAttachments} from './attachment-retrieval.js';
import type {Dataset} from '../automation-model.js';
import {filterChatContext,recordChatDomain,type ChatDomain} from '../intelligence-chat.js';
import {contextPolicySchema,agentRequestSchema,type ContextPolicy,type AgentRequest,type ConversationTurn} from './agent-contracts.js';
import {emptySkinState} from '../skin.js';

/** The same policy guards browser reads and the external server payload. Deny by default. */
export class ContextPolicyEngine {
 static normalize(input:ContextPolicy):ContextPolicy {const p=contextPolicySchema.parse(input);return p.mode==='none'?{...p,domains:[],recordIds:[]}:p;}
 static permits(p:ContextPolicy,domains:ChatDomain[],ids:string[]=[]){
  if(p.mode==='none')return false;
  if(!domains.every(d=>p.domains.includes(d)))return false;
  return p.mode!=='records'||(ids.length>0&&ids.every(id=>p.recordIds.includes(id)));
 }
 static dataset(data:Dataset,input:ContextPolicy):Dataset {
  const p=this.normalize(input),result=filterChatContext(data,p.date,p.mode,p.domains,p.recordIds);
  // Records mode must not leak legacy profile/products/tasks. Use selected canonical rows only.
  if(p.mode==='records')return {...result,skin:emptySkinState(),preferences:undefined,activeWorkout:undefined,medicalReports:undefined};
  return result;
 }
 static conversation(turns:ConversationTurn[],p:ContextPolicy){return turns.filter(t=>!t.personal||this.permits(p,t.domains,t.sourceIds)).slice(-12);}
 static external(raw:AgentRequest):AgentRequest {
  const request=agentRequestSchema.parse(raw),policy=this.normalize(request.policy);
  const toolResults=request.toolResults.filter(t=>t.name==='attachment.search'?JSON.stringify(t.data)===JSON.stringify(searchAttachments(request.attachments,String((t.data as any)?.query||'')))&&JSON.stringify(t.sourceIds)===JSON.stringify((t.data as any)?.sources?.map((s:any)=>s.id)):t.error&&t.data===null&&!t.sourceIds.length?true:t.domains.length?this.permits(policy,t.domains,t.sourceIds):t.name==='research.search'&&policy.research!=='off'||t.name==='action.verify'&&policy.mode!=='none'&&(t.data as any)?.success===true&&t.sourceIds.every(id=>id===(t.data as any)?.receiptId));
  if(toolResults.length!==request.toolResults.length)throw new Error('Tool evidence exceeds approved context.');
  const memories=request.memories.filter(m=>policy.mode==='auto'&&this.permits(policy,[m.domain],[m.sourceId]));
  if(memories.length!==request.memories.length)throw new Error('Memory exceeds approved context.');
  const allowedTurn=(t:ConversationTurn|undefined)=>t&&(!t.personal||this.permits(policy,t.domains,t.sourceIds))?t:undefined;
  return {...request,policy,conversation:this.conversation(request.conversation,policy),conversationSummary:allowedTurn(request.conversationSummary),currentTask:allowedTurn(request.currentTask),toolResults,memories};
 }
 static evidence(data:Dataset,p:ContextPolicy){const scoped=this.dataset(data,p);return {mode:p.mode,domains:p.domains,recordCount:scoped.records.length,recordListLimit:500,records:scoped.records.slice(0,500).map(r=>({id:r.id,name:r.name,domain:recordChatDomain(r),date:r.timestamp.slice(0,10)})),careProducts:p.domains.includes('care')&&p.mode!=='none'&&p.mode!=='records'?scoped.skin.products.map(p=>({id:p.id,name:p.name})):[],legacyContext:p.mode==='none'||p.mode==='records'?[]:p.domains};}
}
