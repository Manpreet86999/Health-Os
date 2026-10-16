import {z} from 'zod';
import {scopedReasoningSchema,type AgentRequest} from './agent-contracts.js';
import {groundedClaimSchema} from './grounding.js';
import {factReferences} from './fact-references.js';
import {fingerprint} from '../automation-model.js';
import {permittedToolCalls} from './agent-tools.js';

/** Strict provider references resolve to the unchanged canonical claim contract. */
export function referencedReasoning(request:AgentRequest){
 const actual=scopedReasoningSchema(request);
 const references=factReferences(request.toolResults.filter(result=>!['research.search','attachment.search','knowledge.search','medical.search_knowledge'].includes(result.name))).map((reference,index)=>({id:'F'+String(index+1).padStart(3,'0')+'-'+fingerprint(reference),...reference}));
 const classes=actual.shape.claims.unwrap().element.shape.class.options;
 const others=classes.filter(value=>!['record','calculated'].includes(value)) as ['recommendation',...('recommendation'|'missing'|'knowledge'|'inference')[]];
 const successful=request.toolResults.filter(result=>!result.error);
 const sourceIds=[...new Set(successful.flatMap(result=>[...result.sourceIds,...(result.provenance||[]).map(p=>p.sourceId)]))];
 const knowledgeIds=[...new Set<string>(successful.filter(result=>['research.search','attachment.search','knowledge.search','medical.search_knowledge'].includes(result.name)).flatMap(result=>((result.data as any)?.sources||[]).flatMap((source:any)=>[source.id,source.url].filter((id:unknown)=>typeof id==='string'&&id.length>0&&id.length<=200))))];
 const otherOptions=others.filter(value=>value!=='knowledge'||knowledgeIds.length>0).map(value=>{
  const ids=value==='knowledge'?knowledgeIds:sourceIds;
  const source=z.array(ids.length?z.enum(ids as [string,...string[]]):z.never()).min(['knowledge','inference'].includes(value)?1:0).max(30);
  return groundedClaimSchema.omit({fact:true}).safeExtend({class:z.literal(value),sourceIds:source});
 });
 const other=otherOptions.length===1?otherOptions[0]:z.union(otherOptions as [typeof otherOptions[number],typeof otherOptions[number],...typeof otherOptions[number][]]);
 const reference=references.length&&classes.includes('record')?groundedClaimSchema.omit({fact:true}).safeExtend({class:z.enum(['record','calculated']),sourceIds:z.array(z.never()).max(0),factReferenceId:z.enum(references.map(item=>item.id) as [string,...string[]])}):undefined;
 const schema=actual.safeExtend({claims:z.array(reference?z.union([reference,other]):other).max(30).optional(),toolCalls:permittedToolCalls(request.policy,request.attachments.length>0)});
 const byId=new Map(references.map(reference=>[reference.id,reference]));
 const resolve=(input:unknown)=>{
  const parsed=schema.parse(input);
  const claims=parsed.claims?.map(claim=>{
   if(!('factReferenceId' in claim))return claim;
   const found=byId.get(claim.factReferenceId);if(!found)throw new Error('Unknown canonical fact reference.');
   const {factReferenceId,...rest}=claim;
   return {...rest,sourceIds:found.sourceIds,fact:found.fact};
  });
  return actual.parse({...parsed,...(claims?{claims}:{})});
 };
 return {schema,references,resolve};
}
