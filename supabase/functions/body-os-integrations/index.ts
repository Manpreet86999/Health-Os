import { normalizeFood } from '../../../src/shared/food-normalize.ts';
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS' };
const json = (data:unknown,status=200) => Response.json(data,{status,headers:cors});
type Data=Record<string,any>;
const base=()=>Deno.env.get('SUPABASE_URL')!;
const service=()=>Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const encode=(bytes:Uint8Array)=>{let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(Deno.env.get('BODY_OS_INTEGRATION_ENCRYPTION_KEY')||service())),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function privateDb(path:string,init:RequestInit={}) {
  const r=await fetch(`${base()}/rest/v1/${path}`,{...init,headers:{apikey:service(),Authorization:`Bearer ${service()}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('Cloud integration storage is unavailable.');return r.status===204?null:r.json();
}
async function save(owner:string,provider:string,data:Data){
  const iv=crypto.getRandomValues(new Uint8Array(12));const aad=new TextEncoder().encode(`${owner}:${provider}`);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(),new TextEncoder().encode(JSON.stringify(data)));
  await privateDb('body_os_cloud_integrations?on_conflict=user_id,provider',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:owner,provider,data:{iv:encode(iv),cipher:encode(new Uint8Array(encrypted))},updated_at:new Date().toISOString()})});
}
async function open(row:Data){
  if(!row?.data?.cipher)return {};
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(row.data.iv),additionalData:new TextEncoder().encode(`${row.user_id}:${row.provider}`)},await key(),decode(row.data.cipher));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function get(owner:string,provider:string){const rows=await privateDb(`body_os_cloud_integrations?user_id=eq.${owner}&provider=eq.${encodeURIComponent(provider)}&select=user_id,provider,data&limit=1`);return rows[0]?open(rows[0]):{};}
const callback=()=>`${base()}/functions/v1/body-os-integrations/drive-callback`;
async function token(owner:string){
  const config=await get(owner,'google');
  if(config.accessToken&&config.expiresAt>Date.now()+60000)return config.accessToken;
  if(!config.refreshToken)throw new Error('Connect Google Drive in Settings → Connections.');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Google Drive authorization expired or was revoked. Reconnect in Settings.');
  const data=await r.json();await save(owner,'google',{...config,accessToken:data.access_token,expiresAt:Date.now()+Number(data.expires_in)*1000});return data.access_token;
}
const driveFile=(id:unknown)=>{if(typeof id!=='string'||!/^[A-Za-z0-9_-]{5,200}$/.test(id))throw new Error('Choose a valid Drive backup.');return id;};
async function drive(owner:string,path:string,init:RequestInit={}){const r=await fetch(`https://www.googleapis.com/drive/v3/${path}`,{...init,headers:{Authorization:`Bearer ${await token(owner)}`,...init.headers},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Google Drive request failed (${r.status}).`);return r;}
export async function handler(request:Request):Promise<Response>{
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  try {
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname.endsWith('/drive-callback')) {
      const state=url.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))return json({error:'This Drive connection link is invalid or expired.'},400);
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      const rows=await privateDb(`body_os_cloud_integrations?provider=eq.drive-oauth:${hash}&select=user_id,provider,data&limit=1`);
      if(!rows[0])return json({error:'This Drive connection link has already been used or expired.'},400);
      const pending=await open(rows[0]);
      // Consume state atomically before exchanging a code; a racing callback cannot reuse it.
      const consumed=await privateDb(`body_os_cloud_integrations?user_id=eq.${rows[0].user_id}&provider=eq.${rows[0].provider}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
      if(!consumed?.length||pending.expiresAt<Date.now()||url.searchParams.has('error')||!url.searchParams.get('code'))return json({error:'Google Drive authorization was cancelled or expired. Start again in Settings.'},400);
      const config=await get(rows[0].user_id,'google');
      const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code:url.searchParams.get('code')!,redirect_uri:callback(),grant_type:'authorization_code',code_verifier:pending.verifier}),signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error('Google rejected the authorization code. Check your client settings and redirect URL.');
      const result=await r.json();if(!result.refresh_token&&!config.refreshToken)throw new Error('Google did not grant offline access. Reconnect and approve the Drive permission.');
      await save(rows[0].user_id,'google',{...config,refreshToken:result.refresh_token||config.refreshToken,accessToken:result.access_token,expiresAt:Date.now()+Number(result.expires_in)*1000});
      return new Response('Google Drive connected to Health OS. You can close this tab and return to Settings.',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return json({error:'Sign in to Health OS.'},401);
    const auth=await fetch(`${base()}/auth/v1/user`,{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:authorization},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return json({error:'Sign in again to continue.'},401);const user=await auth.json();if(!user.id||user.is_anonymous)return json({error:'A registered account is required.'},401);
    const text=await request.text();if(text.length>15000000)return json({error:'Request is too large.'},413);const input=JSON.parse(text);const owner=user.id;
    if(input.action==='/biology/foods'){
      const query=String(input.query||'').trim();if(query.length<2||query.length>150)return json({error:'Enter a food name or barcode.'},400);
      if(input.barcode&&!/^\d{4,24}$/.test(query))return json({error:'Enter a valid barcode.'},400);
      const fields='code,product_name,generic_name,brands,nutriments,serving_size,ingredients_text,allergens_tags,image_small_url';
      const url=input.barcode?`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(query)}?fields=${fields}`:`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`;
      const response=await fetch(url,{headers:{'User-Agent':'HealthOS/5.1.0 (Supabase cloud nutrition lookup)'},signal:AbortSignal.timeout(15000)});if(!response.ok)return json({error:'Food catalogue is temporarily unavailable. Use saved foods or Quick Add.'},502);
      const result=await response.json();return json({foods:(input.barcode?(result.product?[result.product]:[]):result.products||[]).map(normalizeFood).filter(Boolean),cached:false,stale:false});
    }
    if(input.action==='/integrations/status'){
      const google=await get(owner,'google'),telegram=await get(owner,'telegram');return json({driveConnected:Boolean(google.refreshToken),hasGoogleClient:Boolean(google.clientId&&google.clientSecret),hasTelegram:Boolean(telegram.botToken&&telegram.chatId),telegramMiniAppUrl:telegram.miniAppUrl||'',redirectUri:callback()});
    }
    if(input.action==='/integrations/config'){
      if(input.googleClientId||input.googleClientSecret){const previous=await get(owner,'google');const clientId=String(input.googleClientId||previous.clientId||'').trim(),clientSecret=String(input.googleClientSecret||previous.clientSecret||'').trim();if(!clientId.endsWith('.apps.googleusercontent.com')||!clientSecret||clientSecret.length>1000)throw new Error('Enter your Google Web application client ID and secret.');const same=clientId===previous.clientId&&clientSecret===previous.clientSecret;await save(owner,'google',{...(same?previous:{}),clientId,clientSecret});}
      if(input.telegramBotToken||input.telegramChatId||input.telegramMiniAppUrl){const previous=await get(owner,'telegram');const botToken=String(input.telegramBotToken||previous.botToken||'').trim(),chatId=String(input.telegramChatId||previous.chatId||'').trim(),miniAppUrl=String(input.telegramMiniAppUrl||previous.miniAppUrl||'').trim();if(!/^\d+:[\w-]{20,}$/.test(botToken)||!/^(-?\d{1,20}|@[A-Za-z0-9_]{5,})$/.test(chatId))throw new Error('Enter a valid Telegram bot token and chat ID.');if(miniAppUrl){const target=new URL(miniAppUrl);if(target.protocol!=='https:'||target.username||target.password)throw new Error('Telegram Mini Apps require a public HTTPS URL.');}await save(owner,'telegram',{botToken,chatId,miniAppUrl});}
      return json({ok:true});
    }
    if(input.action==='/gdrive/auth-url'){
      const config=await get(owner,'google');if(!config.clientId||!config.clientSecret)throw new Error('Save your Google OAuth client ID and secret first.');
      const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');const state=random(),verifier=random();
      const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
      const hash=[...await digest(state)].map(b=>b.toString(16).padStart(2,'0')).join('');const challenge=encode(await digest(verifier)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      await save(owner,`drive-oauth:${hash}`,{expiresAt:Date.now()+600000,verifier});
      return json({url:`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:config.clientId,redirect_uri:callback(),response_type:'code',scope:'https://www.googleapis.com/auth/drive.appdata',access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'})}`});
    }
    if(input.action==='/gdrive/backups'){
      const files=[];let pageToken='';do{const params=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and name contains 'body-os-cloud-'",fields:'nextPageToken,files(id,name,createdTime,size,appProperties)',orderBy:'createdTime desc',pageSize:'100',...(pageToken?{pageToken}:{})});const data=await (await drive(owner,`files?${params}`)).json();files.push(...data.files);pageToken=data.nextPageToken||'';}while(pageToken&&files.length<500);
      return json({files,backups:files});
    }
    if(input.action==='/gdrive/backup'){
      if(!input.backup||!Array.isArray(input.backup.cloudRecords)||input.backup.ownerId!==owner)throw new Error('Choose a backup from your signed-in account.');
      const boundary=`body-os-${crypto.randomUUID()}`;const metadata={name:`body-os-cloud-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,parents:['appDataFolder'],appProperties:{bodyOsOwner:owner,format:'cloud-v1'}};
      const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(input.backup)}\r\n--${boundary}--`;
      const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime',{method:'POST',headers:{Authorization:`Bearer ${await token(owner)}`,'Content-Type':`multipart/related; boundary=${boundary}`},body,signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Google Drive backup upload failed.');return json({ok:true,file:await r.json()});
    }
    if(input.action==='/gdrive/restore'){
      const id=driveFile(input.fileId);const metadata=await (await drive(owner,`files/${id}?fields=id,name,parents,appProperties,size`)).json();
      if(!metadata.parents?.includes('appDataFolder')||metadata.appProperties?.bodyOsOwner!==owner||!metadata.name?.startsWith('body-os-cloud-')||Number(metadata.size)>15000000)throw new Error('This file is not a Health OS backup for your account.');
      const r=await drive(owner,`files/${id}?alt=media`);const data=await r.text();if(data.length>15000000)throw new Error('Backup is too large.');return json({backup:JSON.parse(data)});
    }
    if(input.action==='/gdrive/disconnect'){
      const config=await get(owner,'google');if(config.refreshToken){const revoked=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:config.refreshToken}),signal:AbortSignal.timeout(15000)});if(!revoked.ok&&revoked.status!==400)throw new Error('Google could not revoke access. Try again.');}await save(owner,'google',{clientId:config.clientId,clientSecret:config.clientSecret});return json({ok:true});
    }
    if(input.action==='/telegram/send-workout-plan'||input.action==='/telegram/send-report'){
      const config=await get(owner,'telegram');if(!config.botToken||!config.chatId)throw new Error('Configure Telegram in Settings → Connections.');
      const rows:Data[]=[];
      for(let offset=0;;offset+=500){const records=await fetch(`${base()}/rest/v1/body_os_records?user_id=eq.${owner}&entity_type=in.(week,session)&deleted_at=is.null&select=entity_type,record_id,payload&order=entity_type,record_id&limit=500&offset=${offset}`,{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:authorization},signal:AbortSignal.timeout(20000)});if(!records.ok)throw new Error('Could not read your saved workout.');const page=await records.json();rows.push(...page);if(page.length<500)break;}
      const week=rows.find((r:Data)=>r.entity_type==='week'&&r.record_id===input.weekId)?.payload;if(!week)throw new Error('Training week not found in your account.');
      let message='';if(input.action==='/telegram/send-workout-plan'){const day=week.days?.find((d:Data)=>d.key===input.dayKey);if(!day)throw new Error('Choose a day in this week.');message=`Health OS · ${week.name}\n${day.key}: ${day.title}\n\n${(day.exercises||[]).map((e:Data,i:number)=>`${i+1}. ${e.name} · ${e.vol||''}\n${e.cue||''}`).join('\n\n')}`;}else{const sessions=rows.filter((r:Data)=>r.entity_type==='session'&&r.payload.weekId===week.id&&['finished','completed'].includes(r.payload.status)).map((r:Data)=>r.payload);message=`Health OS · ${week.name}\n${sessions.length} saved workouts\n\n${sessions.map((s:Data)=>`${s.date} · ${s.dayTitle}\n${s.logs.filter((l:Data)=>l.status!=='skipped').length} exercises logged`).join('\n\n')}`;}
      const r=await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text:message.slice(0,4000),...(config.miniAppUrl?{reply_markup:{inline_keyboard:[[{text:'Open Health OS',web_app:{url:config.miniAppUrl}}]]}}:{})}),signal:AbortSignal.timeout(20000)});const result=await r.json();if(!r.ok||!result.ok)throw new Error('Telegram rejected delivery. Check the token, chat ID, bot permissions, and that you started the bot.');return json({ok:true,sent:true});
    }
    if(input.action==='/telegram/gym-entries')return json({entries:[],note:'Log workouts in Health OS; Telegram is an optional delivery channel.'});
    return json({error:'Unknown cloud integration action.'},400);
  }catch(error){return json({error:error instanceof SyntaxError?'Invalid request.':(error as Error).message||'Cloud integration failed.'},400);}
}
Deno.serve(handler);
