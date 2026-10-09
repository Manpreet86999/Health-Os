import { useEffect, useLayoutEffect, useRef, useState, type FormHTMLAttributes } from 'react';
import { useDraftState } from '../lib/use-draft';
import { DraftFeedback } from './DraftFeedback';

type Snapshot={id:string;fields:Record<string,string|boolean>};
export function draftRecordId(form:HTMLFormElement){return form.dataset.draftRecordId!;}
/** Call only after the storage API acknowledges the mutation, before refreshing. */
export function completeFormDraft(form:HTMLFormElement){form.dispatchEvent(new Event('health-os-form-saved'));}
export function DraftForm({workflow,onSubmit,children,...props}:FormHTMLAttributes<HTMLFormElement>&{workflow:string}){
  const draft=useDraftState<Snapshot>(workflow,()=>({id:crypto.randomUUID(),fields:{}}));
  const ref=useRef<HTMLFormElement>(null),busy=useRef(false),acknowledged=useRef(false);
  const [result,setResult]=useState('');
  useLayoutEffect(()=>{
    if(!draft.ready||!ref.current)return;
    for(const [name,value] of Object.entries(draft.value.fields)){
      const input=ref.current.elements.namedItem(name);
      if(input instanceof HTMLInputElement&&['checkbox','radio'].includes(input.type))input.checked=Boolean(value);
      else if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement)input.value=String(value);
    }
  // Restore before the ready form can paint or receive input. A passive effect
  // can race the first edit after inert is removed and erase that field.
  },[draft.ready,workflow]);
  useEffect(()=>{
    const form=ref.current;if(!form)return;
    const saved=()=>{acknowledged.current=true;form.reset();draft.setValue({id:crypto.randomUUID(),fields:{}});void draft.clear();setResult('Saved to account');};
    form.addEventListener('health-os-form-saved',saved);return()=>form.removeEventListener('health-os-form-saved',saved);
  },[draft.clear,draft.setValue]);
  const capture=()=>{if(!ref.current)return;const fields:Snapshot['fields']={};for(const input of Array.from(ref.current.elements)){
    if(!(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement)||!input.name||input.disabled)continue;
    if(input instanceof HTMLInputElement&&['password','file','hidden'].includes(input.type))continue;
    fields[input.name]=input instanceof HTMLInputElement&&['checkbox','radio'].includes(input.type)?input.checked:input.value;
  }draft.setValue(previous=>({...previous,fields}));setResult('');};
  return <form {...props} ref={ref} data-draft-record-id={draft.value.id} aria-busy={busy.current||!draft.ready} inert={!draft.ready} onChange={capture} onInput={capture} onSubmit={async event=>{
    event.preventDefault();if(busy.current||!draft.ready)return;busy.current=true;acknowledged.current=false;setResult('Saving…');
    try{await onSubmit?.(event);if(!acknowledged.current)setResult('Couldn’t save. Your entries are retained. Try Save again.');}
    catch{setResult('Couldn’t save. Your entries are retained. Try Save again.');}
    finally{busy.current=false;}
  }}>{children}<DraftFeedback draft={draft}/>{result&&<p role={result.startsWith('Couldn’t')?'alert':'status'}>{result}</p>}</form>;
}
