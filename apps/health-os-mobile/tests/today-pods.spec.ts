import {test} from '@playwright/test';
import {verifyTodayPods} from '../../../tests/web/today-pods-fixture';
for(const version of [1,2] as const)test(`Recovered Android v${version}: compact Pods, check-in, undo and full workspace`,async({page})=>verifyTodayPods(page,true,version));
