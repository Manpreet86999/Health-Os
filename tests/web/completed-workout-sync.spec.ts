import {test} from '@playwright/test';
import {verifyRemoteWorkoutCompletion} from './completion-fixture';
test('phone completion clears the same workout on web and never resurrects its draft',async({page})=>verifyRemoteWorkoutCompletion(page));
test('completion of a different workout preserves the current unsaved draft',async({page})=>verifyRemoteWorkoutCompletion(page,false,true));
