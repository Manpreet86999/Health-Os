import { queueRecordSearch } from '../lib/search-handoff';
import { useEffect, useMemo, useRef, useState } from 'react';
import { viewManifest } from '../lib/os-navigation';
import { matchesSearch } from '../../shared/terminology';
import { useBiologicalData } from '../lib/use-biological-data';
import { useQuickLog } from './QuickLog';
import { useAddFood } from './AddFood';
import { Modal } from './Modal';

/** Suggestions contain public destinations only. Private history requires explicit search. */
export function CommandCenter() {
  const {app}=useBiologicalData(),quick=useQuickLog(),food=useAddFood();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
  useEffect(()=>{const show=()=>{setQuery('');setOpen(true);};window.addEventListener('health-os-open-command',show);return()=>window.removeEventListener('health-os-open-command',show);},[]);
  useEffect(()=>{if(open)input.current?.focus();},[open]);
  const choices=useMemo(()=>{
    const water=/^(?:log|add)\s+(\d+(?:\.\d+)?)\s*(ml|l)\s+(?:of\s+)?water$/i.exec(query.trim());
    const amount=water?Number(water[1])*(water[2].toLowerCase()==='l'?1000:1):null;
    const actions=[
      ...(amount!==null&&amount>=1&&amount<=20000?[{id:'water-value',label:`Review ${amount} ml water`,group:'Log',run:()=>quick.open('water',undefined,undefined,{value:amount,unit:'ml'})}]:[]),
      {id:'workout',label:app.tracker?'Resume workout':'Start workout',group:'Train',run:()=>app.setPage(app.tracker?'Tracker':'Dashboard')},
      {id:'food',label:'Log food',group:'Eat',run:()=>food.open()},
      {id:'water',label:'Log water',group:'Log',run:()=>quick.open('water')},
      {id:'capture',label:'Universal Log',group:'Log',run:()=>window.dispatchEvent(new Event('health-os-open-capture'))},
      {id:'weekly',label:'Export weekly report',group:'Reports',run:()=>app.setPage('Reports')},
      ...viewManifest.map(view=>({id:view.identity,label:view.label,group:view.section,search:`${view.primary} ${view.panel}`,run:()=>app.setPage(view.page,view.panel)})),
    ];
    return actions.filter(choice=>choice.id==='water-value'||matchesSearch(query,`${choice.label} ${choice.group} ${'search' in choice?choice.search:''}`)).slice(0,24);
  },[query,app.tracker,app.setPage,quick,food]);
  const run=(action:()=>void)=>{setOpen(false);requestAnimationFrame(action);};
  return <Modal open={open} title="Health OS command center" onClose={()=>setOpen(false)} className="web-command-center">
    <label className="form-field">Search or act<input ref={input} className="input" placeholder="Start workout, log 500 ml water, sleep history…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();list.current?.querySelector<HTMLButtonElement>('button')?.focus();}if(event.key==='Enter'&&choices.length){event.preventDefault();run(choices[0].run);}}}/></label>
    <p className="subtle">↑ ↓ to browse · Enter to open · Esc to close</p>
    <div ref={list} className="web-command-results" aria-label="Commands" onKeyDown={event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;const buttons=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button')||[]);if(!buttons.length)return;event.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}>
      {choices.map(choice=><button key={choice.id} onClick={()=>run(choice.run)}><strong>{choice.label}</strong><span>{choice.group}</span></button>)}
      {!choices.length&&<p role="status">No matching commands. Search your records below.</p>}
    </div>
    <button className="btn btn-soft" onClick={()=>run(()=>{queueRecordSearch(query);app.setPage('Search');})}>Search private records, foods & exercises</button>
  </Modal>;
}
