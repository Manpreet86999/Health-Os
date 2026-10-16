import { DurableObject } from 'cloudflare:workers';
import { createHash, randomBytes } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { BrokerCore, type BrokerDatabase, type Principal } from '../../server/mcp/broker-core';
import { buildServer } from '../../server/mcp/server';
import { safeError, McpDomainError } from '../../shared/mcp-contracts';
import { z } from 'zod';
import {CloudSessionVault} from './cloud-session';
import {CloudActionGateway,CloudBackendUnavailable} from './cloud-gateway';
import {DeviceRegistry} from './device-registry';
import {ExecutionRouter,cloudSupports,executionClass,executorAnnouncement,validTimeZone,type ExecutionDecision} from '../../shared/mcp-execution';
import {actionDefinitions,retainedActionIds,isRetainedMcpAction,type ActionId} from '../../shared/mcp-contracts';
import type {Env} from './index';
import {cloudReadDefinitions} from '../../shared/mcp-read-aliases';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const legacyCapabilities=retainedActionIds().filter(id=>!(id in cloudReadDefinitions));
export class HealthAccount extends DurableObject {
  private broker:BrokerCore;
  private vault:CloudSessionVault;private devices:DeviceRegistry;private router=new ExecutionRouter();private gateway=new CloudActionGateway();private environment:Env;
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    const db:BrokerDatabase={exec:sql=>ctx.storage.sql.exec(sql),prepare:sql=>({get:(...args)=>ctx.storage.sql.exec(sql,...args).toArray()[0],all:(...args)=>ctx.storage.sql.exec(sql,...args).toArray(),run:(...args)=>ctx.storage.sql.exec(sql,...args)}),close:()=>{}};
    this.environment=env;this.broker=new BrokerCore(db,{enabled:env.MCP_ENABLED!=='false',writeEnabled:env.MCP_WRITES_ENABLED!=='false'});this.vault=new CloudSessionVault(db);this.devices=new DeviceRegistry(db);
    db.exec("CREATE TABLE IF NOT EXISTS cloud_preferences(user_id TEXT PRIMARY KEY,time_zone TEXT NOT NULL DEFAULT 'UTC')");
    db.exec('CREATE TABLE IF NOT EXISTS cloud_health(user_id TEXT PRIMARY KEY,healthy INTEGER NOT NULL,at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS bridge_tickets(hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,session_expires_at INTEGER)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  private online(){return this.ctx.getWebSockets().filter(ws=>{const a=ws.deserializeAttachment();return a?.expiresAt>Date.now()&&ws.readyState===1;});}
  private cloudAvailable(user:string,clientId?:string){const health=this.broker.db.prepare('SELECT healthy,at FROM cloud_health WHERE user_id=?').get(user);return this.environment.MCP_ENABLED!=='false'&&this.environment.CLOUD_EXECUTION_ENABLED!=='false'&&!!this.broker.controls(user)?.enabled&&this.vault.ready(user,clientId)&&!(health?.healthy===0&&Date.now()-health.at<15000);}
  private executors(user:string,cloudReady:boolean){return this.devices.list(user,cloudReady).map(e=>e.type==='cloud'?e:{...e,online:this.online().some(ws=>(ws.deserializeAttachment().executorId||'web')===e.executorId),lastHeartbeat:Date.now()});}
  private status(user:string){const clients=this.broker.status(user),cloudReady=this.cloudAvailable(user);return {...clients,clients:clients.clients.map(c=>({...c,cloud_authorized:this.vault.ready(user,c.id)})),bridgeOnline:!!this.online().length,executors:this.executors(user,cloudReady).map(({account,...e})=>e),cloudSupportedTools:retainedActionIds().filter(id=>cloudSupports(id as ActionId)).length,deviceRequiredTools:retainedActionIds().filter(id=>executionClass(id as ActionId)==='DEVICE_REQUIRED').length,timeZone:this.broker.db.prepare('SELECT time_zone FROM cloud_preferences WHERE user_id=?').get(user)?.time_zone||'UTC',executionAudit:this.broker.db.prepare('SELECT request_id,client_id,action,executor,risk,status,receipt_id,approval_state,started_at,latency_ms FROM execution_audit WHERE user_id=? ORDER BY started_at DESC LIMIT 40').all(user)};}
  private notify(user:string){const data=JSON.stringify({type:'status',data:this.status(user)});for(const ws of this.online())ws.send(data);}
  private dispatch(user:string){for(const type of ['web','android']){const ws=this.online().find(ws=>(ws.deserializeAttachment()?.executorType||'web')===type);if(!ws)continue;const jobs=this.broker.poll(user,type);for(const job of jobs)ws.send(JSON.stringify({type:'job',job}));}}
  async fetch(request:Request){
    const url=new URL(request.url),user=request.headers.get('X-Health-Owner');
    if(!user)return Response.json(safeError(new McpDomainError('AUTH_REQUIRED','Sign in to Health OS.')),{status:401});
    try{
      if(url.pathname==='/bridge/ws'){
        if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
        const ticket=url.searchParams.get('ticket')||'',row=this.ctx.storage.sql.exec('SELECT * FROM bridge_tickets WHERE hash=? AND user_id=?',digest(ticket),user).toArray()[0];
        if(!row||Number(row.expires_at)<Date.now())throw new McpDomainError('AUTH_REQUIRED','Reconnect Health OS.');
        this.ctx.storage.sql.exec('DELETE FROM bridge_tickets WHERE hash=?',digest(ticket));
        // One executing device per account. Replayed jobs recover their existing domain receipt.
        for(const old of this.ctx.getWebSockets())if((old.deserializeAttachment()?.executorType||'web')==='web')old.close(4001,'Another Health OS window connected.');
        const pair=new WebSocketPair(),[client,server]=Object.values(pair);
        this.ctx.acceptWebSocket(server);server.serializeAttachment({userId:user,expiresAt:Number(row.session_expires_at),executorType:'web',executorId:'web'});
        this.devices.announce(user,{executorId:'web',type:'web',version:'legacy-bridge',capabilities:legacyCapabilities,unsyncedChanges:true,activeWorkoutId:null});
        await this.ctx.storage.setAlarm(Number(row.session_expires_at));
        this.notify(user);this.dispatch(user);
        return new Response(null,{status:101,webSocket:client});
      }
      if(url.pathname==='/mcp'){
        if(this.environment.MCP_ENABLED==='false')throw new McpDomainError('PERMISSION_DENIED','MCP is globally disabled.');
        const p=JSON.parse(request.headers.get('X-Health-Principal')||'{}') as Principal;
        if(p.userId!==user)throw new McpDomainError('AUTH_REQUIRED','Invalid account.');
        const c=this.broker.db.prepare('SELECT scopes,write_enabled,enabled,expires_at FROM clients WHERE id=? AND user_id=?').get(p.clientId,user);
        if(!c?.enabled||c.expires_at<Date.now()||!this.broker.controls(user)?.enabled)throw new McpDomainError('PERMISSION_DENIED','Enable MCP in Health OS or reconnect this client.');
        const allowed=JSON.parse(c.scopes).filter((s:string)=>p.scopes.includes(s));
        const handler=createMcpHandler(()=>buildServer(async(id,input)=>{
          this.broker.revalidate(p,id);if(!p.scopes.includes(actionDefinitions[id].scope))throw new McpDomainError('SCOPE_REQUIRED','The required scope was not granted.');
          const key=request.headers.get('X-Health-Cloud-Key'),cloudReady=!!key&&this.cloudAvailable(user,p.clientId);
          const decision=this.router.choose(id,user,this.executors(user,cloudReady),(input as any)?.workoutId);
          const unavailable=(route:ExecutionDecision)=>{
            if(cloudSupports(id)&&this.environment.CLOUD_EXECUTION_ENABLED!=='false'){
              if(!key||!this.vault.ready(user,p.clientId))return {success:false,status:'cloud_authorization_required',action:id,execution:{...route,reason:'Cloud access is not authorized for this connection.'},requiresUserAttention:true,error:{code:'CLOUD_AUTH_REQUIRED',message:'This connection has no active cloud authorization. Reconnect HEOS MCP and allow cloud access, or open your signed-in Health OS app.',retryable:false,nextStep:'Reconnect HEOS MCP in ChatGPT. On the Health OS consent screen select Allow supported cloud reads and logs when my apps are closed.'}};
              return {success:false,status:'cloud_temporarily_unavailable',action:id,execution:{...route,reason:'Cloud authorization exists; the service is temporarily unavailable.'},error:{code:'CLOUD_UNAVAILABLE',message:'Your cloud access is authorized. A recent service failure temporarily paused cloud execution. Retry in 15 seconds; reconnecting is not required.',retryable:true,nextStep:'Wait 15 seconds and retry the read.'}};
            }
            return {success:false,status:'executor_unavailable',action:id,execution:route,error:{code:'EXECUTOR_UNAVAILABLE',message:route.reason,retryable:true,nextStep:'Open the signed-in compatible Health OS app.'}};
          };
          const executor=decision.executor==='unavailable'?'web':decision.executor;
          return this.broker.call(p,id,input,async job=>{
            if(job.executor!=='cloud'){this.notify(user);this.dispatch(user);return;}
            try{
              const session=await this.vault.get(user,p.clientId,key!);this.broker.authorize(user,job.id,'cloud');
              const result=await this.gateway.execute(job,session,{userId:user,clientId:p.clientId,scopes:allowed,timeZone:this.status(user).timeZone,authorize:()=>{this.broker.authorize(user,job.id,'cloud');this.broker.revalidate(p,id);}});
              this.broker.db.prepare('INSERT INTO cloud_health VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET healthy=1,at=excluded.at').run(user,Date.now());
              this.broker.complete(user,job.id,result,'cloud');this.notify(user);return result;
            }catch(error){
              if(error instanceof CloudBackendUnavailable)this.broker.db.prepare('INSERT INTO cloud_health VALUES(?,0,?) ON CONFLICT(user_id) DO UPDATE SET healthy=0,at=excluded.at').run(user,Date.now());
              if(error instanceof McpDomainError&&error.code==='CLOUD_AUTH_REQUIRED')this.vault.remove(user,p.clientId);
              if(error instanceof CloudBackendUnavailable&&error.safeToFallback&&(!job.recovering||actionDefinitions[id].risk==='R0')){const fallback=this.router.choose(id,user,this.executors(user,false));if(fallback.executor==='web'||fallback.executor==='android'){this.broker.fallback(user,job.id,fallback.executor);setTimeout(()=>{this.notify(user);this.dispatch(user);},0);return;}}
              const result=error instanceof CloudBackendUnavailable&&error.safeToFallback?{...safeError(error),status:'executor_unavailable',action:id,execution:{...this.router.choose(id,user,this.executors(user,false)),reason:'Cloud access is authorized, but the backend request failed temporarily. Retry the read.'}}:safeError(error);this.broker.complete(user,job.id,result,'cloud');this.notify(user);return result;
            }
          },executor,()=>decision.executor==='unavailable'?unavailable(decision):undefined);
        },allowed,{resourceMetadataUrl:(this.environment.PUBLIC_ORIGIN||url.origin)+'/.well-known/oauth-protected-resource/mcp'}),{maxRequestBodySize:128000});
        return await handler.fetch(request);
      }
      const body=await request.json() as any;
      let result:any;
      switch(url.pathname){
        case '/control/status': result=this.status(user);break;
        case '/control/preferences':{const b=z.object({timeZone:z.string().min(1).max(100)}).strict().parse(body);validTimeZone(b.timeZone);this.broker.db.prepare('INSERT INTO cloud_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET time_zone=excluded.time_zone').run(user,b.timeZone);result={success:true};break;}
        case '/control/settings':{const b=z.object({enabled:z.boolean(),writeEnabled:z.boolean()}).strict().parse(body);this.broker.setControls(user,b.enabled,b.writeEnabled);if(!b.enabled)for(const ws of this.ctx.getWebSockets())ws.close(4003,'MCP disabled.');result={success:true};break;}
        case '/control/revoke':{const b=z.object({id:z.string().uuid()}).strict().parse(body);this.broker.revoke(user,b.id);this.vault.remove(user,b.id);result={success:true};break;}
        case '/control/approve':{const b=z.object({id:z.string().uuid(),approved:z.boolean()}).strict().parse(body);this.broker.approve(user,b.id,b.approved);this.dispatch(user);result={success:true};break;}
        case '/bridge/ticket':{
          if(!this.broker.controls(user)?.enabled)throw new McpDomainError('PERMISSION_DENIED','Enable MCP in Health OS.');
          const expiresAt=z.number().int().min(Date.now()+1000).max(Date.now()+3600000).parse(body.expiresAt),ticket=randomBytes(32).toString('base64url');
          this.ctx.storage.sql.exec('DELETE FROM bridge_tickets WHERE expires_at<?',Date.now());
          this.ctx.storage.sql.exec('INSERT INTO bridge_tickets VALUES(?,?,?,?)',digest(ticket),user,Date.now()+60000,expiresAt);
          result={ticket,userId:user,expiresAt};break;
        }
        case '/internal/grant':{
          if(!this.broker.controls(user)?.enabled)throw new McpDomainError('PERMISSION_DENIED','First enable MCP in your Health OS app.');
          if(body.writeEnabled&&!this.broker.controls(user)?.write_enabled)throw new McpDomainError('PERMISSION_DENIED','Enable write access in Health OS before granting write tools.');
          const pair=this.broker.register(user,{name:body.name,scopes:body.scopes,writeEnabled:body.writeEnabled});this.broker.db.prepare('UPDATE clients SET expires_at=? WHERE id=?').run(Date.now()+30*86400000,pair.id);
          const cloudKey=body.cloudSession?CloudSessionVault.newKey():undefined;if(cloudKey)await this.vault.store(user,pair.id,cloudKey,body.cloudSession);
          result={clientId:pair.id,...(cloudKey?{cloudKey}:{})};break;
        }
        default:return new Response('Not found',{status:404});
      }
      this.notify(user);return Response.json(result);
    }catch(e){return Response.json(safeError(e),{status:e instanceof McpDomainError?403:400});}
  }
  async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
    const attachment=ws.deserializeAttachment();
    if(!attachment||attachment.expiresAt<Date.now()){ws.close(4003,'Sign in again.');return;}
    const user=attachment.userId;
    let messageId:string|undefined;
    try{
      if(typeof message!=='string'||message.length>128000)throw new Error('Invalid message.');
      const envelope=JSON.parse(message);
      if(z.string().uuid().safeParse(envelope?.id).success)messageId=envelope.id;
      if(envelope.type==='ready'||envelope.type==='heartbeat'){if(envelope.executor){const e=executorAnnouncement.parse(envelope.executor);if(e.type!==(attachment.executorType||'web'))throw new Error('Executor type mismatch.');this.devices.announce(user,e);attachment.executorId=e.executorId;ws.serializeAttachment(attachment);}else this.devices.announce(user,{executorId:attachment.executorId||'web',type:'web',version:'legacy-bridge',capabilities:legacyCapabilities,unsyncedChanges:true,activeWorkoutId:null});this.dispatch(user);return;}
      if(envelope.type==='authorize'){
        const b=z.object({type:z.literal('authorize'),id:z.string().uuid()}).strict().parse(envelope);
        const result=this.broker.authorize(user,b.id,attachment.executorType||'web');ws.send(JSON.stringify({type:'authorized',id:b.id,...result}));return;
      }
      const b=z.object({type:z.literal('complete'),id:z.string().uuid(),result:z.unknown()}).strict().parse(envelope);
      this.broker.authorize(user,b.id,attachment.executorType||'web');this.broker.complete(user,b.id,{...(b.result as any),execution:{executor:attachment.executorType||'web',reason:'Executed by a compatible active Health OS device.',source:'device',verified:!!(b.result as any)?.success,asOf:new Date().toISOString()}},attachment.executorType||'web');this.notify(user);this.dispatch(user);
    }catch(e){ws.send(JSON.stringify({type:'error',id:messageId,...safeError(e)}));}
  }
  async alarm(){for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a||a.expiresAt<=Date.now())ws.close(4003,'Session expired.');}const next=this.online().map(ws=>ws.deserializeAttachment().expiresAt);if(next.length)await this.ctx.storage.setAlarm(Math.min(...next));}
  webSocketClose(ws:WebSocket,code:number){const a=ws.deserializeAttachment();if(a)this.devices.offline(a.userId,a.executorId||'web');ws.close(code);}
  webSocketError(ws:WebSocket){const a=ws.deserializeAttachment();if(a)this.devices.offline(a.userId,a.executorId||'web');ws.close(1011,'Reconnect Health OS.');}
}
