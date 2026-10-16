import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {build} from 'esbuild';

// Interactive physical-phone demo of the shipped dialog. No account or cloud requests.
const output=path.resolve('output/phone-report-demo');await fs.mkdir(output,{recursive:true});
const report=await fs.readFile('output/daily-report-validation/report.html','utf8');
const compiled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import * as React from 'react';import{createRoot}from'react-dom/client';import{createReportExperience}from'./src/shared/report-experience';
let acknowledged=false;
const invoke=async body=>{
 if(body.action==='daily-list')return {today:'2026-10-16',serverNow:'2026-10-16T18:30:00Z',jobs:[],reports:acknowledged?[]:[{report_date:'2026-10-15',sent_at:'2026-10-15T17:30:00Z',read_at:null}]};
 if(body.action==='daily-get')return {report:{report_date:'2026-10-15',html:${JSON.stringify(report)}}};
 if(body.action==='daily-read'){acknowledged=true;window.dispatchEvent(new Event('demo-read'));return{ok:true};}
 throw new Error('Demo has no cloud connection');
};
const data={app:{db:{weeks:[],meta:{}},refresh:async()=>{}}};const features=createReportExperience(React,()=>data,invoke);
function Demo(){const[run,setRun]=React.useState(0),[done,setDone]=React.useState(false);React.useEffect(()=>{const mark=()=>setDone(true);window.addEventListener('demo-read',mark);return()=>window.removeEventListener('demo-read',mark);},[]);return React.createElement(React.Fragment,null,React.createElement('main',{className:'demo-app'},React.createElement('header',null,'HEALTH OS'),React.createElement('small',null,'INTERACTIVE PHONE DEMO · SAMPLE DATA'),React.createElement('h1',null,done?'Your review is complete':'Welcome back'),React.createElement('p',null,done?'This is where you return to the app after reading your daily report.':'Your daily report is ready to review.'),React.createElement('button',{onClick:()=>{acknowledged=false;setDone(false);setRun(v=>v+1);}},'Replay report dialog'),React.createElement('p',{className:'demo-hint'},'This demo uses the same report dialog as the deployed app. It does not send email or save anything to your health account.')),React.createElement(features.DailyReportGate,{key:run}));}
createRoot(document.getElementById('root')).render(React.createElement(Demo));
`},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});
await fs.writeFile(path.join(output,'demo.js'),compiled.outputFiles[0].text);
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Health OS · Report dialog demo</title><style>html,body{margin:0;background:#efeee8;font-family:Arial,sans-serif;color:#202124}.demo-app{padding:32px 24px;max-width:600px;margin:auto}.demo-app header{font-weight:bold;color:#6253d6;font-size:22px;margin-bottom:40px}.demo-app small{font-size:10px;letter-spacing:1px;color:#806b40}.demo-app h1{font-size:30px;margin-top:20px}.demo-app p{color:#686863;line-height:1.7}.demo-app button{margin-top:15px;border:0;border-radius:12px;padding:15px 22px;background:#202124;color:white;font-size:15px;font-weight:bold}.demo-hint{font-size:12px;margin-top:30px}</style></head><body><div id="root"></div><script src="/demo.js"></script></body></html>');
http.createServer(async(req,res)=>{const name=new URL(req.url||'/', 'http://demo').pathname;const file=name==='/'?'index.html':name==='/demo.js'?'demo.js':null;if(!file){res.writeHead(404).end();return;}console.log(JSON.stringify({request:name,device:req.socket.remoteAddress}));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(await fs.readFile(path.join(output,file)));}).listen(10176,'0.0.0.0',()=>console.log('Phone report demo ready on port 10176. Sample data only.'));
