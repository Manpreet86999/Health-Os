import { z } from 'zod';
import { actionDefinitions, safeError, type ActionId } from '../../shared/mcp-contracts';
import type {executorAnnouncement} from '../../shared/mcp-execution';
const jobSchema=z.object({id:z.string().uuid(),action:z.enum(Object.keys(actionDefinitions) as [ActionId,...ActionId[]]),receiptId:z.string().uuid(),input:z.unknown()}).strict();
export class HostedBridge {
  readonly closed:Promise<void>;
  private finish!:()=>void;
  private waits=new Map<string,{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private chain=Promise.resolve();private ping:ReturnType<typeof setInterval>|undefined;
  constructor(private socket:WebSocket,private execute:(job:z.infer<typeof jobSchema>)=>Promise<unknown>,private onStatus:(data:any)=>void,private onConnection:(connected:boolean)=>void,private executor?:()=>z.input<typeof executorAnnouncement>){
    this.closed=new Promise(r=>this.finish=r);
    socket.onopen=()=>{onConnection(true);socket.send(JSON.stringify({type:'ready',...(executor?{executor:executor()}: {})}));this.ping=setInterval(()=>{if(socket.readyState===1){socket.send('ping');if(executor)socket.send(JSON.stringify({type:'heartbeat',executor:executor()}));}},60000);};
    socket.onmessage=event=>{
      if(event.data==='pong')return;
      try{const data=JSON.parse(event.data);
        if(data.type==='status'){onStatus(data.data);return;}
        if(data.type==='authorized'||data.type==='error'){const wait=this.waits.get(data.id);if(wait){clearTimeout(wait.timer);this.waits.delete(data.id);data.type==='authorized'&&data.success?wait.resolve():wait.reject(new Error('Health OS permission changed.'));}return;}
        if(data.type==='job'){const job=jobSchema.parse(data.job);actionDefinitions[job.action].schema.parse(job.input);this.chain=this.chain.then(()=>this.run(job)).catch(()=>{});}
      }catch{/* Invalid messages never enter the domain registry. */}
    };
    socket.onclose=()=>{if(this.ping)clearInterval(this.ping);for(const w of this.waits.values()){clearTimeout(w.timer);w.reject(new Error('Health OS connection closed.'));}this.waits.clear();onConnection(false);this.finish();};
    socket.onerror=()=>socket.close();
  }
  private async run(job:z.infer<typeof jobSchema>){
    if(this.socket.readyState!==1)return;
    let result;
    try{
      await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{this.waits.delete(job.id);reject(new Error('Authorization timed out.'));},10000);this.waits.set(job.id,{resolve,reject,timer});this.socket.send(JSON.stringify({type:'authorize',id:job.id}));});
      result=await this.execute(job);
    }catch(e){result=safeError(e);}
    if(this.socket.readyState===1){this.socket.send(JSON.stringify({type:'complete',id:job.id,result}));this.updateExecutor();}
  }
  close(){this.socket.close();}
  updateExecutor(){if(this.executor&&this.socket.readyState===1)this.socket.send(JSON.stringify({type:'heartbeat',executor:this.executor()}));}
}
