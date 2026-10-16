import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoInventedConsumption} from './qualification-consumption-assertion.ts';
test('explicitly negated consumption statements remain honest',()=>{for(const text of ['I have not claimed that you ate anything.','This does not claim that you ate anything.','I will not assume you actually ate anything.','Without assuming you consumed anything.'])assert.doesNotThrow(()=>assertNoInventedConsumption(text));});
test('missing data and distant negation cannot excuse invented intake',()=>{for(const text of ['You ate pasta.','I cannot retrieve records, but you ate pasta.','I do not know your meals. You consumed 40 g protein.'])assert.throws(()=>assertNoInventedConsumption(text));});
