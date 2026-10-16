import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {providerJsonSchema} from '../integrations/ai/provider-json-schema.js';
test('provider schema compatibility keeps forbidden fields forbidden and empty arrays empty',()=>{
 const actual=z.object({executionPlan:z.never().optional(),actions:z.array(z.never()).max(0),sourceIds:z.array(z.never()).max(30)}).strict();
 const raw=z.toJSONSchema(actual),wire=providerJsonSchema(raw);
 assert.equal(wire.additionalProperties,false);assert.equal('executionPlan' in wire.properties,false);
 assert.deepEqual(wire.properties.actions.items,{type:'string'});assert.equal(wire.properties.actions.maxItems,0);assert.equal(wire.properties.sourceIds.maxItems,0);
 assert.equal(actual.safeParse({actions:[],sourceIds:[]}).success,true);
 for(const input of [{actions:['anything'],sourceIds:[]},{actions:[],sourceIds:['invented']},{actions:[],sourceIds:[],executionPlan:null}])assert.equal(actual.safeParse(input).success,false);
 assert.deepEqual(raw.properties!.executionPlan,{not:{}},'The original canonical schema remains unchanged.');
});
test('required impossible fields and ordinary typed arrays retain their constraints',()=>{
 const impossible:any={type:'object',additionalProperties:false,required:['blocked'],properties:{blocked:false}};assert.equal(providerJsonSchema(impossible).properties.blocked,false);
 const array={type:'array',items:{type:'integer',minimum:1},maxItems:8};assert.deepEqual(providerJsonSchema(array),array);
});
