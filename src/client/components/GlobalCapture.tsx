import {useEffect,useState} from 'react';
import {useQuickLog} from './QuickLog';
import {useBiologicalData} from '../lib/use-biological-data';
import {Modal} from './Modal';
import {OSIcon,type OSIconName} from './OSIcon';
export function GlobalCapture({hideTriggers=false}:{hideTriggers?:boolean}={}){
 const [open,setOpen]=useState(false),quick=useQuickLog(),{app,selectedDate}=useBiologicalData();
 useEffect(()=>{const show=()=>setOpen(true),key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='Space'){e.preventDefault();show();}};window.addEventListener('health-os-open-capture',show);window.addEventListener('keydown',key);return()=>{window.removeEventListener('health-os-open-capture',show);window.removeEventListener('keydown',key);};},[]);
 const actions=[['Weight',()=>quick.open('vital',undefined,selectedDate,{metric:'Weight',unit:app.db?.profile.units||'kg'})],['Sleep',()=>quick.open('sleep',undefined,selectedDate)],['Recovery',()=>quick.open('checkIn',undefined,selectedDate)],['Nutrition',()=>quick.open('nutritionDay',undefined,selectedDate)],['Water',()=>quick.open('water',undefined,selectedDate)],['Workout',()=>app.setPage(app.tracker?'Tracker':'Dashboard')],['Recovery note',()=>quick.open('recoveryNote',undefined,selectedDate)]] as const;
 const icons:Record<string,OSIconName>={Weight:'Body',Sleep:'Sleep',Recovery:'Recover',Nutrition:'Eat',Water:'Water',Workout:'Train','Recovery note':'Describe'};
 return <>{!hideTriggers&&<GlobalCaptureTriggers/>}<Modal open={open} title="Quick Log" onClose={()=>setOpen(false)}><p className="hos-capture-intro">What would you like to add?</p><div className="hos-log-grid">{actions.map(([label,run])=><button key={label} onClick={()=>{setOpen(false);run();}}><OSIcon name={icons[label]} size={23}/>{label}</button>)}</div></Modal></>;
}
export function GlobalCaptureTriggers(){return <button type="button" className="btn btn-hot os-capture-button" aria-label="Quick Log" onClick={()=>window.dispatchEvent(new Event('health-os-open-capture'))}><OSIcon name="Plus" size={18}/>Quick Log</button>;}
