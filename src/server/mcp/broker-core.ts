export interface BrokerDatabase { exec(sql:string):unknown; prepare(sql:string):{get(...args:any[]):any; all(...args:any[]):any[]; run(...args:any[]):unknown}; close():void; }
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { actionDefinitions, isRetainedMcpAction, scopes, McpDomainError, responseSchema, safeError, type ActionId, type Risk } from '../../shared/mcp-contracts.js';
import { z } from 'zod';
import {reversibleMcpActions} from '../../shared/mcp-expanded-contracts.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const clientInput=z.object({name:z.string().min(1).max(80),scopes:z.array(z.enum(scopes)).max(scopes.length),writeEnabled:z.boolean().default(false)}).strict();
export type Principal={userId:string;clientId:string;scopes:string[];writeEnabled:boolean};
export type BrokerJob={id:string;action:ActionId;input:unknown;receiptId:string;executor:string;recovering?:boolean};
export class BrokerCore {
  readonly db:BrokerDatabase;
  private waits=new Map<string,{resolve:(value:any)=>void;timer:ReturnType<typeof setTimeout>}>();
  private rates=new Map<string,{count:number;until:number}>();
  constructor(database:BrokerDatabase,private policy={enabled:true,writeEnabled:true}){
    this.db=database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS controls(user_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,write_enabled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,scopes TEXT NOT NULL,write_enabled INTEGER NOT NULL,enabled INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,client_id TEXT NOT NULL,action TEXT NOT NULL,input TEXT NOT NULL,receipt_id TEXT NOT NULL,input_hash TEXT NOT NULL,key TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,result TEXT,UNIQUE(user_id,client_id,action,key));
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,client_id TEXT NOT NULL,action TEXT NOT NULL,risk TEXT NOT NULL,status TEXT NOT NULL,request_id TEXT,at INTEGER NOT NULL);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS leases(request_id TEXT PRIMARY KEY,until INTEGER NOT NULL);');
    const columns=this.db.prepare('PRAGMA table_info(requests)').all().map(r=>r.name);
    if(!columns.includes('executor'))this.db.exec("ALTER TABLE requests ADD COLUMN executor TEXT NOT NULL DEFAULT 'web'");
    if(!columns.includes('ever_started'))this.db.exec('ALTER TABLE requests ADD COLUMN ever_started INTEGER NOT NULL DEFAULT 0');
    this.db.prepare("UPDATE requests SET ever_started=1 WHERE status IN ('running','executed')").run();
    this.db.exec('CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS execution_audit(request_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,client_id TEXT NOT NULL,action TEXT NOT NULL,executor TEXT NOT NULL,risk TEXT NOT NULL,status TEXT NOT NULL,receipt_id TEXT NOT NULL,approval_state TEXT NOT NULL,started_at INTEGER NOT NULL,latency_ms INTEGER)');
    // An in-flight domain write may have committed before shutdown. Its deterministic receipt must be checked on retry.
    this.db.prepare("UPDATE requests SET status='queued' WHERE status='running'").run();
  }
  controls(userId:string){return this.db.prepare('SELECT enabled,write_enabled FROM controls WHERE user_id=?').get(userId) as {enabled:number;write_enabled:number}|undefined;}
  setControls(userId:string,enabled:boolean,writeEnabled:boolean){
    this.db.prepare('INSERT INTO controls VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,write_enabled=excluded.write_enabled').run(userId,+enabled,+writeEnabled);
    this.record(userId,'owner','admin.controls','R3',enabled?'enabled':'disabled');
  }
  register(userId:string,raw:unknown){const input=clientInput.parse(raw),token=randomBytes(32).toString('base64url'),id=randomUUID(),expiresAt=Date.now()+8*3600000;
    const denied=['admin.mcp','medical.write'];if(input.scopes.some(s=>denied.includes(s)))throw new McpDomainError('PERMISSION_DENIED','Administration and medical writes cannot be granted to external clients.');
    this.db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?,1,?)').run(id,userId,input.name,hash(token),JSON.stringify(input.scopes),+input.writeEnabled,expiresAt);
    this.record(userId,id,'admin.pair','R1','paired');return {id,token,expiresAt};
  }
  authenticate(token:string):Principal{
    if(!this.policy.enabled)throw new McpDomainError('PERMISSION_DENIED','MCP is disabled by server policy.');
    const c=this.db.prepare('SELECT * FROM clients WHERE token_hash=? AND enabled=1 AND expires_at>?').get(hash(token),Date.now()) as any;
    if(!c)throw new McpDomainError('AUTH_REQUIRED','Pair this client in Health OS Settings.');
    if(!this.controls(c.user_id)?.enabled)throw new McpDomainError('PERMISSION_DENIED','MCP access is disabled.');
    return {userId:c.user_id,clientId:c.id,scopes:JSON.parse(c.scopes),writeEnabled:!!c.write_enabled};
  }
  revalidate(principal:Principal,id:ActionId){
    if(!this.policy.enabled)throw new McpDomainError('PERMISSION_DENIED','MCP is disabled by server policy.');
    const client=this.db.prepare('SELECT * FROM clients WHERE id=? AND user_id=? AND enabled=1 AND expires_at>?').get(principal.clientId,principal.userId,Date.now()) as any;
    const controls=this.controls(principal.userId),def=actionDefinitions[id];
    if(!client||!controls?.enabled)throw new McpDomainError('PERMISSION_DENIED','MCP is disabled or this client was revoked.');
    if(!(JSON.parse(client.scopes) as string[]).includes(def.scope))throw new McpDomainError('SCOPE_REQUIRED',`Required scope: ${def.scope}.`);
    if(def.risk!=='R0'&&(!this.policy.writeEnabled||!client.write_enabled||!controls.write_enabled))throw new McpDomainError('PERMISSION_DENIED','Write access is disabled.');
  }
  requiresConfirmation(risk:Risk){return risk==='R2'||risk==='R3';}
  record(user:string,client:string,action:string,risk:string,status:string,request?:string){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),user,client,action,risk,status,request||null,Date.now());}
  revoke(user:string,id:string){this.db.prepare('UPDATE clients SET enabled=0 WHERE id=? AND user_id=?').run(id,user);this.record(user,id,'admin.revoke','R3','revoked');}
  status(user:string){return {controls:this.controls(user)||{enabled:0,write_enabled:0},clients:this.db.prepare('SELECT id,name,scopes,write_enabled,enabled,expires_at FROM clients WHERE user_id=?').all(user),pending:this.db.prepare("SELECT id,action,client_id,input,expires_at FROM requests WHERE user_id=? AND status='pending' AND expires_at>?").all(user,Date.now()),audit:this.db.prepare('SELECT client_id,action,risk,status,at FROM audit WHERE user_id=? ORDER BY at DESC LIMIT 40').all(user)};}
  approve(user:string,id:string,approved:boolean){const row=this.db.prepare("SELECT * FROM requests WHERE id=? AND user_id=? AND status='pending'").get(id,user) as any;
    if(!row)throw new McpDomainError('NOT_FOUND','Pending action is unavailable.');
    if(row.expires_at<Date.now())throw new McpDomainError('PENDING_ACTION_EXPIRED','Create a fresh proposal.');
    this.revalidate({userId:user,clientId:row.client_id,scopes:[],writeEnabled:false},row.action);
    this.db.prepare('UPDATE requests SET status=? WHERE id=?').run(approved?'queued':'rejected',id);
    this.record(user,row.client_id,row.action,actionDefinitions[row.action as ActionId].risk,approved?'confirmed':'rejected',id);
  }
  async call(p:Principal,id:ActionId,raw:unknown,run?:(job:BrokerJob)=>Promise<unknown|undefined>,executor='web',unavailable?:()=>unknown|undefined){
    this.db.prepare("UPDATE requests SET input='{}' WHERE expires_at<? AND status<>'running'").run(Date.now());
    if(!Object.hasOwn(actionDefinitions,id)||!isRetainedMcpAction(id))throw new McpDomainError('NOT_FOUND','Unknown action.');
    if(!p.scopes.includes(actionDefinitions[id].scope))throw new McpDomainError('SCOPE_REQUIRED',`Required scope: ${actionDefinitions[id].scope}.`);
    this.revalidate(p,id);
    const parsed=actionDefinitions[id].schema.safeParse(raw);if(!parsed.success)throw new McpDomainError('INVALID_INPUT','Parameters do not match the strict tool schema.');
    const input=parsed.data as any,write=actionDefinitions[id].risk!=='R0';
    if(id==='health.undo_action'){
      const original=this.db.prepare("SELECT action FROM requests WHERE receipt_id=? AND user_id=? AND client_id=? AND status='executed'").get(input.receiptId,p.userId,p.clientId) as any;
      if(!original||!(reversibleMcpActions as readonly string[]).includes(original.action))throw new McpDomainError('PERMISSION_DENIED','Undo must reference this client’s reversible action.');
      if(!p.scopes.includes(actionDefinitions[original.action as ActionId].scope))throw new McpDomainError('SCOPE_REQUIRED','Undo requires the original write scope.');
      this.revalidate(p,original.action);
    }
    const bucket=`${p.userId}:${p.clientId}:${id}`,now=Date.now(),rate=this.rates.get(bucket);
    this.db.prepare('DELETE FROM rate_limits WHERE until<?').run(now);
    for(const [limitKey,limit] of [[bucket,write?20:120],[p.userId+':'+p.clientId+':'+(write?'writes':'reads'),write?30:240],[p.userId+':'+(write?'writes':'reads'),write?60:600]] as const){this.db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(limitKey,now+60000);if(this.db.prepare('SELECT count FROM rate_limits WHERE bucket=?').get(limitKey).count>limit)throw new McpDomainError('RATE_LIMITED','Too many requests. Wait one minute.',true);}
    const encoded=JSON.stringify(input),digest=hash(JSON.stringify({...input,idempotencyKey:undefined})),key=write?input.idempotencyKey:null;
    let row=write?this.db.prepare('SELECT * FROM requests WHERE user_id=? AND client_id=? AND action=? AND key=?').get(p.userId,p.clientId,id,key) as any:null;
    if(row&&row.input_hash!==digest)throw new McpDomainError('CONFLICT','This key was already used for different parameters.');
    if(row?.result){const previous=JSON.parse(row.result);if(previous.error?.retryable||previous.error?.code==='INTERNAL_ERROR'){this.db.prepare("UPDATE requests SET status='queued',result=NULL WHERE id=?").run(row.id);row.status='queued';}else return previous;}
    if(row&&['rejected','cancelled'].includes(row.status))throw new McpDomainError('DOMAIN_REJECTED','This action was rejected.');
    if(unavailable&&!(this.requiresConfirmation(actionDefinitions[id].risk)&&(!row||row.status==='pending'))){const failure=unavailable();if(failure!==undefined){this.record(p.userId,p.clientId,id,actionDefinitions[id].risk,'executor_unavailable',row?.id);return failure;}}
    if(!row){
      if(write&&this.db.prepare("SELECT id FROM requests WHERE user_id=? AND client_id=? AND action=? AND input_hash=? AND created_at>? AND status NOT IN ('rejected','cancelled')").get(p.userId,p.clientId,id,digest,now-30000))throw new McpDomainError('CONFLICT','Possible repeated action. Retry the original key.');
      const requestId=randomUUID(),receipt=randomUUID(),status=this.requiresConfirmation(actionDefinitions[id].risk)?'pending':'queued';
      this.db.prepare('INSERT INTO requests(id,user_id,client_id,action,input,receipt_id,input_hash,key,status,created_at,expires_at,result,executor,ever_started) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?,0)').run(requestId,p.userId,p.clientId,id,encoded,receipt,digest,key,status,now,now+600000,executor);
      row=this.db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
      this.record(p.userId,p.clientId,id,actionDefinitions[id].risk,status,requestId);
    }
    if(row.status==='pending')return {success:false,status:'approval_required',action:id,pendingActionId:row.id,expiresAt:row.expires_at,summary:'Review and approve this change in Health OS Settings → HEOS MCP.',requiresUserAttention:true,undoable:false,execution:{executor:row.executor==='android'?'android':'web',reason:'Approval in Health OS is required before device execution.'}};
    if(row.expires_at<now)throw new McpDomainError('PENDING_ACTION_EXPIRED','This action expired. Review before creating a new request.');
    if(run){
      if(row.executor!==executor&&row.ever_started)throw new McpDomainError('EXECUTOR_UNAVAILABLE','Retry on the original executor. The previous attempt may have committed; changing executors is unsafe.',true);
      if(row.executor!==executor){this.db.prepare('UPDATE requests SET executor=? WHERE id=? AND ever_started=0').run(executor,row.id);row.executor=executor;}
      if(executor==='cloud'){
        const job=this.claim(p.userId,row.id,'cloud');if(job){const result=await run(job);if(result!==undefined){this.revalidate(p,id);return result;}}
      }else queueMicrotask(()=>void run({id:row.id,action:id,input,receiptId:row.receipt_id,executor:row.executor}).catch(()=>{}));
    }
    if(this.waits.has(row.id))return this.waitForResult(row.id);
    return new Promise<any>(resolve=>{const timer=setTimeout(()=>{this.waits.delete(row.id);resolve({success:false,error:{code:'UPSTREAM_UNAVAILABLE',message:'Open the signed-in Health OS app. Retry using the same key.',retryable:true,nextStep:'Open Health OS.'}});},25000);this.waits.set(row.id,{resolve,timer});});
  }
  private async waitForResult(id:string){for(let n=0;n<125;n++){const row=this.db.prepare('SELECT result FROM requests WHERE id=?').get(id) as any;if(row?.result)return JSON.parse(row.result);await new Promise(r=>setTimeout(r,200));}throw new McpDomainError('TIMEOUT','Retry with the same key.',true);}
  claim(user:string,id:string,executor:string):BrokerJob|undefined{
    this.db.prepare("UPDATE requests SET status='queued' WHERE id=? AND user_id=? AND executor=? AND status='running' AND id IN (SELECT request_id FROM leases WHERE until<?)").run(id,user,executor,Date.now());
    const row=this.db.prepare("SELECT * FROM requests WHERE id=? AND user_id=? AND executor=? AND status='queued' AND expires_at>?").get(id,user,executor,Date.now());if(!row)return;
    this.revalidate({userId:user,clientId:row.client_id,scopes:[],writeEnabled:false},row.action);
    this.db.prepare("UPDATE requests SET status='running',ever_started=1 WHERE id=? AND status='queued'").run(id);this.db.prepare('INSERT OR REPLACE INTO leases VALUES(?,?)').run(id,Date.now()+120000);
    this.db.prepare("INSERT INTO execution_audit VALUES(?,?,?,?,?,?,'running',?,?,?,NULL) ON CONFLICT(request_id) DO UPDATE SET executor=excluded.executor,status='running',started_at=excluded.started_at").run(id,user,row.client_id,row.action,executor,actionDefinitions[row.action as ActionId].risk,row.receipt_id,this.requiresConfirmation(actionDefinitions[row.action as ActionId].risk)?'approved':'not_required',Date.now());
    return {id,action:row.action,input:JSON.parse(row.input),receiptId:row.receipt_id,executor,recovering:!!row.ever_started};
  }
  fallback(user:string,id:string,executor:'web'|'android'){
    this.db.prepare("UPDATE requests SET executor=?,status='queued',ever_started=0 WHERE id=? AND user_id=? AND status='running' AND executor='cloud'").run(executor,id,user);this.db.prepare('DELETE FROM leases WHERE request_id=?').run(id);
  }
  poll(user:string,executor='web'){
    if(!this.policy.enabled||!this.controls(user)?.enabled)return [];
    this.db.prepare("UPDATE requests SET status='queued' WHERE user_id=? AND status='running' AND id IN (SELECT request_id FROM leases WHERE until<?)").run(user,Date.now());
    const rows=this.db.prepare("SELECT * FROM requests WHERE user_id=? AND executor=? AND status='queued' AND expires_at>? ORDER BY created_at LIMIT 1").all(user,executor,Date.now()) as any[];
    const ready=[];for(const r of rows){try{this.revalidate({userId:user,clientId:r.client_id,scopes:[],writeEnabled:false},r.action);}catch{this.db.prepare("UPDATE requests SET status='cancelled' WHERE id=?").run(r.id);continue;}
      const job=this.claim(user,r.id,executor);if(job)ready.push({id:job.id,action:job.action,input:job.input,receiptId:job.receiptId});}
    return ready;
  }
  authorize(user:string,id:string,executor?:string){const row=this.db.prepare("SELECT * FROM requests WHERE id=? AND user_id=? AND status='running' AND expires_at>?").get(id,user,Date.now()) as any;if(!row||executor&&row.executor!==executor)throw new McpDomainError('NOT_FOUND','Request is not active on this executor.');this.revalidate({userId:user,clientId:row.client_id,scopes:[],writeEnabled:false},row.action);return {success:true};}
  complete(user:string,id:string,result:unknown,executor?:string){const row=this.db.prepare("SELECT * FROM requests WHERE id=? AND user_id=? AND status='running'").get(id,user) as any;if(!row||executor&&row.executor!==executor)throw new McpDomainError('NOT_FOUND','Request is not active on this executor.');
    const parsed=responseSchema.parse(result),encoded=JSON.stringify(parsed);
    if(encoded.length>128000)throw new McpDomainError('INVALID_INPUT','Response is too large.');
    const def=actionDefinitions[row.action as ActionId];
    if(def.risk==='R0')this.db.prepare('DELETE FROM requests WHERE id=?').run(id);
    else this.db.prepare('UPDATE requests SET status=?,result=?,input=CASE WHEN ? THEN ? ELSE input END WHERE id=?').run(parsed.success?'executed':'failed',encoded,parsed.success?1:0,'{}',id);
    this.db.prepare('DELETE FROM leases WHERE request_id=?').run(id);
    this.db.prepare('UPDATE execution_audit SET status=?,latency_ms=?-started_at WHERE request_id=? AND user_id=?').run(parsed.success?'executed':'failed',Date.now(),id,user);
    this.record(user,row.client_id,row.action,actionDefinitions[row.action as ActionId].risk,parsed.success?'executed':'failed',id);
    const waiting=this.waits.get(id);if(waiting){clearTimeout(waiting.timer);this.waits.delete(id);try{this.revalidate({userId:user,clientId:row.client_id,scopes:[],writeEnabled:false},row.action);waiting.resolve(parsed);}catch(e){waiting.resolve(safeError(e));}}
  }
  close(){for(const w of this.waits.values()){clearTimeout(w.timer);w.resolve({success:false,error:{code:'UPSTREAM_UNAVAILABLE',message:'Server stopped.',retryable:true,nextStep:'Retry the same key.'}});}this.waits.clear();this.db.close();}
}
