import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export function verifyApkStorage(file) {
  const bytes=fs.readFileSync(file);
  let end=bytes.length-22;
  while(end>=Math.max(0,bytes.length-65557)&&bytes.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0||bytes.readUInt32LE(end)!==0x06054b50)throw new Error('ZIP directory not found');
  const entries=bytes.readUInt16LE(end+10);
  let offset=bytes.readUInt32LE(end+16),resources;
  for(let i=0;i<entries;i++){
    if(bytes.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP directory');
    const nameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32);
    const name=bytes.toString('utf8',offset+46,offset+46+nameLength);
    if(name==='resources.arsc'){
      const method=bytes.readUInt16LE(offset+10),local=bytes.readUInt32LE(offset+42);
      if(bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid resource ZIP header');
      const dataOffset=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
      if(method!==0)throw new Error('Android requires resources.arsc to use ZIP STORED (method 0)');
      if(dataOffset%4!==0)throw new Error('Android requires resources.arsc to be aligned to 4 bytes');
      resources={method,dataOffset,alignment:4};
    }
    offset+=46+nameLength+extraLength+commentLength;
  }
  if(!resources)throw new Error('Resource table missing');
  return resources;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  console.log(JSON.stringify(verifyApkStorage(process.argv[2])));
}
