import test from 'node:test';
import assert from 'node:assert/strict';
import {readOwnerUsagePages,committedOwnerUsage} from './owner-usage-pages.js';
test('monthly precheck includes paid and unsettled usage beyond the REST row limit',async()=>{
 const offsets:number[]=[];
 const rows=await readOwnerUsagePages(async offset=>{offsets.push(offset);return offset===0?Array.from({length:1000},()=>({charged_usd:.0049,reserved_usd:.01})):[{charged_usd:null,reserved_usd:.25}];});
 assert.deepEqual(offsets,[0,1000]);assert.equal(rows.length,1001);assert.ok(committedOwnerUsage(rows)>5,'The final reservation must block a new request even when the first page is below US$5.');
});
test('an unavailable or malformed later page never returns a partial spend total',async()=>{
 const first=Array.from({length:1000},()=>({charged_usd:0,reserved_usd:0}));
 await assert.rejects(readOwnerUsagePages(async offset=>{if(offset===0)return first;throw new Error('Ledger unavailable.');}),/Ledger unavailable/);
 for(const row of [{charged_usd:null},{charged_usd:'NaN',reserved_usd:1},{charged_usd:null,reserved_usd:-1},{charged_usd:true,reserved_usd:1},{charged_usd:'',reserved_usd:1}])await assert.rejects(readOwnerUsagePages(async()=>[row]),/Invalid usage amount/);
});
