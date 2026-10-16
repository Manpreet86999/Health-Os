import { createWriteStream } from 'node:fs';
import { readFile, rename, mkdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [uri,destination,digest]=process.argv.slice(2);
const url=new URL(uri),root=path.resolve('runtime'),target=path.resolve(destination);
if(url.protocol!=='https:'||!['github.com','huggingface.co'].includes(url.hostname)||!target.startsWith(root+path.sep)||!/^[a-f0-9]{64}$/.test(digest))throw new Error('Invalid runtime download target.');
await mkdir(path.dirname(target),{recursive:true});
try {if(createHash('sha256').update(await readFile(target)).digest('hex')===digest){console.log('Runtime checksum verified.');process.exit(0);}}catch{}
const temporary=target+'.download';
try {
  const response=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!response.ok||!response.body)throw new Error('Runtime download failed.');
  await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
  if(createHash('sha256').update(await readFile(temporary)).digest('hex')!==digest)throw new Error('Runtime checksum mismatch.');
  await rename(temporary,target);console.log('Runtime downloaded and checksum verified.');
}finally{await rm(temporary,{force:true});}
