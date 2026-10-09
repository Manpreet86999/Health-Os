import { useDraftState } from '../lib/use-draft';
import { SaveStatus } from './SaveStatus';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useBiologicalData } from '../lib/use-biological-data';
import { useQuickLog } from './QuickLog';
import { Modal } from './Modal';
import { BarcodeScanner } from './BarcodeScanner';
import { RecipeBuilder } from './RecipeBuilder';
import { HealthOsImage } from './HealthOsImage';
import { OSIcon, type OSIconName } from './OSIcon';
import { StatePanel } from './DesignSystem';
import { recordVisual } from '../lib/visual-assets';
import { compressVisualPhoto } from '../lib/local-visuals';
import { get, post } from '../lib/api';
import { dateOf, num, type BioRecord } from '../../shared/biology';
import { atTime } from '../../shared/biological-intelligence';
import { useVoiceInput } from '../lib/use-voice-input';
import { VoiceInputControl } from './VoiceInputControl';

type Mode='Search'|'Photo'|'Barcode'|'Label'|'Quick Add'|'Saved'|'Recipes'|'Describe';
type Request={meal?:string;date?:string;mode?:Mode};
const FoodContext=createContext<{open:(request?:Request)=>void}>({open:()=>{}});
export const useAddFood=()=>useContext(FoodContext);
export function AddFoodProvider({children}:{children:ReactNode}) {
  const [request,setRequest]=useState<Request|null>(null),[recipe,setRecipe]=useState(false);
  return <FoodContext.Provider value={{open:(r={})=>setRequest(r)}}>{children}{request&&<AddFoodSheet request={request} close={()=>setRequest(null)} buildRecipe={()=>{setRequest(null);setRecipe(true);}}/>}{recipe&&<RecipeBuilder close={()=>setRecipe(false)}/>}</FoodContext.Provider>;
}
const modes:{label:Mode;icon:OSIconName}[]=[{label:'Photo',icon:'Camera'},{label:'Barcode',icon:'Barcode'},{label:'Label',icon:'Report'},{label:'Quick Add',icon:'Plus'},{label:'Saved',icon:'Routine'},{label:'Recipes',icon:'Eat'}];
export function FoodActionGrid({select,active}:{select:(mode:Mode)=>void;active?:Mode}) {return <div className="food-action-grid" aria-label="Food input modes">{modes.map(m=><button type="button" key={m.label} aria-pressed={active===m.label} onClick={()=>select(m.label)}><OSIcon name={m.icon} size={24}/><span>{m.label.toUpperCase()}</span></button>)}</div>;}
interface CatalogFood {code:string;name:string;brand:string;image?:string;nutrition:Record<string,number>;source:string;url:string;allergens:string;}
const fmt=(v:number|null|undefined)=>v==null?'—':Math.round(v).toLocaleString();
function AddFoodSheet({request,close,buildRecipe}:{request:Request;close:()=>void;buildRecipe:()=>void}) {
  const {stored,app}=useBiologicalData(),quick=useQuickLog(),now=new Date();
  const [mode,setMode]=useState<Mode>(request.mode||'Search'),[meal,setMeal]=useState(request.meal||(['Breakfast','Lunch','Dinner'][now.getHours()<11?0:now.getHours()<16?1:2])),[date,setDate]=useState(request.date||dateOf(now.toISOString())),[time,setTime]=useState(now.toTimeString().slice(0,5));
  const [query,setQuery]=useState(''),[results,setResults]=useState<CatalogFood[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[scan,setScan]=useState(false),[photo,setPhoto]=useState(''),[consent,setConsent]=useState(false),[retain,setRetain]=useState(false);
  const textDraft=useDraftState('food:description:'+date,''); const description=textDraft.value,setDescription=textDraft.setValue;
  const [estimate,setEstimate]=useState<{name:string;calories:number;protein:number;carbs:number;fat:number;fibre:number;notes:string}|null>(null);
  const voice=useVoiceInput(value=>{setDescription(value);setEstimate(null);});
  const saved=stored.filter(r=>r.type==='food'||r.type==='recipe'),recent=stored.filter(r=>r.type==='meal').sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).filter((r,i,a)=>a.findIndex(x=>x.name===r.name)===i).slice(0,6);
  const select=(next:Mode)=>{voice.cancel();setMode(next);setStatus('');setEstimate(null);setConsent(false);setPhoto('');setRetain(false);};
  const log=(record?:BioRecord,estimated=false)=>{
    const initial=record?{...record,id:'',type:'meal' as const,timestamp:atTime(date,time),metadata:{...record.metadata,meal}}:undefined;
    close();quick.open('meal',initial,date,{meal,eatenTime:time,...(record?.id?{__photoSource:record.id}:{}),...(estimated&&retain&&photo?{__localPhoto:photo}:{})});
  };
  const catalogRecord=(f:CatalogFood):BioRecord=>({id:'',userId:'local-user',domain:'Eat',name:f.name,type:'food',source:f.source,quality:'imported',timestamp:now.toISOString(),unit:'g',value:100,deviceId:'',createdAt:now.toISOString(),updatedAt:now.toISOString(),revision:1,syncState:'pending',metadata:{...f.nutrition,brand:f.brand,barcode:f.code,allergens:f.allergens,...(f.image?{image:f.image}:{})}});
  const search=async(value=query,barcode=mode==='Barcode')=>{setBusy(true);setStatus('');try{if(value.trim().length<2)throw new Error('Enter a food name or barcode.');const result=await get<{foods:CatalogFood[];stale:boolean}>(`/api/biology/foods?q=${encodeURIComponent(value.trim())}&barcode=${barcode}`);setResults(result.foods);setStatus(result.stale?'Saved catalogue results · offline':result.foods.length?`${result.foods.length} catalogue results`:'No catalogue matches. Try a saved food or Quick Add.');}catch(error){setStatus((error as Error).message);}finally{setBusy(false);}};
  const estimateMeal=async()=>{setBusy(true);setStatus('');try{const result=await post<{estimate:NonNullable<typeof estimate>}>('/api/biology/estimate-meal',{description:mode==='Label'?`Read this nutrition label and create an editable draft for review. ${description}`:description,photo,consent});setEstimate(result.estimate);}catch(error){setStatus((error as Error).message);}finally{setBusy(false);}};
  const recentCard=(r:BioRecord)=><article className="recent-food-card" key={r.id}><HealthOsImage context={recordVisual(r)} alt={r.name}/><div><h3>{r.name}</h3><p>{fmt(num(r,'calories'))} kcal · {r.type==='meal'?`${dateOf(r.timestamp)} · ${r.metadata.meal||'Meal'}`:r.type==='recipe'?`${r.metadata.servings||1} servings · ${r.metadata.minutes||'—'} min`:`${r.source} · ${r.metadata.serving||100} g`}</p><div className="row"><button className="btn btn-soft btn-sm" onClick={()=>log(r)}>{r.type==='meal'?'Log again':'Review & log'}</button><button className="btn btn-soft btn-sm" onClick={()=>{close();r.type==='recipe'?app.setPage('Eat','Recipes'):quick.open(r.type==='meal'?'meal':'food',r,date);}}>Edit</button></div></div></article>;
  return <Modal open title={`Add to ${meal}`} onClose={close} className="add-food-sheet"><div className="stack">
    <SaveStatus status="idle" detail={textDraft.status}/><div className="add-food-search"><input className="input" aria-label="Search foods, recipes, brands" placeholder="Search foods, recipes, brands" value={query} onChange={e=>{setQuery(e.target.value);if(!['Search','Saved','Recipes','Barcode'].includes(mode))setMode('Search');}} onKeyDown={e=>{if(e.key==='Enter')void search();}}/><button className="btn btn-hot" disabled={busy} onClick={()=>void search()}>{busy?'Searching…':'Search'}</button></div>
    <FoodActionGrid select={select} active={mode}/>
    <div className="add-food-context"><label className="form-field">Meal<select className="input" aria-label="Meal" value={meal} onChange={e=>setMeal(e.target.value)}>{['Breakfast','Lunch','Snacks','Dinner'].map(s=><option key={s}>{s}</option>)}</select></label><label className="form-field">Time eaten<input className="input" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label className="form-field">Date<input className="input" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label></div>
    {mode==='Barcode'&&<div className="row wrap"><button className="btn btn-hot" onClick={()=>setScan(true)}>Open camera scanner</button><span className="subtle">Or enter the barcode in search.</span></div>}
    {['Photo','Label','Describe'].includes(mode)?<div className="stack">
      {['Photo','Label'].includes(mode)&&<label className="meal-photo-drop">{photo?<img src={photo} alt={mode==='Label'?'Selected nutrition label':'Selected meal'}/>:<><OSIcon name="Camera" size={30}/><strong>{mode==='Label'?'Add a nutrition label':'Add a meal photo'}</strong><small>Camera or photo library</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{setPhoto(await compressVisualPhoto(file));setEstimate(null);setStatus('');}catch(error){setStatus((error as Error).message);}}}/></label>}
      <VoiceInputControl voice={voice} title="Speak your meal" startLabel="Dictate meal description" stopLabel="Stop meal dictation"/>
      <label className="form-field">Describe what you ate<textarea className="input" placeholder="e.g. Two rotis, dal and a cup of curd" value={description} onChange={e=>{setDescription(e.target.value);setEstimate(null);}}/></label>
      <label className="flow-toggle"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Use my configured AI provider for this description{photo?' and photo':''}.</label>
      {mode==='Photo'&&photo&&<label className="flow-toggle"><input type="checkbox" checked={retain} onChange={e=>setRetain(e.target.checked)}/>Keep a private thumbnail in this browser after I confirm the meal. Excluded from sync and backups.</label>}
      <button className="btn btn-hot" disabled={busy||voice.active||!consent||(!description&&!photo)} onClick={()=>void estimateMeal()}>{busy?'Preparing draft…':'Estimate for review'}</button>
      {estimate&&<article className="glass card stack"><h3>{estimate.name}</h3><p>{estimate.calories} kcal · {estimate.protein} g protein · Editable estimate</p><details><summary>Draft notes</summary><p>{estimate.notes}</p></details><button className="btn btn-hot" onClick={()=>log({...catalogRecord({code:'',name:estimate.name,brand:'',nutrition:{},source:'AI meal estimate',url:'',allergens:''}),quality:'estimated',metadata:{...estimate}},true)}>Review & edit</button></article>}
    </div>:mode==='Quick Add'?<div className="glass card stack"><h3>Add the numbers you know</h3><button className="btn btn-hot" onClick={()=>log()}>＋ Add meal</button></div>:<>
      {mode==='Recipes'&&<button className="btn btn-soft" onClick={buildRecipe}>Build recipe</button>}
      {(mode==='Search'||mode==='Barcode')&&results.length>0&&<div className="add-food-recents">{results.map(f=><article className="recent-food-card" key={f.code}><HealthOsImage context={{entityType:'food',name:f.name,remoteImage:f.image}}/><div><h3>{f.name}</h3><p>{f.brand||f.source} · {fmt(f.nutrition.calories)} kcal / 100 g</p><button className="btn btn-soft btn-sm" onClick={()=>log(catalogRecord(f))}>Review & log</button></div></article>)}</div>}
      {mode==='Search'&&!query&&<button className="flow-text-button" onClick={()=>select('Describe')}><OSIcon name="Describe" size={17}/> Describe what you ate</button>}
      {!query&&mode==='Search'&&<><h3>Recent meals</h3>{recent.length?<div className="add-food-recents">{recent.map(recentCard)}</div>:<StatePanel title="Your next meal starts here" body="Search, take a photo or add the numbers you know."/>}</>}
      <h3>{mode==='Recipes'?'Your recipes':mode==='Saved'?'Saved foods & meals':'Recent foods'}</h3><div className="add-food-recents">{(mode==='Saved'?[...saved,...recent]:saved).filter(r=>(mode!=='Recipes'||r.type==='recipe')&&`${r.name} ${r.metadata.brand||''}`.toLowerCase().includes(query.toLowerCase())).slice(0,12).map(recentCard)}</div>
      {mode==='Recipes'&&!saved.some(r=>r.type==='recipe')&&<StatePanel title="No recipes yet" body="Build a recipe from your saved ingredients."/>}
    </>}
    {status&&<p role="status">{status}</p>}
    <p className="subtle">Review nutrition and portions before saving.</p>
    <BarcodeScanner open={scan} onClose={()=>setScan(false)} onRead={code=>{setScan(false);setQuery(code);void search(code,true);}}/>
  </div></Modal>;
}
