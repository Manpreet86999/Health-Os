import { legacyViewIds } from '../../src/client/lib/legacy-view-ids';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { setup } from './cloud-fixture';
import { sections, navigation, routeHref, viewIdentity } from '../../src/client/lib/os-navigation';

const output=path.resolve('outputs/stitch-implementation');
const views=sections.flatMap(section=>navigation[section.name].flatMap(parent=>parent.views.map(view=>({section:section.name,parent:parent.label,...view})))).map(view=>({id:legacyViewIds[viewIdentity(view)] || viewIdentity(view),...view}));
const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

for(const mode of [{name:'desktop-light',width:1440,dark:false},{name:'mobile-light',width:390,dark:false},{name:'desktop-dark',width:1280,dark:true}]) {
  test(`Stitch redesign: all registered views render and fit in ${mode.name}`,async({page})=>{
    // This sweep captures more than 100 lazy-loaded views; keep per-view
    // readiness assertions bounded while allowing time for all screenshots.
    test.setTimeout(600000);
    await page.setViewportSize({width:mode.width,height:1024});
    await setup(page);
    await page.addInitScript(dark=>localStorage.setItem('body-os-theme',dark?'dark':'light'),mode.dark);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/#Today',{waitUntil:'domcontentloaded'});
    await expect(page.locator('.os-content')).toBeVisible();
    const results:any[]=[];
    for(const view of views) {
      await page.evaluate(hash=>{window.location.hash=hash;},routeHref(view.page,view.panel));
      const screen=page.locator(`[data-stitch-screen="${view.id}"]`);
      await expect(screen).toBeVisible({timeout:15000});
      await expect(screen.getByText('Loading view…',{exact:true})).toBeHidden({timeout:15000});
      await expect(screen.getByText('Something went wrong',{exact:true})).toHaveCount(0);
      // Allow chart observers and responsive layout to settle after lazy loading.
      await page.waitForTimeout(100);
      const layout=await page.evaluate(()=>({viewport:window.innerWidth,document:document.documentElement.scrollWidth,overflowing:[...document.querySelectorAll<HTMLElement>('.os-content *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).position!=='fixed'&&el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>({tag:el.tagName,className:el.className,right:Math.round(el.getBoundingClientRect().right)}))}));
      const file=`${slug(view.id)}-${slug(view.section)}-${slug(view.label)}.png`;
      if(mode.name==='desktop-light'||['001','008','022','039','048','069','081','099','101'].includes(view.id)) {
        fs.mkdirSync(path.join(output,mode.name),{recursive:true});
        await page.screenshot({path:path.join(output,mode.name,file),fullPage:true,animations:'disabled'});
      }
      results.push({...view,file:`${mode.name}/${file}`,layout});
      console.log(`${mode.name} ${view.id} ${view.section} / ${view.label}: ${layout.document}/${layout.viewport}`);
    }
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,`${mode.name}.json`),JSON.stringify({mode,results,errors},null,2));
    expect(errors).toEqual([]);
    expect(results.filter(row=>row.layout.document>row.layout.viewport+2),'Views overflowing the viewport').toEqual([]);
  });
}

test('Stitch two-sidebar navigation supports hover, keyboard search, mobile focus and Back',async({page})=>{
  await setup(page);await page.setViewportSize({width:1440,height:1024});await page.goto('/#Today');
  const rail=page.getByRole('navigation',{name:'Health OS domains'});
  await expect(rail).toBeVisible();
  await rail.getByRole('button',{name:'Train',exact:true}).hover();
  await expect(page.getByRole('complementary',{name:'Train pages'})).toBeVisible();
  await rail.getByRole('button',{name:'Eat',exact:true}).click();
  await expect(page.locator('[data-stitch-screen="021"]')).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Eat pages'})).toBeVisible();
  await page.keyboard.press('Control+k');await expect(page.getByRole('dialog',{name:'Health OS command center'})).toBeVisible();await page.keyboard.press('Escape');
  await rail.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.locator('[data-route-identity="Search:overview"]')).toBeVisible();
  await page.goBack();await expect(page.locator('[data-stitch-screen="021"]')).toBeVisible();
  await rail.getByRole('button',{name:'Eat',exact:true}).focus();await page.mouse.move(1300,700);await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await expect(rail).toBeHidden();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  const sidebar=page.getByRole('complementary',{name:'Eat pages'});
  const trigger=page.getByRole('button',{name:'Toggle section navigation',exact:true});
  await trigger.click();await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('link',{name:'Health OS overview',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(sidebar.locator('button').last()).toBeFocused();
  await page.keyboard.press('Escape');await expect(sidebar).toBeHidden();await expect(trigger).toBeFocused();
  await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('dialog',{name:'All pages'}).getByRole('button',{name:'Care Plan',exact:true}).click();
  await expect(page.locator('[data-stitch-screen="072"]')).toBeVisible();
  await trigger.click();
  const care=page.getByRole('complementary',{name:'Care pages'});
  await expect(care).toBeVisible();await care.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.locator('[data-stitch-screen="069"]')).toBeVisible();await expect(care).toBeHidden();
});

test('Stitch workout console keeps editable sets, notes and rest controls across desktop and mobile',async({page})=>{
  await setup(page);await page.setViewportSize({width:1440,height:1024});await page.goto('/#Dashboard');
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Session exercise order'})).toBeVisible();
  const load=page.getByRole('spinbutton',{name:'Set 1 load',exact:true});
  await load.fill('60');await page.getByRole('spinbutton',{name:'Set 1 reps',exact:true}).fill('5');
  expect((await load.boundingBox())!.y).toBeLessThan(900);
  await page.getByRole('textbox',{name:'Exercise notes',exact:true}).fill('Synthetic redesign check');
  for(const width of [1440,1280,1024,768,390]) {
    await page.setViewportSize({width,height:1024});
    await expect(load).toBeVisible();await expect(load).toHaveValue('60');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    fs.mkdirSync(path.join(output,'workout'),{recursive:true});
    await page.screenshot({path:path.join(output,'workout',`active-${width}.png`),fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Minimize workout',exact:true}).click();
  await page.getByRole('button',{name:/Resume saved workout/}).click();
  await expect(load).toHaveValue('60');await expect(page.getByRole('textbox',{name:'Exercise notes',exact:true})).toHaveValue('Synthetic redesign check');
});
