import {validateCareProposal} from '../care-proposal.js';
import type {SkinState,CareProposal} from '../skin.js';
import {fingerprint} from '../automation-model.js';
export const careFingerprint=(care:SkinState['care'])=>fingerprint({content:care,revisionToken:care.revision,updatedToken:care.updatedAt});
// Storage adds an order index; array sequence is the reviewed semantic order.
export const careContentFingerprint=(care:SkinState['care'])=>fingerprint({...care,tasks:care.tasks.map(({order,...task})=>task)});
/** Conservative proposal guards; clinical compatibility is never inferred from incomplete ingredients. */
export function validateAgentCareProposal(raw:unknown,skin:SkinState,date:string):CareProposal {
 const proposal=validateCareProposal(raw,skin);
 for(const task of proposal.tasks){
  const product=skin.products.find(p=>p.id===task.productId);
  if(product?.expiresAt&&product.expiresAt<date)throw new Error('Expired products cannot be scheduled.');
  if(product&&['treatment','exfoliant','scalp-treatment'].includes(product.category)&&!product.actives.length)throw new Error('Treatment ingredients are unknown. Request a label or authorized product research before scheduling.');
 }
 for(let day=0;day<7;day++)for(const time of ['morning','evening','wash','anytime']){
  const tasks=proposal.tasks.filter(t=>t.time===time&&(!t.days.length||t.days.includes(day))),ids=tasks.map(t=>t.productId).filter(Boolean);
  if(new Set(ids).size!==ids.length)throw new Error('The same product cannot be duplicated in one routine slot.');
  const treatments=ids.map(id=>skin.products.find(p=>p.id===id)!).filter(p=>p&&p.actives.some(a=>/retin|tretinoin|adapalene|benzoyl|salicylic|glycolic|lactic acid|\baha\b|\bbha\b|peel/i.test(a)));
  if(treatments.length>1)throw new Error('Potentially irritating actives share a routine slot. Prepare an alternating or simpler plan for review.');
 }
 return proposal;
}
