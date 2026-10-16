import {expect,type Page} from '@playwright/test';
import type {AgentStep} from '../../src/shared/intelligence/agent-contracts';
export async function mockAgent(page:Page,options:{domains?:string[];toolNames?:string[];answer?:string;action?:AgentStep['proposedActions'][number];actions?:AgentStep['proposedActions'];fail?:boolean}={}){
 const calls:any[]=[],runs=new Map<string,any>();await page.route('**/functions/v1/body-os-ai',async route=>{
  const request=route.request().postDataJSON();
  // Run persistence is a separate owned CAS service, not a model call. Keep the
  // existing model-call assertions intact while supporting the new transport.
  if(request.action==='/ai/run-store'){
   if(request.operation==='delete'){const saved=runs.get(request.runId);if(!saved)return route.fulfill({json:false});if(saved.version!==request.expectedVersion||!['completed','cancelled','failed'].includes(saved.status))return route.fulfill({status:409,json:{error:'Run changed or unfinished'}});runs.delete(request.runId);return route.fulfill({json:true});}
   if(request.operation==='prune')return route.fulfill({json:0});
   if(request.operation==='list')return route.fulfill({json:[...runs.values()]});
   if(request.operation==='get')return route.fulfill({json:runs.get(request.runId)||null});
   const previous=runs.get(request.state.id);if(request.expectedVersion!==null&&previous?.version!==request.expectedVersion)return route.fulfill({status:409,json:{error:'Run version conflict'}});if(request.expectedVersion===null&&previous)return route.fulfill({status:409,json:{error:'Run already exists'}});runs.set(request.state.id,structuredClone(request.state));return route.fulfill({json:request.state});
  }
  calls.push(request);
  if(request.action==='/ai/web-research')return route.fulfill({json:{ok:true,sources:[{title:'Manufacturer source',url:'https://example.com/product',excerpt:'Verified source excerpt.'}]}});
  if(options.fail)return route.fulfill({status:503,json:{error:'AI reasoning is currently unavailable. Provider offline.'}});
  const domains=options.domains||[],toolNames=options.toolNames||[],hasTools=toolNames.every(name=>request.toolResults?.some((r:any)=>r.name===name));
  const verified=request.toolResults?.filter((r:any)=>r.name==='action.verify'&&r.data?.success===true).length||0;
  const nextAction=options.actions?.[verified]||(!options.actions?options.action:undefined);
  const result=request.phase==='route'?{intent:'test_semantic_route',domains,taskType:'plan',complexity:1,requiresReasoning:true,requiresTools:!!toolNames.length,requiresResearch:request.policy.research!=='off',risk:'low'}:{responseType:hasTools?'analysis':'tools',summary:hasTools?(options.answer||'Model-reasoned answer using the selected evidence.'):'',toolCalls:hasTools?[]:toolNames.map(name=>({name,arguments:name==='research.search'?{query:'public manufacturer product page'}:{}})),evidence:hasTools?toolNames.map(name=>'Read '+name):[],proposedActions:hasTools&&nextAction?[nextAction]:[],confidence:'medium',needsEscalation:false};
  return route.fulfill({json:{result,usage:[{requestId:request.requestId,role:request.phase==='route'?'router':'fast_reasoner',model:'deepseek/deepseek-v4-flash-0731',provider:'openrouter',latencyMs:20,tokens:100,estimatedCostUsd:0,paid:true,reason:'Synthetic primary role'}]}});
 });return calls;
}
export async function send(page:Page,question:string,approve=true){await page.getByLabel('Ask Health OS Intelligence').fill(question);await page.getByRole('button',{name:'Send command'}).click();if(approve){await expect(page.getByRole('button',{name:'Reason with approved context'})).toBeDisabled();await page.getByLabel('Allow the AI to read this selected context and conversation').check();await page.getByRole('button',{name:'Reason with approved context'}).click();}}
