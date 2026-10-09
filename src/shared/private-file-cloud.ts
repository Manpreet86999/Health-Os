import {createTimeoutSignal,type CloudConfig,type CloudSession} from './cloud.js';
import {PRIVATE_ATTACHMENT_BUCKET,PRIVATE_ATTACHMENT_MAX_BYTES,privateBlobSchema,privateChecksum,privateObjectKey,type PrivateBlob} from './private-attachments.js';

function endpoint(config:CloudConfig,session:CloudSession,blob:PrivateBlob,read=false):string {
  const url=new URL(config.url);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||!config.publishableKey)throw new Error('Use a secure Supabase project URL for private files.');
  return `${url.origin}/storage/v1/object/${read?'authenticated/':''}${PRIVATE_ATTACHMENT_BUCKET}/${privateObjectKey(session.uid,blob)}`;
}
function headers(config:CloudConfig,session:CloudSession):Record<string,string>{return {apikey:config.publishableKey,Authorization:`Bearer ${session.accessToken}`};}
export async function downloadPrivateFile(config:CloudConfig,session:CloudSession,input:PrivateBlob):Promise<Uint8Array> {
  const blob=privateBlobSchema.parse(input);
  const response=await fetch(endpoint(config,session,blob,true),{headers:headers(config,session),redirect:'error',cache:'no-store',signal:createTimeoutSignal(90000)});
  if(!response.ok)throw new Error(`Private-file download failed (${response.status}). Local originals remain saved.`);
  const length=response.headers.get('content-length');
  if(length!==null&&!response.headers.has('content-encoding')&&Number(length)!==blob.size)throw new Error('Private-file size differs from its descriptor.');
  if(!response.body)throw new Error('Private original is empty.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>blob.size||size>PRIVATE_ATTACHMENT_MAX_BYTES)throw new Error('Private original exceeds its expected size.');chunks.push(value);}
  } catch(error){await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if(size!==blob.size||await privateChecksum(bytes)!==blob.sha256)throw new Error('Private-file checksum differs from its descriptor.');
  return bytes;
}
export async function uploadPrivateFile(config:CloudConfig,session:CloudSession,input:PrivateBlob,bytes:Uint8Array):Promise<void> {
  const blob=privateBlobSchema.parse(input);
  if(bytes.byteLength!==blob.size||await privateChecksum(bytes)!==blob.sha256)throw new Error('The local original differs from its descriptor.');
  const response=await fetch(endpoint(config,session,blob),{method:'POST',headers:{...headers(config,session),'Content-Type':blob.mime,'x-upsert':'false'},body:Uint8Array.from(bytes),redirect:'error',cache:'no-store',signal:createTimeoutSignal(90000)});
  if(response.ok)return;
  if(response.status===400||response.status===409){await downloadPrivateFile(config,session,blob);return;}
  throw new Error(`Private-file upload failed (${response.status}). Local originals remain saved.`);
}
