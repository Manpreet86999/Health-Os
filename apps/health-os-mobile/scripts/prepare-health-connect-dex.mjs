import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv[3];
const output=path.join(root,'apps/health-os-mobile/health-connect-native/build/dex-input');fs.mkdirSync(output,{recursive:true});
// Preserve the original DEX exactly; only add classes not already defined by that APK.
export function dexClasses(b){
 const strings=[];for(let i=0;i<b.readUInt32LE(56);i++){let p=b.readUInt32LE(b.readUInt32LE(60)+i*4);while(b[p++]&128){}let end=p;while(b[end])end++;strings.push(b.toString('utf8',p,end));}
 const types=[];for(let i=0;i<b.readUInt32LE(64);i++)types.push(strings[b.readUInt32LE(b.readUInt32LE(68)+i*4)]);
 const classes=[];for(let i=0;i<b.readUInt32LE(96);i++)classes.push(types[b.readUInt32LE(b.readUInt32LE(100)+i*32)]);return classes;
}
const base=new AdmZip(baseline),existing=new Set(),dexNames=[];
for(const entry of base.getEntries())if(/^classes\d*\.dex$/.test(entry.entryName)){dexNames.push(entry.entryName);dexClasses(entry.getData()).forEach(c=>existing.add(c));}
const baselineCount=existing.size;let added=0,skipped=0;const zip=new AdmZip();
function addJar(data){for(const entry of new AdmZip(data).getEntries()){if(!entry.entryName.endsWith('.class')||entry.entryName==='module-info.class')continue;const name='L'+entry.entryName.slice(0,-6)+';';if(existing.has(name)){skipped++;continue;}existing.add(name);zip.addFile(entry.entryName,entry.getData());added++;}}
const native=path.join(root,'apps/health-os-mobile/health-connect-native/build');
const bridge=new AdmZip(path.join(native,'outputs/aar/health-os-health-connect-release.aar'));addJar(bridge.getEntry('classes.jar').getData());
for(const file of fs.readdirSync(path.join(native,'runtime')).sort()){
 const target=path.join(native,'runtime',file);
 if(file.endsWith('.jar'))addJar(fs.readFileSync(target));
 if(file.endsWith('.aar')){const archive=new AdmZip(target);for(const entry of archive.getEntries())if(entry.entryName==='classes.jar'||/^libs\/.*\.jar$/.test(entry.entryName))addJar(entry.getData());}
}
const jar=path.join(output,'health-connect-runtime.jar');zip.writeZip(jar);
fs.writeFileSync(path.join(native,'native-classes.json'),JSON.stringify({baselineClasses:baselineCount,addedClasses:added,duplicatesExcluded:skipped,baselineDex:dexNames},null,2));
console.log(`Preserved ${baselineCount} original classes; ${added} native integration classes, ${skipped} duplicates excluded.`);
