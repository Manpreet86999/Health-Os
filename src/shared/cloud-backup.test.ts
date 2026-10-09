import test from 'node:test';
import assert from 'node:assert/strict';
import {portableRecords,backupRecords,compareBackup} from './cloud-backup.js';
import type {CloudRecord} from './cloud.js';
const record=(entityType:CloudRecord['entityType'],id:string,payload:Record<string,unknown>):CloudRecord=>({entityType,id,payload,revision:1,updatedAt:'2026-10-07T00:00:00Z',deviceId:'test'});
test('cloud backup preserves medical and photo records while excluding credentials',()=>{
  const records=portableRecords([record('medicalReport','report',{title:'Lab report'}),record('carePhoto','photo',{preview:{sha256:'a'.repeat(64)}}),record('sharedPreferences','shared-preferences',{units:'kg',openRouterApiKey:'secret',telegramBotToken:'secret',googleClientSecret:'secret'}),record('encryptedVault','vault',{cipher:'secret'})]);
  assert.equal(records.length,3);assert.equal(records[2].payload.openRouterApiKey,undefined);assert.equal(JSON.stringify(records).includes('secret'),false);
  assert.equal(backupRecords({cloudRecords:records}).length,3);
});
test('restore validates every record before writes and identifies conflicting edits',()=>{
  const existing=record('target','goal',{name:'My goal',target:100});
  const incoming=record('target','goal',{name:'My goal',target:110});
  assert.equal(compareBackup([incoming],[existing])[0].status,'conflict');
  assert.throws(()=>backupRecords({cloudRecords:[existing,existing]}),/duplicate/);
  assert.throws(()=>backupRecords({cloudRecords:[existing,{...incoming,id:'bad',entityType:'unknown'}]}));
});
