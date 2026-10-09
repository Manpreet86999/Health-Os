import {test} from '@playwright/test';
import {verifyTodayPods} from '../../../tests/web/today-pods-fixture';
test('Android Today footer supports Pods create, invite, confirmed join and shared progress',async({page})=>verifyTodayPods(page,true));
