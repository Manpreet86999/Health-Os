import fs from 'node:fs';
// Append native components to compiled XML without changing the baseline resource table.
const file=process.argv[2], input=fs.readFileSync(file), NONE=0xffffffff;
const chunks=[];let strings=[],resourceIds=[],poolIndex=-1,mapIndex=-1;
for(let at=input.readUInt16LE(2);at<input.length;){
 const type=input.readUInt16LE(at),size=input.readUInt32LE(at+4),chunk=Buffer.from(input.subarray(at,at+size));
 if(size<8||at+size>input.length)throw Error('Invalid manifest chunk');
 if(type===1){
  poolIndex=chunks.length; const count=chunk.readUInt32LE(8),start=chunk.readUInt32LE(20),header=chunk.readUInt16LE(2),utf8=!!(chunk.readUInt32LE(16)&256);
  if(chunk.readUInt32LE(12))throw Error('Styled manifest string pool unsupported');
  const len8=p=>chunk[p]&128?[((chunk[p]&127)<<8)|chunk[p+1],2]:[chunk[p],1];
  for(let i=0;i<count;i++){let p=start+chunk.readUInt32LE(header+i*4);if(utf8){p+=len8(p)[1];let [n,k]=len8(p);strings.push(chunk.toString('utf8',p+k,p+k+n));}else{let n=chunk.readUInt16LE(p);if(n&32768)throw Error('Long string unsupported');strings.push(chunk.toString('utf16le',p+2,p+2+n*2));}}
 }else if(type===0x180){mapIndex=chunks.length;for(let p=8;p<chunk.length;p+=4)resourceIds.push(chunk.readUInt32LE(p));}
 if(type===0x102&&strings[chunk.readUInt32LE(20)]==='uses-sdk'){
  const count=chunk.readUInt16LE(28),start=16+chunk.readUInt16LE(24),stride=chunk.readUInt16LE(26);
  for(let i=0;i<count;i++){const p=start+i*stride;if(strings[chunk.readUInt32LE(p+4)]==='minSdkVersion'&&chunk[p+15]===0x10&&chunk.readUInt32LE(p+16)<26)chunk.writeUInt32LE(26,p+16);}
 }
 chunks.push(chunk);at+=size;
}
const index=s=>{let i=strings.indexOf(s);if(i<0){i=strings.length;strings.push(s);}return i;};
const android=index('http://schemas.android.com/apk/res/android');
const ids={name:0x01010003,permission:0x01010006,enabled:0x0101000e,exported:0x01010010,targetActivity:0x01010202};
function attr(key,value){const i=index(key);resourceIds[i]=ids[key];return {ns:android,name:i,value:typeof value==='boolean'?NONE:index(value),type:typeof value==='boolean'?0x12:3,data:typeof value==='boolean'?(value?NONE:0):index(value)};}
function start(name,attributes=[]){
 attributes.sort((a,b)=>(resourceIds[a.name]||0)-(resourceIds[b.name]||0));
 const b=Buffer.alloc(36+attributes.length*20);b.writeUInt16LE(0x102,0);b.writeUInt16LE(16,2);b.writeUInt32LE(b.length,4);b.writeUInt32LE(1,8);b.writeUInt32LE(NONE,12);b.writeUInt32LE(NONE,16);b.writeUInt32LE(index(name),20);b.writeUInt16LE(20,24);b.writeUInt16LE(20,26);b.writeUInt16LE(attributes.length,28);
 attributes.forEach((a,i)=>{let p=36+i*20;b.writeUInt32LE(a.ns,p);b.writeUInt32LE(a.name,p+4);b.writeUInt32LE(a.value,p+8);b.writeUInt16LE(8,p+12);b[p+15]=a.type;b.writeUInt32LE(a.data,p+16);});return b;
}
function end(name){const b=Buffer.alloc(24);b.writeUInt16LE(0x103,0);b.writeUInt16LE(16,2);b.writeUInt32LE(24,4);b.writeUInt32LE(1,8);b.writeUInt32LE(NONE,12);b.writeUInt32LE(NONE,16);b.writeUInt32LE(index(name),20);return b;}
const leaf=(name,attributes)=>[start(name,attributes),end(name)];
const perms=['READ_STEPS','READ_SLEEP','READ_HEART_RATE','READ_RESTING_HEART_RATE','READ_HEART_RATE_VARIABILITY','READ_OXYGEN_SATURATION','READ_WEIGHT','READ_ACTIVE_CALORIES_BURNED','READ_HEALTH_DATA_IN_BACKGROUND'];
const rootNodes=perms.flatMap(name=>leaf('uses-permission',[attr('name','android.permission.health.'+name)]));
rootNodes.push(...leaf('uses-permission',[attr('name','android.permission.RECEIVE_BOOT_COMPLETED')]),start('queries'),...leaf('package',[attr('name','com.google.android.apps.healthdata')]),end('queries'));
const privacy='app.healthos.nativebridge.HealthPrivacyActivity';
const appNodes=[start('activity',[attr('name',privacy),attr('exported',true)]),start('intent-filter'),...leaf('action',[attr('name','androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE')]),end('intent-filter'),end('activity'),
 start('activity-alias',[attr('name','app.healthos.nativebridge.HealthPermissionsUsageActivity'),attr('targetActivity',privacy),attr('permission','android.permission.START_VIEW_PERMISSION_USAGE'),attr('exported',true)]),start('intent-filter'),...leaf('action',[attr('name','android.intent.action.VIEW_PERMISSION_USAGE')]),...leaf('category',[attr('name','android.intent.category.HEALTH_PERMISSIONS')]),end('intent-filter'),end('activity-alias'),
 ...leaf('service',[attr('name','app.healthos.nativebridge.HealthConnectJob'),attr('permission','android.permission.BIND_JOB_SERVICE'),attr('exported',true)]),
 // Required by connect-client's own manifest: the provider binds back to this SDK service.
 start('service',[attr('name','androidx.health.platform.client.impl.sdkservice.HealthDataSdkService'),attr('enabled',true),attr('exported',true)]),start('intent-filter'),...leaf('action',[attr('name','androidx.health.platform.client.ACTION_BIND_SDK_SERVICE')]),end('intent-filter'),end('service')];
// Original nodes refer to the original string indices. New indices are appended only.
const offsets=[],data=[];let pos=0;
for(const str of strings){const bytes=Buffer.from(str,'utf16le'),b=Buffer.alloc(bytes.length+4);if(str.length>=32768)throw Error('Manifest string too long');b.writeUInt16LE(str.length,0);bytes.copy(b,2);offsets.push(pos);data.push(b);pos+=b.length;}
const poolSize=Math.ceil((28+strings.length*4+pos)/4)*4,pool=Buffer.alloc(poolSize);pool.writeUInt16LE(1,0);pool.writeUInt16LE(28,2);pool.writeUInt32LE(poolSize,4);pool.writeUInt32LE(strings.length,8);pool.writeUInt32LE(28+strings.length*4,20);offsets.forEach((v,i)=>pool.writeUInt32LE(v,28+i*4));Buffer.concat(data).copy(pool,28+strings.length*4);chunks[poolIndex]=pool;
const map=Buffer.alloc(8+strings.length*4);map.writeUInt16LE(0x180,0);map.writeUInt16LE(8,2);map.writeUInt32LE(map.length,4);resourceIds.forEach((v,i)=>map.writeUInt32LE(v||0,8+i*4));chunks[mapIndex]=map;
let insertedRoot=false,insertedApp=false;const result=[];
for(const chunk of chunks){const type=chunk.readUInt16LE(0);if(type===0x102&&strings[chunk.readUInt32LE(20)]==='application'){result.push(...rootNodes);insertedRoot=true;}if(type===0x103&&strings[chunk.readUInt32LE(20)]==='application'){result.push(...appNodes);insertedApp=true;}result.push(chunk);}
if(!insertedRoot||!insertedApp)throw Error('Application boundary not found');
const header=Buffer.from(input.subarray(0,8)),output=Buffer.concat([header,...result]);output.writeUInt32LE(output.length,4);fs.writeFileSync(file,output);
console.log('Added read-only Health Connect permissions, privacy activity and scheduled read service.');
