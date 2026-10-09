import test from 'node:test';
import assert from 'node:assert/strict';
import { platformWorkspace } from './workspaces.js';
import { toOwnerRecord, workspaceForEntity } from './platform.js';

test('platform records classify existing training, care and core data without changing payloads',()=>{
  assert.equal(workspaceForEntity('session'),'training');
  assert.equal(workspaceForEntity('skinLog'),'care');
  assert.equal(workspaceForEntity('healthReading'),'core');
  const record=toOwnerRecord({id:'skin-1',entityType:'skinLog',payload:{date:'2026-09-13'},updatedAt:'2026-09-13T10:00:00.000Z',revision:1,deviceId:'web'});
  assert.equal(record.workspace,'care');
  assert.equal(record.payloadVersion,1);
  assert.equal(platformWorkspace('training')?.home,'Dashboard');
  assert.ok(platformWorkspace('care')?.entityTypes.includes('skinRoutine'));
});
