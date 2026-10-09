import { TextAreaField } from '../../components/TextAreaField';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import type { CareProposal } from '../../../shared/skin';
import { CareProposalReview } from './CareProposalReview';
import { storedSession } from '../../lib/cloud-session';
import { useDraftFields, useDraftState } from '../../lib/use-draft';
import { DraftFeedback } from '../../components/DraftFeedback';

const chatKey = () => `body-os-care-coach-v2:${storedSession()?.uid || 'signed-out'}`;
import { SkinProducts } from './Products';
type Message = { role: 'user' | 'ai'; content: string; model?: string; error?:boolean; retryQuestion?:string };

export function SkinAi({research=false}:{research?:boolean}) {
  const app = useApp();
  const toast = useToast();
  const composer=useDraftFields('care-coach-composer',{question:'',externalText:''});
  const [question,setQuestion]=composer.field('question'),[externalText,setExternalText]=composer.field('externalText');
  const [busy, setBusy] = useState(false);
  const chatDraft=useDraftState<Message[]>('care-coach-history',[]);
  const chat=chatDraft.value,setChat=chatDraft.setValue;
  const [olderChat,setOlderChat]=useState(()=>{try{return Boolean(localStorage.getItem(chatKey()));}catch{return false;}});
  const [proposal, setProposal] = useState<CareProposal | null>(null);
  const [productProposal, setProductProposal] = useState<{name:string;brand:string;category:typeof app.skin.products[number]['category'];actives:string[];useCase:string;bestFor:string[];sourceUrl:string;sourceExcerpt?:string}|null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({top:scroller.current.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); }, [chat]);
  async function importOlderChat(){
    if(!chatDraft.ready||chat.length||!confirm('Import the older chat into this account and project? Older storage did not identify the project.'))return;
    try{const saved:unknown=JSON.parse(localStorage.getItem(chatKey())||'[]');if(!Array.isArray(saved)||!saved.every(m=>m&&['user','ai'].includes(m.role)&&typeof m.content==='string'))throw new Error('Older chat is not readable.');setChat(saved.slice(-40));if(!await chatDraft.persist())throw new Error('Could not protect the imported chat. Older storage is retained.');setOlderChat(false);}catch(error){toast.push((error as Error).message,'err');}
  }
  async function preview(raw: unknown) {
    try { const value = await app.api.validateCareProposal(raw); setProposal(value); toast.push('Review the proposed care plan below', 'info'); }
    catch (error) { toast.push((error as Error).message, 'err'); }
  }
  async function ask(text = question) {
    const q = text.trim(); if (!q || busy||!composer.ready||!chatDraft.ready) return;
    const history = chat.filter(m=>!m.error).map(m => ({role:m.role,content:m.content}));
    setQuestion(''); setChat(h => [...h,{role:'user',content:q}]); setBusy(true);
    try {
      const result = await app.api.skinCoachAsk(q,history);
      const answer=result.answer?.trim();
      if (!result.ok || !answer) throw new Error(result.error?.trim() || 'The AI provider returned no answer. Please try again.');
      setChat(h => [...h,{role:'ai',content:answer,model:result.model,error:Boolean(result.error),retryQuestion:result.error?q:undefined}]);
      if (result.proposal) await preview(result.proposal);
      if (result.productProposal) setProductProposal(result.productProposal);
    } catch (error) { const message=(error as Error).message?.trim() || 'Care coach could not return an answer. Please try again.';setChat(h=>[...h,{role:'ai',content:message,error:true,retryQuestion:q}]);toast.push(message,'err'); }
    finally { setBusy(false); }
  }
  function handoff() {
    const skin=app.skin;
    const prompt = `You are helping me draft a realistic Health OS Care plan. Do not diagnose. Use only product IDs listed below. Respect my time and step limits. Build AM and PM as separate ordered sequences; use time morning or evening for face product steps and days for weekly variations. Reply with JSON only: {"answer":"explanation","proposal":{"reason":"reason","tasks":[{"label":"action","area":"face|body|hair|scalp","productId":"existing ID or empty","days":[0,1,2,3,4,5,6],"time":"morning|evening|wash|anytime","minutes":2,"notes":"how"}]}}. Empty days means daily. Ask me for missing details instead of inventing facts.\n\nMy message: ${question || '(write your message here)'}\n\nContext: ${JSON.stringify({goals:skin.care.goals,commitment:skin.care.commitment,tasks:skin.care.tasks,products:skin.products.map(p=>({id:p.id,name:p.name,brand:p.brand,status:p.status})),recentObservations:skin.care.checkIns.slice(-10)},null,2)}`;
    void navigator.clipboard.writeText(prompt).then(()=>toast.push('AI brief copied','ok')).catch(()=>{const blob=new Blob([prompt],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='body-os-care-ai-brief.txt';a.click();URL.revokeObjectURL(url);toast.push('AI brief downloaded','ok')});
  }
  async function importResponse() {
    try { const clean=externalText.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''); const parsed=JSON.parse(clean) as {answer?:string;proposal?:unknown}; if(parsed.answer) setChat(h=>[...h,{role:'ai',content:parsed.answer!}]); await preview(parsed.proposal || parsed); }
    catch(error) { toast.push(error instanceof SyntaxError?'Paste the JSON response from your external AI.':(error as Error).message,'err'); }
  }
  async function addProduct() {
    if(!productProposal)return; setBusy(true);
    try {await app.api.saveSkinProduct({...productProposal,usedIn:[],status:'active',openedAt:'',expiresAt:'',notes:'',pros:[],cons:[],researchedAt:new Date().toISOString()});await app.refreshSkin();setProductProposal(null);toast.push('Product added to your shelf','ok');}
    catch(error){toast.push((error as Error).message,'err');}
    finally{setBusy(false);}
  }
  async function apply() {
    if(!proposal)return; setBusy(true);
    try { await app.api.applyCareProposal(proposal); await app.refreshSkin(); setChat(h=>[...h,{role:'ai',content:`Applied care plan: ${proposal.reason}`}]); setProposal(null); toast.push('Plan applied','ok'); }
    catch(error) { toast.push((error as Error).message,'err'); }
    finally { setBusy(false); }
  }
  const hasAi=app.settings?.hasAiApiKey || app.settings?.aiProvider==='ollama';
  if(research)return <SkinProducts researchOnly/>;
  return <div className="fade skin-chat-page care-page"><header className="skin-chat-head"><div><span className="page-eyebrow">Care</span><h1 className="page-title">{research?'Care research':'Care coach'}</h1><p className="page-sub">{research?'Review products, ingredient sources and evidence before adding anything to your shelf.':'Describe your situation. Care can suggest a plan, and you choose whether to apply it.'}</p></div><div className="row"><button className="btn btn-soft btn-sm" onClick={()=>app.setPage('SkinProducts')}>Research product</button><button className="btn btn-soft btn-sm" onClick={()=>setHandoffOpen(v=>!v)}>External AI handoff</button>{!hasAi&&<button className="btn btn-soft btn-sm" onClick={()=>app.setPage('Settings')}>Set up AI</button>}</div></header>
    <DraftFeedback draft={composer}/><DraftFeedback draft={chatDraft}/>{olderChat&&!chat.length&&<button className="btn btn-soft" disabled={!chatDraft.ready} onClick={()=>void importOlderChat()}>Review import of older chat</button>}{handoffOpen&&<section className="card stack"><h2>Use another AI</h2><p className="subtle">The brief includes your goals, commitment, product names and IDs, plan, and recent observations. Review it before sharing.</p><button className="btn btn-soft" onClick={handoff}>Copy my Care brief</button><TextAreaField label="Paste its JSON response" className="input" rows={6} value={externalText} onChange={e=>setExternalText(e.target.value)} placeholder='{"answer":"...","proposal":{"reason":"...","tasks":[...]}}'/><button className="btn btn-hot" onClick={()=>void importResponse()}>Review imported proposal</button></section>}
    {research&&<section className="card stack"><h2>Start with a product or ingredient</h2><p className="subtle">Use your product shelf to search sources and review exact formulas. Suggestions remain drafts until you approve them.</p><button className="btn btn-hot" onClick={()=>app.setPage('SkinProducts')}>Research on my product shelf</button></section>}
    <div className="skin-chat-quick">{['Build a full AM and PM plan using my shelf: AM cleanse, niacinamide serum, then sunscreen; PM cleanse, with exfoliation only if suitable for my dry skin. Count every action and stay within my commitment.','My scalp feels itchy after wash day','I only have five minutes today','What should I watch before changing my plan?'].map(q=><button key={q} className="chip" title={q} aria-label={q} disabled={busy} onClick={()=>void ask(q)}>{q.length>90?'Build an AM & PM plan from my shelf':q}</button>)}</div>
    <div className="skin-chat-thread" ref={scroller}>{chat.length===0&&<div className="skin-chat-empty"><p>Tell me your goals, what you own, what changed, and how much time you have.</p></div>}{chat.map((m,i)=><div className={`skin-bubble ${m.role}`} key={i}><span className="page-eyebrow">{m.role==='user'?'You':m.model||'Coach'}</span><p style={{whiteSpace:'pre-wrap'}} role={m.error?'alert':undefined}>{m.content}</p>{m.error&&m.retryQuestion&&<button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={()=>void ask(m.retryQuestion)}>Try again</button>}</div>)}{busy&&<div className="skin-bubble ai">Working…</div>}</div>
    {productProposal&&<section className="card stack"><h2>Review researched product</h2><strong>{productProposal.brand} {productProposal.name}</strong><p>{productProposal.useCase}</p><p className="subtle">Ingredients found: {productProposal.actives.join(', ')||'Not verified'}</p><p className="subtle">Check the exact variant and regional formula before adding.</p>{productProposal.sourceExcerpt&&<p className="subtle">Source excerpt: {productProposal.sourceExcerpt}</p>}{productProposal.sourceUrl&&<a href={productProposal.sourceUrl} target="_blank" rel="noreferrer">Open source website</a>}<div className="row"><button className="btn btn-hot" disabled={busy} onClick={()=>void addProduct()}>Add to my products</button><button className="btn btn-soft" onClick={()=>setProductProposal(null)}>Dismiss</button></div></section>}
    {proposal && <CareProposalReview proposal={proposal} busy={busy} onApply={() => void apply()} onReject={() => setProposal(null)} />}
    <form className="skin-chat-input" onSubmit={e=>{e.preventDefault();void ask()}}><TextAreaField label="Message Care coach" className="input" rows={2} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Tell me what is happening, which products you use, and what you need help with"/><button className="btn btn-hot" disabled={busy} type="submit">Send</button></form>
  </div>;
}
