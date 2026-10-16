import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {refreshSupabaseSession,verifySupabaseSession,type SupabaseAccountSession} from '../../shared/supabase-auth';
import {DEFAULT_SUPABASE_CONFIG} from '../../shared/supabase-project';
import {McpDomainError} from '../../shared/mcp-contracts';
import type {BrokerDatabase} from '../../server/mcp/broker-core';
import {CloudBackendUnavailable} from './cloud-gateway';

const payload=z.object({uid:z.string().uuid(),email:z.string(),accessToken:z.string().min(1),refreshToken:z.string().min(1),expiresAt:z.number().finite(),config:z.object({url:z.string(),publishableKey:z.string()})}).strict();
export class CloudSessionVault{
 private pending=new Map<string,Promise<SupabaseAccountSession>>();
 constructor(private db:BrokerDatabase){db.exec('CREATE TABLE IF NOT EXISTS cloud_sessions(client_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,ciphertext TEXT NOT NULL,expires_at INTEGER NOT NULL)');}
 static newKey(){return randomBytes(32).toString('base64url');}
 private async key(secret:string){if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new McpDomainError('AUTH_REQUIRED','Reconnect this client and authorize cloud execution.');return crypto.subtle.importKey('raw',Buffer.from(secret,'base64url'),{name:'AES-GCM'},false,['encrypt','decrypt']);}
 private async seal(owner:string,client:string,secret:string,session:SupabaseAccountSession){const nonce=randomBytes(12),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(owner+'\0'+client)},await this.key(secret),new TextEncoder().encode(JSON.stringify(session)));return nonce.toString('base64url')+'.'+Buffer.from(bytes).toString('base64url');}
 async store(owner:string,client:string,secret:string,session:SupabaseAccountSession,expiresAt=Date.now()+30*86400000){if(session.uid!==owner||session.config.url!==DEFAULT_SUPABASE_CONFIG.url||session.config.publishableKey!==DEFAULT_SUPABASE_CONFIG.publishableKey)throw new McpDomainError('PERMISSION_DENIED','Cloud session account mismatch.');const ciphertext=await this.seal(owner,client,secret,session);this.db.prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET ciphertext=excluded.ciphertext,expires_at=excluded.expires_at').run(client,owner,ciphertext,expiresAt);}
 ready(owner:string,client?:string){return !!this.db.prepare('SELECT client_id FROM cloud_sessions WHERE user_id=? AND expires_at>?'+(client?' AND client_id=?':'')+' LIMIT 1').get(...(client?[owner,Date.now(),client]:[owner,Date.now()]));}
 remove(owner:string,client:string){this.db.prepare('DELETE FROM cloud_sessions WHERE user_id=? AND client_id=?').run(owner,client);}
 get(owner:string,client:string,secret:string){const cacheKey=owner+'\0'+client+'\0'+secret,existing=this.pending.get(cacheKey);if(existing)return existing;const task=this.load(owner,client,secret).finally(()=>this.pending.delete(cacheKey));this.pending.set(cacheKey,task);return task;}
 private async load(owner:string,client:string,secret:string){
  const row=this.db.prepare('SELECT ciphertext,expires_at FROM cloud_sessions WHERE user_id=? AND client_id=? AND expires_at>?').get(owner,client,Date.now());if(!row)throw new McpDomainError('CLOUD_AUTH_REQUIRED','Reconnect this client and authorize cloud access.');
  let session:SupabaseAccountSession;
  try{const [nonce,encrypted]=row.ciphertext.split('.'),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(nonce,'base64url'),additionalData:new TextEncoder().encode(owner+'\0'+client)},await this.key(secret),Buffer.from(encrypted,'base64url'));session=payload.parse(JSON.parse(new TextDecoder().decode(plain)));}catch{throw new McpDomainError('AUTH_REQUIRED','Cloud authorization could not be verified. Reconnect this client.');}
  if(session.uid!==owner||session.config.url!==DEFAULT_SUPABASE_CONFIG.url)throw new McpDomainError('PERMISSION_DENIED','Cloud session account mismatch.');
  try{const fresh=await refreshSupabaseSession(session);if(fresh.uid!==owner)throw new Error('Account mismatch');if(fresh!==session)await this.store(owner,client,secret,fresh,row.expires_at);const identity=await verifySupabaseSession(DEFAULT_SUPABASE_CONFIG,fresh.accessToken);if(identity.uid!==owner)throw new Error('Account mismatch');return fresh;}catch(e){if((e as any)?.status>=500||e instanceof TypeError)throw new CloudBackendUnavailable(true);throw new McpDomainError('CLOUD_AUTH_REQUIRED','The delegated Health OS session expired or was revoked. Reconnect this client.');}
 }
}
