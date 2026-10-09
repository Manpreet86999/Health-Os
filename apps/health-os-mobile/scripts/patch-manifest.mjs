import fs from 'node:fs';
// Only change the version attributes in Android's compiled XML. All sizes stay fixed.
const file=process.argv[2], xml=fs.readFileSync(file);
const versionCode=Number(process.argv[3]||2026100901);
const versionName=process.argv[4]||'5.2.1';
if(!/^\d\.\d\.\d$/.test(versionName))throw new Error('Version name must retain the five-character manifest string length');
if(!Number.isSafeInteger(versionCode)||versionCode<=2026100802||versionCode>2147483647)throw new Error('Invalid versionCode');
let strings=[], stringPositions=[], utf8=false, code=false, name=false;
const length8=position=>xml[position]&128 ? [((xml[position]&127)<<8)|xml[position+1],2] : [xml[position],1];
for(let at=xml.readUInt16LE(2);at<xml.length;){
  const type=xml.readUInt16LE(at),size=xml.readUInt32LE(at+4);
  if(size<8||at+size>xml.length)throw new Error('Invalid binary XML chunk');
  if(type===1){
    const count=xml.readUInt32LE(at+8),start=at+xml.readUInt32LE(at+20),header=xml.readUInt16LE(at+2);
    utf8=Boolean(xml.readUInt32LE(at+16)&0x100);
    for(let index=0;index<count;index++){
      let position=start+xml.readUInt32LE(at+header+index*4);
      if(utf8){position+=length8(position)[1];const [length,prefix]=length8(position);position+=prefix;strings.push(xml.toString('utf8',position,position+length));}
      else {const length=xml.readUInt16LE(position);if(length&0x8000)throw new Error('Unexpected long manifest string');position+=2;strings.push(xml.toString('utf16le',position,position+length*2));}
      stringPositions.push(position);
    }
  }
  if(type===0x102&&strings[xml.readUInt32LE(at+20)]==='manifest'){
    const start=at+16+xml.readUInt16LE(at+24),stride=xml.readUInt16LE(at+26),count=xml.readUInt16LE(at+28);
    for(let index=0;index<count;index++){
      const attribute=start+index*stride,key=strings[xml.readUInt32LE(attribute+4)];
      if(key==='versionCode'){
        if(xml[attribute+15]!==0x10||xml.readUInt32LE(attribute+16)!==2026100802)throw new Error('Unexpected reference versionCode');
        xml.writeUInt32LE(versionCode,attribute+16);code=true;
      }
      if(key==='versionName'){
        if(xml[attribute+15]!==3)throw new Error('Expected string versionName');
        const index=xml.readUInt32LE(attribute+16);
        if(strings[index]!=='5.2.0')throw new Error('Unexpected reference versionName');
        xml.write(versionName,stringPositions[index],utf8?'utf8':'utf16le');name=true;
      }
    }
  }
  at+=size;
}
if(!code||!name)throw new Error('Both manifest version attributes must be patched');
fs.writeFileSync(file,xml);
console.log(`Manifest version: ${versionName} / ${versionCode}. Package and other attributes retained.`);
