import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const project='lphlihwyrcqgmdiwlvuq';
const sqlText=(value:string)=>"'"+value.replaceAll("'","''")+"'";
/** Authenticated CLI executes SQL; neither management keys nor Vault values leave the server. */
export async function qualificationSql(query:string):Promise<any[]> {
 const dir='output/production-qualification-20261015/transport';await mkdir(dir,{recursive:true});
 const file=dir+'/'+randomUUID()+'.sql';await writeFile(file,query);
 try{return await new Promise((resolve,reject)=>{
  const child=spawn('cmd.exe',['/d','/s','/c','npx --yes supabase@2.121.0 db query --linked --project-ref '+project+' --output json --file '+file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.resume();
  const timer=setTimeout(()=>{child.kill();reject(new Error('Qualification SQL transport timed out.'));},45000);
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Qualification SQL transport could not start.'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Qualification SQL transport failed; no credential output retained.'));try{const start=stdout.indexOf('{');const parsed=JSON.parse(stdout.slice(start));if(!Array.isArray(parsed.rows))throw new Error();resolve(parsed.rows);}catch{reject(new Error('Qualification SQL response was not a row set.'));}});
 });}finally{await unlink(file).catch(()=>{});}
}

export function installQualificationServerTransport(owner:string){
 if(!/^[0-9a-f-]{36}$/i.test(owner))throw new Error('Invalid benchmark owner.');
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  if(String(input)!=='https://openrouter.ai/api/v1/chat/completions')return original(input,init);
  const body=JSON.parse(String(init?.body));
  if(!['deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash'].includes(body.model))throw new Error('Benchmark model outside fixed production policy.');
  const timeout=65000,start=Date.now();
  const rows=await qualificationSql('select net.http_post(url:=\'https://openrouter.ai/api/v1/chat/completions\',headers:=jsonb_build_object(\'Content-Type\',\'application/json\',\'X-Title\',\'Health OS Qualification\',\'Authorization\',\'Bearer \'||(select s.decrypted_secret from public.health_ai_provider_secret p join vault.decrypted_secrets s on s.id=p.secret_id where p.user_id='+sqlText(owner)+'::uuid and p.provider=\'openrouter\')),body:='+sqlText(JSON.stringify(body))+'::jsonb,timeout_milliseconds:='+timeout+') as request_id;');
  const id=rows[0]?.request_id;if(!Number.isSafeInteger(id))throw new Error('Server provider request was not queued.');
  while(Date.now()-start<80000){
   init?.signal?.throwIfAborted();
   const response=await qualificationSql('select status_code,timed_out,error_msg,content from net._http_response where id='+id+';');
   if(response.length){const r=response[0];if(r.timed_out||!r.status_code)throw Object.assign(new Error('Server-side provider/network timeout.'),{name:'TimeoutError'});return new Response(r.content||'{}',{status:r.status_code,headers:{'Content-Type':'application/json'}});}
   await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw Object.assign(new Error('Server-side provider/network timeout.'),{name:'TimeoutError'});
 };
 return 'server-vault-qualification-transport';
}
