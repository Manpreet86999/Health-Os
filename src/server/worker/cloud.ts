import { refreshSupabaseSession, type SupabaseAccountSession } from '../../shared/supabase-auth.js';
import { saveWorkerSession } from './credentials.js';
import { validateRecord, type CloudRecord } from '../../shared/cloud.js';

export class WorkerCloud {
  private refreshing?:Promise<void>;
  readonly owner:string;
  constructor(public session:SupabaseAccountSession,private persist=saveWorkerSession){this.owner=session.uid;}
  async request(path:string,init:RequestInit={}){
    if(!this.refreshing)this.refreshing=(async()=>{const next=await refreshSupabaseSession(this.session);if(next.uid!==this.owner)throw new Error('Worker account changed.');if(next!==this.session)this.persist(next);this.session=next;})().finally(()=>{this.refreshing=undefined;});
    await this.refreshing;
    const response=await fetch(`${this.session.config.url}/${path}`,{...init,headers:{apikey:this.session.config.publishableKey,Authorization:`Bearer ${this.session.accessToken}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(`Supabase worker request failed (${response.status}). ${typeof data?.message==='string'?data.message.slice(0,200):''}`);
    return data;
  }
  rpc(name:string,body:unknown){return this.request(`rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body)});}
  async trainingSnapshot():Promise<CloudRecord[]>{
    const records:CloudRecord[]=[];
    for(let offset=0;offset<100000;offset+=500){
      const rows=await this.request(`rest/v1/body_os_records?user_id=eq.${this.owner}&entity_type=in.(session,profile,exercise)&select=*&order=entity_type,record_id&limit=500&offset=${offset}`);
      records.push(...rows.map((r:any)=>validateRecord({id:r.record_id,entityType:r.entity_type,payload:r.payload,updatedAt:r.updated_at,revision:Number(r.revision),deviceId:r.device_id,deletedAt:r.deleted_at||undefined})));
      if(rows.length<500)return records;
    }
    throw new Error('Training history exceeds this worker snapshot limit.');
  }
  async records(table:'body_os_records'|'health_os_biological_records'){
    const rows:any[]=[];
    for(let offset=0;offset<100000;offset+=500){
      const page=await this.request(`rest/v1/${table}?user_id=eq.${this.owner}&select=*&order=${table==='body_os_records'?'entity_type,record_id':'record_id'}&limit=500&offset=${offset}`);
      rows.push(...page);if(page.length<500)return rows;
    }
    throw new Error('Account exceeds the bounded analysis snapshot. Narrow the requested date range.');
  }
}
