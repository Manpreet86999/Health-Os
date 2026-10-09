import {test,expect} from '@playwright/test';
import {setup} from '../../../tests/web/cloud-fixture';
import {nativeFixture} from './native-fixture';
test.use({viewport:{width:360,height:744},hasTouch:true,isMobile:true});
test('readiness sheet supports vertical touch scrolling without changing cards',async({page})=>{
 const cloud=await setup(page);cloud.records.splice(0,cloud.records.length,...cloud.records.filter(r=>r.entity_type!=='readiness'));await nativeFixture(page);
 await page.goto('/#Today');await expect(page.locator('.os-content')).toBeVisible();
 await page.getByRole('button',{name:'Check in',exact:true}).click();
 const modal=page.getByRole('dialog');await expect(modal).toBeVisible();
 await modal.evaluate(el=>{el.scrollTop=0;});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:610}]});
 for(let step=1;step<=10;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:610-step*25}]});await page.waitForTimeout(20);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>modal.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
 await expect(modal.locator('.flash-meta')).toContainText('1 / 9');
 const down=await modal.evaluate(el=>el.scrollTop);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:300}]});
 for(let step=1;step<=10;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:300+step*25}]});await page.waitForTimeout(20);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>modal.evaluate(el=>el.scrollTop)).toBeLessThan(down);
});
