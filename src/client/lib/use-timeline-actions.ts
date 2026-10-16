import {useRef,useState} from 'react';
import {useToast} from '../components/Toast';
export function useTimelineActions(){
 const toast=useToast(),lock=useRef(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const run=async(id:string,work:()=>Promise<void>)=>{if(lock.current)return false;lock.current=true;setBusy(id);setError('');try{await work();return true;}catch(e){const message=(e as Error).message;setError(message);toast.push(message,'err');return false;}finally{lock.current=false;setBusy('');}};
 return {busy,error,run};
}
