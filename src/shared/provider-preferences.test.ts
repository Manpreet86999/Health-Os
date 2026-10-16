import test from 'node:test';
import assert from 'node:assert/strict';
import {publicProviderPreferences} from './provider-preferences.js';
test('old cached OpenRouter credentials and matching aliases are removed while provider configuration survives',()=>{
 const input={openRouterApiKey:'SYNTHETIC-OPENROUTER',aiApiKey:'SYNTHETIC-OPENROUTER',apiKey:'SYNTHETIC-OPENROUTER',providerApiKey:'SYNTHETIC-OPENROUTER',openrouterKey:'SYNTHETIC-OPENROUTER',nvidiaNimApiKey:'SYNTHETIC-OPENROUTER',aiProvider:'nvidia',aiModel:'historical/model',customSetting:'preserved'};
 const result=publicProviderPreferences(input);
 assert.deepEqual(result,{aiProvider:'nvidia',aiModel:'historical/model',customSetting:'preserved',hasOpenRouterApiKey:true});assert.ok(input.openRouterApiKey,'The caller-owned input remains unchanged.');
});
test('unrelated NVIDIA credentials and settings are preserved and absent OpenRouter connections remain absent',()=>{
 const input={aiProvider:'nvidia',aiApiKey:'SYNTHETIC-NVIDIA',nvidiaNimApiKey:'SYNTHETIC-NVIDIA',aiModel:'historical/nvidia'};
 assert.deepEqual(publicProviderPreferences(input),input);
 assert.deepEqual(publicProviderPreferences({trainingStyle:'strength'}),{trainingStyle:'strength'});
});
