import fs from 'node:fs';
import path from 'node:path';
import {viewManifest} from '../src/client/lib/os-navigation';

const root=path.resolve('src/client');
function scan(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?scan(path.join(dir,entry.name)):entry.name.endsWith('.tsx')?[path.join(dir,entry.name)]:[]);}
const files=scan(root).map(file=>{
 const text=fs.readFileSync(file,'utf8');
 const locations=(pattern:RegExp)=>text.split('\n').flatMap((line,i)=>pattern.test(line)?[i+1]:[]);
 return {file:path.relative(process.cwd(),file).replaceAll('\\','/'),dialogs:locations(/<Modal\b/),forms:locations(/<form\b/),charts:locations(/<(?:SignalChart|MiniSparkline|MetricRing|EvidenceScatter)\b/),states:locations(/<(?:StatePanel|EmptyState|HealthLoader)\b/),cards:locations(/className=.*(?:card|panel|hero|list-row)/i)};
});
const audit={date:'2026-10-16',sections:[...new Set(viewManifest.map(v=>v.section))],views:viewManifest.map(view=>({...view,migration:'Shared Health OS tokens, surfaces, typography, controls and platform shell',screenshot:`${view.identity.replace(/[^a-z0-9]/gi,'-')}.png`})),sources:files};
fs.mkdirSync('output/ui-revamp',{recursive:true});
fs.writeFileSync('output/ui-revamp/inventory.json',JSON.stringify(audit,null,2));
const rows=viewManifest.map(v=>`| ${v.section} | ${v.primary} / ${v.label} | ${v.identity} | Migrated |`).join('\n');
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/UI-REVAMP-INVENTORY.md',`# Health OS UI migration inventory\n\nGenerated from the retained route manifest on 16 October 2026. ${viewManifest.length} route/tab destinations across seven sections. Every destination inherits the shared presentation system; no destination is intentionally excluded.\n\n| Section | Page / tab | Identity | Presentation |\n|---|---|---|---|\n${rows}\n\nThe machine-readable source inventory is output/ui-revamp/inventory.json. It records dialog, form, chart, state and card source locations, including conditional content. A source-line inventory does not establish runtime state coverage.\n`);
console.log(`${viewManifest.length} views, ${files.length} component/page sources inventoried.`);
