import {test} from '@playwright/test';
import {verifyRemoteWorkoutCompletion} from '../../../tests/web/completion-fixture';
test('remote completion clears the matching Android workout draft across reload',async({page})=>verifyRemoteWorkoutCompletion(page,true));
