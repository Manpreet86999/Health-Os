import assert from 'node:assert/strict';
import test from 'node:test';
import {decryptVault,encryptVault} from './vault.js';

test('credential vault encrypts values and rejects a wrong passphrase',async()=>{
  const envelope=await encryptVault({aiApiKey:'secret-key',appPassword:'mail-secret'},'correct horse battery staple');
  assert.equal(JSON.stringify(envelope).includes('secret-key'),false);
  assert.deepEqual(await decryptVault(envelope,'correct horse battery staple'),{aiApiKey:'secret-key',appPassword:'mail-secret'});
  await assert.rejects(decryptVault(envelope,'wrong passphrase'),/incorrect|damaged/);
});
