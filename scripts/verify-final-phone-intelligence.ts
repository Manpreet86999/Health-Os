import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {setup} from '../tests/web/cloud-fixture';
import {mockAgent,send} from '../tests/web/agent-fixture';
const output='output/final-integration';await mkdir(output,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:19327',{timeout:20000});
const context=browser.contexts()[0],page=await context.newPage(),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript('globalThis.__name=(value,name)=>Object.defineProperty(value,"name",{value:name,configurable:true});');
 const cloud=await setup(page,true,true),calls=await mockAgent(page,{domains:['goals'],actions:[{kind:'mission',name:'Phone reviewed goal',objective:'Check synthetic consistency'}]});
 await page.goto('http://127.0.0.1:10002/#Intelligence');
 const welcome=page.getByRole('dialog',{name:'Health Os is here'});if(await welcome.isVisible())await welcome.getByRole('button',{name:'Start exploring',exact:true}).click();
 await expect(page.locator('.android-organized')).toBeVisible();
 await page.getByLabel('Conversation options',{exact:true}).click();await page.getByLabel('Mode',{exact:true}).selectOption('plan');await page.getByLabel('Conversation options',{exact:true}).click();
 await send(page,'Prepare a synthetic consistency goal',false);expect(calls).toHaveLength(0);
 await page.getByLabel('Allow the AI to read this selected context and conversation').check();await page.getByRole('button',{name:'Reason with approved context'}).click();
 const review=page.getByRole('article',{name:'Review Phone reviewed goal',exact:true});await expect(review).toBeVisible();expect(cloud.biological.some(r=>r.payload.type==='goal')).toBe(false);
 await review.getByRole('button',{name:'Approve & apply',exact:true}).click();await expect.poll(()=>cloud.biological.filter(r=>r.payload.type==='goal').length).toBe(1);
 const savedCall=calls.find(c=>c.toolResults?.some((o:any)=>o.name==='action.verify'&&o.data?.success));expect(savedCall).toBeTruthy();
 await page.reload();await expect(page.getByLabel('Ask Health OS Intelligence',{exact:true})).toBeVisible();expect(cloud.biological.filter(r=>r.payload.type==='goal')).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:output+'/phone-intelligence-final.png',fullPage:true});
 await writeFile(output+'/phone-acceptance.json',JSON.stringify({passed:true,physicalDevice:true,transport:'USB Chrome CDP; compiled Android production frontend',userAgent:await page.evaluate(()=>navigator.userAgent),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),provider:'mocked model; live provider qualification is a separate gate',syntheticGoalWrites:1,productionHealthWrites:0,apkInstalled:false,checks:['explicit context consent','native-layout composer','durable goal review','separate action approval','verified receipt reaches next reasoning step','reload without duplicate write','no horizontal overflow','no browser exceptions'],limitations:['Browser preview does not prove Capacitor hardware bridges or a deployed cloud-worker handoff.']},null,2));
 console.log('Physical Android Intelligence UI acceptance passed; no APK installation or real health write.');
}catch(error){await page.screenshot({path:output+'/phone-intelligence-failure.png',fullPage:true}).catch(()=>{});await writeFile(output+'/phone-acceptance.json',JSON.stringify({passed:false,error:(error as Error).message,errors,productionHealthWrites:0,apkInstalled:false},null,2));throw error;}finally{await page.close();await browser.close();}
