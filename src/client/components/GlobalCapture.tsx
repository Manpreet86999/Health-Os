import { useUx } from '../state/UxContext';
import { useAddFood } from './AddFood';
import { useDraftState } from '../lib/use-draft';
import { stableRecordId } from '../../shared/automation-model';
import { dateOf } from '../../shared/biology';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useQuickLog } from './QuickLog';
import { useBiologicalData } from '../lib/use-biological-data';
import { parseCapture, normalizeCaptureDraft, confirmedDose } from '../../shared/automation-rules';
import { useAutomations } from '../state/AutomationContext';
import { post } from '../lib/api';
import { OSIcon, type OSIconName } from './OSIcon';
import type { BioKind } from '../../shared/biology';
import { useVoiceInput } from '../lib/use-voice-input';
import { VoiceInputControl } from './VoiceInputControl';
const AnalysisJobs=lazy(()=>import('./AutomaticReview').then(module=>({default:module.AnalysisJobs})));
const PreparedWorkoutCard=lazy(()=>import('./AutomationCenter').then(module=>({default:module.PreparedWorkoutCard})));

export function GlobalCapture({hideTriggers=false}:{hideTriggers?:boolean}={}){
  const {app,bio,stored}=useBiologicalData(),quick=useQuickLog(),automation=useAutomations(),ux=useUx();
  const addFood=useAddFood();
  const [textTools,setTextTools]=useState(false);
  const textDraft=useDraftState('capture:text','');
  const text=textDraft.value,setText=textDraft.setValue;
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<ReturnType<typeof parseCapture>|null>(null),[mode,setMode]=useState(''),[parent,setParent]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [doseTime,setDoseTime]=useState('09:00');
  const voice=useVoiceInput(value=>{setText(value);setDraft(null);});
  useEffect(()=>{if(!open)voice.cancel();},[open,voice.cancel]);
  useEffect(() => { const show = () => { setMode(''); setOpen(true); }; window.addEventListener('health-os-open-capture', show); return () => window.removeEventListener('health-os-open-capture', show); }, []);
  const voiceCapture=()=>{
    setMode('');setOpen(true);setTextTools(true);setError('');voice.start();
  };
  useEffect(()=>{window.addEventListener('health-os-open-voice-capture',voiceCapture);return()=>window.removeEventListener('health-os-open-voice-capture',voiceCapture);},[voice.start]);
  const [recent,setRecent]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('health-os-recent-captures')||'[]');}catch{return [];}});
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='Space'){e.preventDefault();setOpen(true);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const launch=(label:string,kind:BioKind,defaults:Record<string,string|number|boolean>={})=>{const next=[label,...recent.filter(s=>s!==label)].slice(0,5);setRecent(next);localStorage.setItem('health-os-recent-captures',JSON.stringify(next));setOpen(false);quick.open(kind,undefined,undefined,defaults);};
  const hour=new Date().getHours(),order=app.tracker?['Workout','Water','Note']:hour<11?['Food','Water','Care Observation','Weight']:hour>=18?['Food','Care Observation','Supplement','Medication','Check-in']:['Water','Food','Workout'];
  const captures:{label:string;kind:BioKind;defaults?:Record<string,string|number|boolean>}[]=[{label:'Food',kind:'meal'},{label:'Water',kind:'water'},{label:'Weight',kind:'vital',defaults:{metric:'Weight',unit:app.db?.profile.units||'kg'}},{label:'Workout',kind:'journal'},{label:'Symptom',kind:'symptom'},{label:'Pain',kind:'recoveryNote',defaults:{category:'pain'}},{label:'Supplement',kind:'dose'},{label:'Medication',kind:'dose'},{label:'Body Measurement',kind:'bodyMeasurement'},{label:'Care Observation',kind:'journal',defaults:{domain:'Care',subtype:'careObservation'}},{label:'Note',kind:'journal'},{label:'Check-in',kind:'checkIn'}];
  const ranked=[...captures].sort((a,b)=>{const rank=(s:string)=>ux.preferences.quickLogFavorites.includes(s)?-20+ux.preferences.quickLogFavorites.indexOf(s):order.includes(s)?order.indexOf(s):recent.includes(s)?10+recent.indexOf(s):20;return rank(a.label)-rank(b.label);});
  const chooseCapture=(c:typeof captures[number])=>{if(c.label==='Workout'){setMode('Workout');return;}if(c.kind==='dose'){setMode('dose');setParent('');setDraft(null);return;}launch(c.label,c.kind,c.defaults);};
  const captureAction=(label:string)=>()=>chooseCapture(captures.find(c=>c.label===label)!);
  const logActions:{label:string;icon:OSIconName;run:()=>void}[]=[
    {label:'Food',icon:'Eat',run:captureAction('Food')},{label:'Water',icon:'Water',run:captureAction('Water')},{label:'Workout',icon:'Train',run:captureAction('Workout')},
    {label:'Weight',icon:'Body',run:captureAction('Weight')},{label:'Measurement',icon:'Activity',run:captureAction('Body Measurement')},
    {label:'Vital',icon:'Health',run:()=>launch('Vital','vital')},{label:'Medication',icon:'Supplements',run:captureAction('Medication')},
    {label:'Lab',icon:'Report',run:()=>{setOpen(false);app.setPage('Health','Medical Intelligence');}},
    {label:'Feeling',icon:'Recover',run:captureAction('Check-in')},{label:'Photo',icon:'Camera',run:()=>{setOpen(false);addFood.open({mode:'Photo'});}},
    {label:'Voice',icon:'Voice',run:()=>{setTextTools(true);voice.start();}},
    {label:'Note',icon:'Describe',run:captureAction('Note')},
  ];
  const recentEstimate=Object.values(automation.state.jobs).filter(j=>j.status==='completed'&&j.command?.path==='/api/biology/estimate-meal').at(-1)?.result as {estimate:Record<string,string|number>}|undefined;
  const schedules=stored.filter(r=>['supplement','medication'].includes(r.type));
  const review=()=>{if(!draft)return;if(draft.kind==='dose'){setMode('dose');setParent(String(draft.defaults.parentId||''));return;}launch('Natural language',draft.kind,Object.fromEntries(Object.entries(draft.defaults).filter((entry):entry is [string,string|number|boolean]=>entry[1]!==undefined)));};
  const captureText=<>
        <VoiceInputControl voice={voice}/><p role="status" className="subtle">{textDraft.status}</p>
        <label>Tell Health OS what happened<textarea className="input" aria-label="Natural language capture" placeholder="Speak or type, e.g. Weight today 80.7 kg…" value={text} onChange={e=>{setText(e.target.value);setDraft(null);}}/></label>
        <button className="btn btn-soft" disabled={!text.trim()||voice.active} onClick={()=>{setDraft(parseCapture(text,{db:app.db!,skin:app.skin,records:stored,userId:'local-user'}));setError('');}}>Prepare draft</button>
  </>;
  const captureGrid=<div className="automation-capture-grid">{ranked.map(c=><button className="btn btn-soft" key={c.label} onClick={()=>chooseCapture(c)}>{c.label}</button>)}</div>;
  return <>{!hideTriggers&&<><button type="button" className="os-voice-button" aria-label="Voice capture" title="Voice capture" onClick={voiceCapture}><OSIcon name="Voice" size={22}/></button><button type="button" className="btn btn-hot os-capture-button" aria-label={("Log")} title="Log (Ctrl+Shift+Space)" onClick={()=>{setMode('');setOpen(true);}}> <OSIcon name="Plus" size={18}/><span className="stitch-capture-label">{("Log")}</span></button></>}
    <Modal open={open} title={("Universal Log")} onClose={()=>setOpen(false)} className="flow-modal health-capture-drawer">
      {mode==='Workout'?<Suspense fallback={<p role="status">Loading workout tools…</p>}><PreparedWorkoutCard onClose={()=>setOpen(false)}/></Suspense>:mode==='dose'?<div className="stack"><p>Confirm what you took. Use your prescribed schedule.</p><label>Saved medication or supplement<select className="input" value={parent} onChange={e=>{setParent(e.target.value);const schedule=schedules.find(r=>r.id===e.target.value);setDoseTime(String(schedule?.metadata.times||schedule?.metadata.time||'09:00').split(',')[0].trim());}}><option value="">Choose a schedule</option>{schedules.map(r=><option key={r.id} value={r.id}>{r.name} · {r.metadata.dose||r.metadata.serving||''}</option>)}</select></label><label>Scheduled dose time<input className="input" type="time" value={doseTime} onChange={e=>setDoseTime(e.target.value)}/></label><div className="row">{['Taken','Skipped'].map(status=><button className="btn btn-hot" key={status} disabled={!parent||busy} onClick={()=>{const record=schedules.find(r=>r.id===parent)!;setBusy(true);void bio.save({id:confirmedDose(bio.records,record,dateOf(new Date().toISOString()),doseTime)?.id||stableRecordId('dose',record.id,dateOf(new Date().toISOString()),doseTime),type:'dose',domain:'Health',name:record.name,source:'Health OS explicit capture',metadata:{parentId:record.id,scheduledTime:doseTime,status,doseType:record.type,dose:record.metadata.dose||record.metadata.serving||'',unit:record.metadata.unit||record.unit,notes:draft?.kind==='dose'?String(draft.defaults.notes||''):''}}).then(()=>setOpen(false)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{status}</button>)}</div></div>:<>
        <div className="health-capture-heading"><p className="subtle">Choose what to log.</p><button className="icon-btn" aria-label="Close Quick Capture" onClick={()=>setOpen(false)}>×</button></div>
        {<div className="and-capture-picker web-log-picker" aria-label="Quick log categories">{logActions.map(action=><button key={action.label} onClick={action.run}><OSIcon name={action.icon} size={25}/>{action.label}</button>)}</div>}
        {<details className="and-capture-text" open={textTools} onToggle={event=>setTextTools(event.currentTarget.open)}><summary>Speak or type an entry</summary>{captureText}</details>}
        {<details className="and-capture-text"><summary>More capture options</summary>{captureGrid}</details>}
        {recentEstimate&&<button className="btn btn-soft" onClick={()=>launch('Saved AI draft','meal',{...recentEstimate.estimate,recordQuality:'estimated'})}>Review last meal estimate</button>}
        {draft&&<section className="glass card stack"><strong>{draft.defaults.name||'Review your draft'}</strong><p>{draft.explanation}</p><p className="subtle">{draft.confidence} confidence · {Object.entries(draft.defaults).filter(([k,v])=>!['notes','name','parentId'].includes(k)&&v!=='').map(([k,v])=>`${k}: ${v}`).join(' · ')}</p><button className="btn btn-hot" onClick={review}>Review & confirm</button>{draft.kind==='meal'&&<><label className="row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Send only this description to my configured AI provider for an editable estimate.</label><button className="btn btn-soft" disabled={!consent||busy} onClick={()=>{setBusy(true);void automation.request<{estimate:Record<string,string|number>}>('/api/biology/estimate-meal',{description:text,consent:true}).then(r=>launch('AI meal draft','meal',{...r.estimate,recordQuality:'estimated'})).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Estimate meal draft</button></>}{draft.kind!=='meal'&&draft.confidence==='low'&&<><label className="row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Allow my configured AI provider to interpret only this text into an editable draft.</label><button className="btn btn-soft" disabled={!consent||busy} onClick={()=>{setBusy(true);void automation.request<{draft:ReturnType<typeof parseCapture>}>('/api/biology/parse-capture',{description:text,consent:true}).then(r=>setDraft(normalizeCaptureDraft(r.draft,app.db?.profile.units||'kg'))).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Interpret this text</button></>}</section>}
      </>}<Suspense fallback={null}><AnalysisJobs/></Suspense>{error&&<p role="alert">{error}</p>}<p className="subtle">{automation.ready?'Automation is ready, including offline.':'Loading local automations…'}</p>
    </Modal></>;
}

export function GlobalCaptureTriggers(){return <><button type="button" className="os-voice-button" aria-label="Voice capture" title="Voice capture" onClick={()=>window.dispatchEvent(new Event('health-os-open-voice-capture'))}><OSIcon name="Voice" size={22}/></button><button type="button" className="btn btn-hot os-capture-button" aria-label="Log" title="Log (Ctrl+Shift+Space)" onClick={()=>window.dispatchEvent(new Event('health-os-open-capture'))}><OSIcon name="Plus" size={18}/><span className="stitch-capture-label">Log</span></button></>;}
