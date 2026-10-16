/** Resolve the existing owner credential in Edge memory only. Never return it to a client. */
export async function ownerOpenRouterSecret(base:string,ownerId:string){
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!service)throw new Error('Server credential access is unavailable.');
 const response=await fetch(base+'/rest/v1/rpc/health_ai_provider_secret_get',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_owner:ownerId,p_provider:'openrouter'}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Server-side OpenRouter credential is unavailable.');const value=await response.json();
 if(typeof value!=='string'||!value.trim())throw new Error('The existing OpenRouter credential could not be resolved.');return value;
}
