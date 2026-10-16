// Edge-runtime embeddings keep user summaries off commercial providers.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const domains=new Set(['general','train','nutri','recover','body','care']);
const model='gte-small',version='supabase-edge-v1';
let session: any;
async function embed(text:string):Promise<number[]> {
  session ||= new Supabase.ai.Session(model);
  const vector=await session.run(text,{mean_pool:true,normalize:true});
  if(!Array.isArray(vector)||vector.length!==384||!vector.every(Number.isFinite))throw new Error('Embedding unavailable');
  return vector;
}
export async function handler(request:Request):Promise<Response>{
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  try {
    const base=Deno.env.get('SUPABASE_URL')!,headers={apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:request.headers.get('authorization')||'','Content-Type':'application/json'};
    const auth=await fetch(`${base}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return reply({error:'Sign in to Health OS.'},401);
    const user=await auth.json();if(!user.id||user.is_anonymous)return reply({error:'A registered account is required.'},401);
    const raw=await request.text();if(raw.length>5000)return reply({error:'Input is too large.'},413);
    const input=JSON.parse(raw),action=input.action;
    const rest=async(path:string,method='GET',body?:unknown)=>{
      const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{...headers,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Memory operation failed');
      return response.status===204?null:response.json();
    };
    const select='id,summary,domain,source_id,confidence,created_at';
    if(action==='list')return reply(await rest(`health_memory_item?user_id=eq.${user.id}&valid_to=is.null&superseded_by=is.null&select=${select}&order=created_at.desc&limit=100`));
    if(action==='reset'){const changed=await rest(`health_memory_item?user_id=eq.${user.id}&valid_to=is.null`,'PATCH',{valid_to:new Date().toISOString()});return reply({ok:true,operation:'soft_expiration',permanent:false,expired:changed.length,sourceRecordsAffected:false});}
    if(action==='forget'){
      if(typeof input.id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.id))return reply({error:'Invalid memory ID.'},400);
      const changed=await rest(`health_memory_item?user_id=eq.${user.id}&id=eq.${input.id}&valid_to=is.null`,'PATCH',{valid_to:new Date().toISOString()});return reply({ok:true,operation:'soft_expiration',permanent:false,expired:changed.length,sourceRecordsAffected:false});
    }
    if(action==='permanent_delete')return reply({error:'Permanent learned-memory erasure is a separate, explicitly confirmed operation. It is not enabled by reset or forget, and is not available in this preservation-only deployment.',code:'permanent_deletion_not_enabled',permanent:false},409);
    if(!domains.has(input.domain))return reply({error:'Choose a supported memory domain.'},400);
    if(action==='remember'){
      if(typeof input.summary!=='string'||!input.summary.trim()||input.summary.length>1000||typeof input.sourceId!=='string'||input.sourceId.length>200||!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1)return reply({error:'Invalid memory.'},400);
      // Compute before inserting, then atomically commit source and derivative with invoker RLS.
      const embedding=await embed(input.summary);
      return reply((await rest('rpc/health_memory_remember','POST',{p_summary:input.summary.trim(),p_domain:input.domain,p_source_id:input.sourceId,p_confidence:input.confidence,p_embedding:JSON.stringify(embedding),p_model:model,p_version:version}))[0]);
    }
    if(action==='retrieve'){
      if(typeof input.query!=='string'||!input.query.trim()||input.query.length>1000)return reply({error:'Invalid query.'},400);
      return reply(await rest('rpc/health_memory_match','POST',{query_embedding:JSON.stringify(await embed(input.query)),purpose_domain:input.domain,embedding_model:model,embedding_version:version,match_count:5}));
    }
    return reply({error:'Unsupported memory action.'},400);
  }catch{return reply({error:'Memory is temporarily unavailable. Your health records are unaffected.'},503);}
}
Deno.serve(handler);
