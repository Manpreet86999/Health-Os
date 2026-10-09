import {expect,type Page} from '@playwright/test';
import {setup} from './cloud-fixture';
export async function verifyRemoteWorkoutCompletion(page:Page,native=false,unrelated=false){
 const cloud=await setup(page,true,true);if(native){const {nativeFixture}=await import('../../apps/health-os-mobile/tests/native-fixture');await nativeFixture(page);}
 await page.goto('/#Dashboard');await expect(page.locator('.os-content')).toBeVisible();await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect.poll(()=>cloud.records.find(row=>row.entity_type==='workoutDraft'&&!row.deleted_at)?.payload.draft?.id).toBeTruthy();
 const draftRow=cloud.records.find(row=>row.entity_type==='workoutDraft'&&!row.deleted_at)!,draft=structuredClone(draftRow.payload.draft);
 await page.goto('/#Today');await expect(page.getByRole('button',{name:/^(Resume workout|Continue workout)$/}).first()).toBeVisible();
 cloud.add('session',unrelated?'different-session':draft.id,{...draft,...(unrelated?{weekId:'another-plan'}:{}),status:'finished',createdAt:new Date().toISOString(),endedAt:new Date().toISOString(),logs:[]});
 if(!unrelated){draftRow.deleted_at=new Date().toISOString();draftRow.change_version=10000;draftRow.revision++;}
 await page.evaluate(()=>window.dispatchEvent(new Event('body-os-cloud-refresh')));
 if(unrelated){await expect(page.getByRole('button',{name:/^(Resume workout|Continue workout)$/}).first()).toBeVisible();return;}
 await expect(page.getByRole('button',{name:/^(Resume workout|Continue workout)$/})).toHaveCount(0);
 await page.waitForTimeout(1200);
 expect(cloud.records.filter(row=>row.entity_type==='workoutDraft'&&!row.deleted_at&&row.payload.draft?.id===draft.id)).toHaveLength(0);
 await page.reload();await expect(page.locator('.os-content')).toBeVisible();await expect(page.getByRole('button',{name:/^(Resume workout|Continue workout)$/})).toHaveCount(0);
}
