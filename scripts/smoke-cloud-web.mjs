import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:10000',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Sign in to Health OS',exact:true}).waitFor({timeout:30000});
  const manifest=await page.evaluate(()=>fetch('/manifest.webmanifest').then(r=>r.json()));
  const title=await page.title();
  if(title!=='Health OS'||manifest.name!=='Health OS'||errors.length)throw new Error(JSON.stringify({title,manifest:manifest.name,errors}));
  await page.screenshot({path:'outputs/health-os-live-sign-in.png'});
  const localApi=await page.request.get('http://localhost:10000/api/health');
  if(localApi.status()!==410)throw new Error('The static web server unexpectedly exposes a local API.');
  const functions={};
  for(const name of ['body-os-ai','body-os-integrations','body-os-email','body-os-email-scheduler']){
    const response=await fetch(`https://lphlihwyrcqgmdiwlvuq.supabase.co/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    functions[name]=response.status;
    if(response.status!==401)throw new Error(`${name} unauthenticated response: ${response.status}`);
  }
  console.log(JSON.stringify({title,manifest:manifest.name,localApi:localApi.status(),functions,errors}));
} finally {await browser.close();}
