import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import type { WorkerCloud } from '../src/server/worker/cloud.js';
import type { WorkerJob } from '../src/shared/worker-jobs.js';

const directory=path.resolve('scratch/worker-smoke');mkdirSync(directory,{recursive:true});
process.env.BODY_OS_DATA_DIR=directory;
process.env.HEALTH_OS_RESEARCH_RUN_DIR=path.join(directory,'experiments');
const {executeJob,disposeHandlers}=await import('../src/server/worker/handlers.js');
const owner='11111111-1111-4111-8111-111111111111';
const job=(operation:WorkerJob['operation'],input:any):WorkerJob=>({id:'synthetic',user_id:owner,operation,input,status:'running',result:null,error:null,attempts:1,created_at:new Date().toISOString()});
const cloud={owner} as WorkerCloud;
try{
  const stats=await executeJob(job('research.statistics',{values:[1,2,3,4,5]}),cloud);assert.equal(stats.result.mean,3);
  console.log('Synthetic worker statistics passed.');
  const transcript=await executeJob(job('voice.transcribe',{base64:readFileSync(path.join(directory,'speech.wav')).toString('base64')}),cloud);assert.match(transcript.text,/water/i);assert.match(transcript.text,/weight|kilogram/i);
  console.log('Synthetic worker Whisper speech passed.');
  const {default:puppeteer}=await import('puppeteer');
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.HEALTH_OS_BROWSER||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
  let image:Uint8Array;
  try{const page=await browser.newPage();await page.setViewport({width:1000,height:220});await page.setContent('<html><body style="margin:30px;background:white;color:black;font:32px Arial">Hemoglobin 14 g/dL 12-16</body></html>');image=await page.screenshot({type:'png'});}finally{await browser.close();}
  const report={id:'synthetic-ocr',revision:1,collectedAt:'2026-10-07T00:00:00Z',laboratory:'Synthetic lab',originalStorage:{sha256:'a'.repeat(64)}};
  const request=async(target:string)=>target.startsWith('rest/')?[{payload:report,revision:1}]:{name:'synthetic.png',mime:'image/png',base64:Buffer.from(image).toString('base64')};
  const extracted=await executeJob(job('medical.extract',{reportId:'synthetic-ocr'}),{owner,request} as unknown as WorkerCloud);assert.match(extracted.report.narrative,/Hemoglobin/i);assert.equal(extracted.report.results[0].value,14);assert.equal(extracted.reportRevision,1);
  console.log('PASS: worker NumPy/SciPy statistics, real Whisper speech and Tesseract OCR on synthetic fixtures; Puppeteer screenshot succeeded.');
}finally{disposeHandlers();}
