import type {BioRecord} from '../biology.js';
import {chatDomains,type ChatDomain} from '../intelligence-chat.js';
import type {ConversationTurn,ContextPolicy} from './agent-contracts.js';
import {ContextPolicyEngine} from './context-policy.js';

/** Local account/project-scoped chat is the source. A bounded summary never becomes permanent memory. */
export class ConversationManager {
 static build(records:BioRecord[],owner:string,chatId:string,p:ContextPolicy){
  const rows=records.filter(r=>r.userId===owner&&String(r.metadata.chatId||'legacy')===chatId).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const turn=(r:BioRecord,content:string):ConversationTurn=>{let domains:ChatDomain[]=[...chatDomains],sourceIds:string[]=[];try{const parsed=JSON.parse(String(r.metadata.contextDomains||'[]'));if(parsed.length)domains=parsed;sourceIds=JSON.parse(String(r.metadata.sourceIds||'[]'));}catch{}return {role:'assistant',content:content.slice(0,4000),domains,sourceIds,personal:r.metadata.context!=='none'};};
  const recent=rows.slice(-6).flatMap(r=>[{role:'user' as const,content:String(r.metadata.question).slice(0,4000),domains:[],sourceIds:[],personal:false},turn(r,String(r.metadata.answer))]);
  const earlier=rows.slice(-20,-6).map(r=>turn(r,'Prior task: '+String(r.metadata.question).slice(0,150)+'; response excerpt: '+String(r.metadata.answer).slice(0,250))).filter(t=>!t.personal||ContextPolicyEngine.permits(p,t.domains,t.sourceIds));
  const summary:ConversationTurn|undefined=earlier.length?{role:'assistant',content:earlier.map(t=>t.content).join('\n').slice(0,4000),domains:[...new Set(earlier.flatMap(t=>t.domains))],sourceIds:[...new Set(earlier.flatMap(t=>t.sourceIds))].slice(0,500),personal:earlier.some(t=>t.personal)}:undefined;
  const latest=rows.at(-1),currentTask=latest?turn(latest,'Current task: '+String(latest.metadata.question)+'\nCurrent selected proposal: '+String(latest.metadata.selectedProposal||'none')):undefined;
  return {conversation:ContextPolicyEngine.conversation(recent,p),conversationSummary:summary,currentTask:currentTask&&(!currentTask.personal||ContextPolicyEngine.permits(p,currentTask.domains,currentTask.sourceIds))?currentTask:undefined};
 }
}
