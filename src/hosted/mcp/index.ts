import OAuthProvider, { type OAuthHelpers, type OAuthResourceAuth, AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';
import { DEFAULT_SUPABASE_CONFIG } from '../../shared/supabase-project';
import { verifySupabaseSession, supabaseSignIn } from '../../shared/supabase-auth';
import { actionDefinitions,retainedActionIds,isRetainedMcpAction, safeError, McpDomainError,mcpVersion } from '../../shared/mcp-contracts';
import { z } from 'zod';
import {cloudSupports,validTimeZone} from '../../shared/mcp-execution';
export { HealthAccount } from './account';

export interface Env { OAUTH_KV:KVNamespace; ACCOUNTS:DurableObjectNamespace; OAUTH_PROVIDER:OAuthHelpers; PUBLIC_ORIGIN?:string; APP_ORIGINS:string; MCP_ENABLED?:string; MCP_WRITES_ENABLED?:string; CLOUD_EXECUTION_ENABLED?:string; }
const available=[...new Set(retainedActionIds().map(id=>actionDefinitions[id].scope))],readScopes=available.filter(s=>s.endsWith('.read'));
function account(env:Env,user:string){return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(user));}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
function bearer(req:Request){const value=req.headers.get('Authorization');if(!value?.startsWith('Bearer ')||value.length>8192)throw new McpDomainError('AUTH_REQUIRED','Sign in to Health OS.');return value.slice(7);}
async function bodyBound(req:Request){const raw=await req.text();if(raw.length>128000)throw new McpDomainError('INVALID_INPUT','Request is too large.');return JSON.parse(raw);}
function jwtExpiry(token:string){try{const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return Math.min(Date.now()+15*60000,Number(payload.exp)*1000);}catch{return Date.now()+5*60000;}}
function consentPage(details:any,handle:string,allScopes:string[]){
  const selected=details.scope?.length?details.scope:readScopes;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect HEOS MCP</title><style>body{font:17px system-ui;max-width:560px;margin:40px auto;padding:20px;background:#101311;color:#edf4ec}label{display:block;margin:14px 0}input[type=email],input[type=password]{box-sizing:border-box;width:100%;padding:12px}button{padding:12px 20px;margin:12px 8px 0 0}small{color:#bdc8bd}</style><h1>Connect HEOS MCP</h1><p>Allow <strong>${escape(details.clientName)}</strong> to use your Health OS account?</p><p>Access returns to <strong>${escape(details.redirectHost)}</strong>.</p><small>${details.clientDomain?`Client domain: ${escape(details.clientDomain)}`:'The client name is self-reported. Continue only if you started this connection.'}</small>${details.redirectIsLoopback?'<p>This client runs on your computer.</p>':''}<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(handle)}"><label>Email<input type="email" name="email" autocomplete="username" required maxlength="320"></label><label>Health OS password<input type="password" name="password" autocomplete="current-password" required maxlength="500"></label><h2>Choose access</h2>${allScopes.map(s=>`<label><input type="checkbox" name="scope" value="${escape(s)}" ${selected.includes(s)&&s.endsWith('.read')?'checked':''}>${escape(s.replace('.read',' — read').replace('.write',' — change'))}</label>`).join('')}<label><input type="checkbox" name="cloud" checked>Allow supported cloud reads and logs when my apps are closed</label><p>Cloud access stores an encrypted delegated Health OS session for this client. Local workouts and significant changes still require Health OS.</p><button name="decision" value="approve">Allow connection</button><button name="decision" value="deny" formnovalidate>Cancel</button></form></html>`;
}
async function defaultFetch(req:Request,env:Env){
  const url=new URL(req.url),path=url.pathname;
  if(path==='/health')return Response.json({service:'health-os-mcp',version:mcpVersion,toolCount:retainedActionIds().length,cloudSupportedTools:retainedActionIds().filter(id=>cloudSupports(id as any)).length,mode:'hosted',requiresOpenApp:false,cloudExecutionEnabled:env.CLOUD_EXECUTION_ENABLED!=='false'});
  if(path==='/authorize'){
    if(req.method==='GET'){
      const auth=await env.OAUTH_PROVIDER.parseAuthRequest(req),details=await env.OAUTH_PROVIDER.describeConsent(auth),consent=await env.OAUTH_PROVIDER.beginConsent(auth);
      const callbackOrigin=new URL(auth.redirectUri).origin;
      if(!/^https?:\/\/[A-Za-z0-9.[\]:_-]+$/.test(callbackOrigin))throw new Error('Invalid callback origin.');
      // Same-origin form POSTs need a non-null Origin; external redirects still receive no referrer.
      consent.headers.set('Content-Type','text/html; charset=utf-8');consent.headers.set('Cache-Control','no-store');consent.headers.set('Referrer-Policy','same-origin');
      // Chromium also checks form-action on the redirect after consent. The callback was verified against client metadata.
      consent.headers.set('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`);
      return new Response(consentPage(details,consent.handle,available),{headers:consent.headers});
    }
    if(req.method!=='POST'||req.headers.get('Origin')!==url.origin)return new Response('Invalid authorization request',{status:403});
    if(Number(req.headers.get('Content-Length')||0)>128000)return new Response('Too large',{status:413});
    const raw=await req.text();if(raw.length>128000)return new Response('Too large',{status:413});const form=new URLSearchParams(raw),handle=form.get('handle')||'';
    if(form.get('decision')!=='approve'){const denied=await env.OAUTH_PROVIDER.denyConsent(req,handle);return new Response(null,{status:302,headers:denied.headers});}
    const email=z.string().email().max(320).parse(form.get('email')),password=z.string().min(1).max(500).parse(form.get('password'));
    const session=await supabaseSignIn(DEFAULT_SUPABASE_CONFIG,email,password),identity=await verifySupabaseSession(DEFAULT_SUPABASE_CONFIG,session.accessToken);
    const chosen=z.array(z.enum(available as [string,...string[]])).min(1).max(available.length).parse(form.getAll('scope'));
    const approved=await env.OAUTH_PROVIDER.approveConsent(req,handle,{scope:chosen});
    const details=await env.OAUTH_PROVIDER.describeConsent(approved.request);
    const response=await account(env,identity.uid).fetch(new Request(url.origin+'/internal/grant',{method:'POST',headers:{'X-Health-Owner':identity.uid,'Content-Type':'application/json'},body:JSON.stringify({name:details.clientName.slice(0,80),scopes:chosen,writeEnabled:chosen.some(s=>s.endsWith('.write')),cloudSession:form.get('cloud')==='on'?session:undefined})}));
    const granted=await response.json() as any;if(!response.ok)throw new McpDomainError('PERMISSION_DENIED',granted.error?.message||'Enable MCP in Health OS first.');
    const {redirectTo}=await env.OAUTH_PROVIDER.completeAuthorization({request:approved.request,userId:identity.uid,metadata:{clientName:details.clientName},scope:chosen,props:{userId:identity.uid,clientId:granted.clientId,...(granted.cloudKey?{cloudKey:granted.cloudKey}:{})}});
    approved.headers.set('Location',redirectTo);return new Response(null,{status:302,headers:approved.headers});
  }
  if(path.startsWith('/control/')||path==='/bridge/ticket'){
    const origin=req.headers.get('Origin'),allowed=[url.origin,...env.APP_ORIGINS.split(',').map(s=>s.trim())];
    if(!origin||!allowed.includes(origin))return new Response('Origin denied',{status:403});
    const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return new Response('Method denied',{status:405,headers});
    const token=bearer(req),identity=await verifySupabaseSession(DEFAULT_SUPABASE_CONFIG,token),body=await bodyBound(req);
    if(path==='/bridge/ticket')body.expiresAt=jwtExpiry(token);
    const response=await account(env,identity.uid).fetch(new Request(url.origin+path,{method:'POST',headers:{'X-Health-Owner':identity.uid,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    return new Response(response.body,{status:response.status,headers:{...headers,'Content-Type':'application/json'}});
  }
  if(path==='/bridge/ws'){
    const origin=req.headers.get('Origin');if(!origin||!env.APP_ORIGINS.split(',').map(s=>s.trim()).includes(origin))return new Response('Origin denied',{status:403});
    const user=z.string().uuid().parse(url.searchParams.get('user')),ticket=z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(url.searchParams.get('ticket'));
    return account(env,user).fetch(new Request(url.origin+`/bridge/ws?ticket=${encodeURIComponent(ticket)}`,{headers:{Upgrade:'websocket','X-Health-Owner':user}}));
  }
  return new Response('HEOS MCP. Connect with the /mcp URL.',{status:path==='/'?200:404});
}
export default {
  async fetch(req:Request,env:Env,ctx:ExecutionContext){
    const url=new URL(req.url),origin=env.PUBLIC_ORIGIN||url.origin;
    if(env.PUBLIC_ORIGIN&&url.origin!==env.PUBLIC_ORIGIN)return new Response('Invalid host',{status:403});
    if(Number(req.headers.get('Content-Length')||0)>128000)return new Response('Too large',{status:413});
    const provider=new OAuthProvider<Env>({
      apiRoute:'/mcp',authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',
      accessTokenTTL:1800,refreshTokenTTL:30*86400,scopesSupported:available,clientIdMetadataDocumentEnabled:true,
      resourceMetadata:{resource:origin+'/mcp',authorization_servers:[origin]},requiredScopes:[],
      apiHandler:{async fetch(request,environment,context){const props=context.props as {userId:string;clientId:string;cloudKey?:string};const auth=(context as ExecutionContext & {auth:OAuthResourceAuth}).auth;if(!props?.userId||!props?.clientId||!auth)return new Response('Invalid account',{status:401});const headers=new Headers(request.headers);headers.set('X-Health-Owner',props.userId);headers.set('X-Health-Principal',JSON.stringify({userId:props.userId,clientId:props.clientId,scopes:auth.scope,writeEnabled:true}));headers.delete('X-Health-Cloud-Key');if(props.cloudKey)headers.set('X-Health-Cloud-Key',props.cloudKey);return account(environment,props.userId).fetch(new Request(request,{headers}));}},
      defaultHandler:{fetch:defaultFetch},
    });
    try{return await provider.fetch(req,env,ctx);}catch(e){if(e instanceof AuthorizationError&&e.redirectTo)return Response.redirect(e.redirectTo,302);if(e instanceof AuthorizationError||e instanceof CimdFetchError)return new Response('Connection expired or could not be verified. Start the connection again.',{status:400});const headers:Record<string,string>={'Cache-Control':'no-store'};const appOrigin=req.headers.get('Origin');if(appOrigin&&[url.origin,...env.APP_ORIGINS.split(',').map(s=>s.trim())].includes(appOrigin)){headers['Access-Control-Allow-Origin']=appOrigin;headers.Vary='Origin';}return Response.json(safeError(e),{status:400,headers});}
  },
};
