import {readFile,readdir,writeFile} from 'node:fs/promises';
const built=await readFile('dist/client/index.html','utf8');
const files=[...new Set([...built.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/')))];
files.push('/service-worker.js');
const intelligence=(await readdir('dist/client/assets')).find(p=>/^Intelligence-.*\.js$/.test(p));if(intelligence)files.push('/assets/'+intelligence);
const checks=[];for(const file of files){const response=await fetch('http://localhost:10000'+file);checks.push({file,status:response.status,cache:response.headers.get('cache-control')});if(!response.ok)throw new Error('Installed asset unavailable: '+file);}
await writeFile('output/agentic-validation/installed-http.json',JSON.stringify(checks,null,2));console.log(JSON.stringify({passed:checks.length,allStatus200:checks.every(c=>c.status===200)}));
