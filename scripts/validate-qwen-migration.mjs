import {readFile} from 'node:fs/promises';
// Reuse the isolated synthetic database bootstrap; no network or real credential.
const original=await readFile('scripts/validate-production-model-migration.mjs','utf8');
const bootstrap=original.slice(0,original.indexOf(' for(const [uid'));
const validation=`
 const snapshot=JSON.stringify((await pg.query('select * from body_os_records order by user_id')).rows);
 const vaultBefore=JSON.stringify((await pg.query('select * from vault.secrets order by id')).rows);
 await pg.exec(await readFile('supabase/migrations/20261015113222_qwen_provisional_production_policy.sql','utf8'));
 assert.equal(JSON.stringify((await pg.query('select * from body_os_records order by user_id')).rows),snapshot);
 assert.equal(JSON.stringify((await pg.query('select * from vault.secrets order by id')).rows),vaultBefore);
 assert.equal((await pg.query('select count(*)::int as n from health_ai_model_qualification')).rows[0].n,0);
 await pg.exec("set role authenticated;set request.jwt.claim.sub='"+owner+"';set request.jwt.claim.role='authenticated';");
 const reserve=(id,amount,model='qwen/qwen3-235b-a22b-2507')=>pg.query('select health_ai_reserve_production($1,$2,5,$3)',[id,amount,JSON.stringify({model,provider:'openrouter',role:'planner'})]);
 await reserve('qwen',4.5);
 await assert.rejects(reserve('overflow',.51),/Monthly Intelligence budget exceeded/);
 await assert.rejects(reserve('old',0,'deepseek/deepseek-v4-flash-0731'),/Invalid production model budget/);
 await assert.rejects(reserve('old-glm',0,'z-ai/glm-5.3-flash'),/Invalid production model budget/);
 await assert.rejects(pg.query('select health_ai_budget_reserve_owned($1,$2,0,5,$3)',[other,'forged',JSON.stringify({model:'qwen/qwen3-235b-a22b-2507',provider:'openrouter'})]),/permission denied/);
 await assert.rejects(pg.query(\`insert into health_ai_model_qualification(user_id,model,gate,repetitions,samples,score,critical_failures,benchmark_hash,evaluated_at,expires_at) values($1,'qwen/qwen3-235b-a22b-2507','primary',3,36,1,0,$2,now(),now()+interval '1 day')\`,[owner,'a'.repeat(64)]),/permission denied/);
 await pg.exec("set request.jwt.claim.sub='"+other+"';");assert.equal((await pg.query('select count(*)::int as n from health_ai_usage')).rows[0].n,0);
 console.log(JSON.stringify({passed:true,checks:['DDL compiles','no owner record or Vault changes','zero fabricated qualification rows','Qwen-only budget admission','monthly cap preserved','private reserve cannot be called by owner','qualification writes denied to owner','owner usage isolation'],paidCalls:0}));
}finally{await pg.close();}
`;
// Import paths inside the original bootstrap remain relative to this scripts directory.
await import('data:text/javascript,'+encodeURIComponent(bootstrap.replace("'../output/sql-validation/node_modules/@electric-sql/pglite/dist/index.js'",JSON.stringify(new URL('../output/sql-validation/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url).href))+validation));
