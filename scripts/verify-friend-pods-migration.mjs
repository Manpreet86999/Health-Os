import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '../output/friend-pods/local-check/node_modules/@electric-sql/pglite/dist/index.js';
process.on('uncaughtException', error => { console.error(error.message, error.where || '', error.position || ''); process.exit(1); });
const migrationPath = 'supabase/migrations/20261011160711_friend_pods_partnership.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const db = new PGlite();
// Isolated PostgreSQL bootstrap, not Supabase. Crypto stubs are only for exercising
// invitation state/authorization locally; real SHA256/randomness is NOT certified here.
await db.exec(`create role anon; create role authenticated;
 create schema auth; create schema extensions;
 create table auth.users(id uuid primary key,aud text,role text,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1),'hex')$$;
 create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as $$select decode(replace(gen_random_uuid()::text,'-',''),'hex')$$;`);
await db.exec(fs.readFileSync('supabase/migrations/20261008090000_private_friend_pods.sql', 'utf8'));
await db.exec(`create table public.body_os_records(id uuid primary key,payload jsonb);
 insert into public.body_os_records values(gen_random_uuid(),'{"private":"medical record sentinel"}');
 alter table public.body_os_records enable row level security;
 create policy unrelated_health_policy on public.body_os_records using(false);
 create function public.unrelated_health_function() returns text language sql as $$select 'preserve me'::text$$;`);
const unrelated = (await db.query('select * from public.body_os_records')).rows;
const unrelatedPolicy = (await db.query("select * from pg_policies where tablename='body_os_records'")).rows;
const unrelatedFunction = (await db.query("select pg_get_functiondef('public.unrelated_health_function()'::regprocedure) as definition")).rows;
const a = crypto.randomUUID(), b = crypto.randomUUID();
await db.query(`insert into auth.users values($1,'authenticated','authenticated','local-a@validation.invalid'),($2,'authenticated','authenticated','local-b@validation.invalid')`, [a,b]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
const pod = (await db.query(`select public.health_os_pod_action('create',null,'{"name":"Existing pair"}') as value`)).rows[0].value.id;
const goal = (await db.query(`select public.health_os_pod_action('goal',$1,'{"name":"Original Gym","targetPerWeek":4}') as value`, [pod])).rows[0].value.id;
const used = (await db.query(`select public.health_os_pod_action('invite',$1) as value`, [pod])).rows[0].value.code;
await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
await db.query(`select public.health_os_pod_action('accept',null,jsonb_build_object('code',$1::text))`, [used]);
await db.query(`select public.health_os_pod_action('complete',$1,jsonb_build_object('goalId',$2::text,'day',current_date,'completed',true))`, [pod,goal]);
await db.exec('reset role;');
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
const waiting = (await db.query(`select public.health_os_pod_action('create',null,'{"name":"Waiting pair"}') as value`)).rows[0].value.id;
const waitingCode = (await db.query(`select public.health_os_pod_action('invite',$1) as value`, [waiting])).rows[0].value.code;
await db.exec('reset role;');
const tables = ['health_os_pods','health_os_pod_members','health_os_pod_goals','health_os_pod_invites','health_os_pod_completions'];
const baseline = {};
for (const table of tables) baseline[table] = (await db.query(`select * from public.${table} order by 1,2`)).rows;
const oldColumns = Object.fromEntries(tables.map(table => [table,Object.keys(baseline[table][0])]));
function originalProjection(rows, table) { return rows.map(row => Object.fromEntries(oldColumns[table].map(column => [column,row[column]]))); }
await db.exec(migration);
assert.deepEqual((await db.query('select * from public.body_os_records')).rows,unrelated);
assert.deepEqual((await db.query("select * from pg_policies where tablename='body_os_records'")).rows,unrelatedPolicy);
assert.deepEqual((await db.query("select pg_get_functiondef('public.unrelated_health_function()'::regprocedure) as definition")).rows,unrelatedFunction);
for (const table of tables) {
 const migrated = (await db.query(`select * from public.${table} order by 1,2`)).rows;
 const originalRows = table === 'health_os_pod_goals' ? migrated.filter(row => baseline[table].some(old => old.id === row.id)) : migrated;
 assert.deepEqual(originalProjection(originalRows,table),baseline[table],`${table}: original payload changed`);
}
const originalGoal = (await db.query(`select archived_at from public.health_os_pod_goals where id=$1`,[goal])).rows[0];
assert.equal(originalGoal.archived_at,null,'Legacy goal must not be auto-archived');
const beforeRepeat = {};
for (const table of [...tables,'health_os_pod_periods','health_os_pod_participants','health_os_pod_goal_versions']) beforeRepeat[table]=(await db.query(`select * from public.${table} order by 1,2`)).rows;
await db.exec(migration);
for (const table of Object.keys(beforeRepeat)) assert.deepEqual((await db.query(`select * from public.${table} order by 1,2`)).rows,beforeRepeat[table],`${table}: repeated migration changed rows`);
const legacy = (await db.query(`select membership_period_id from public.health_os_pod_goals where id=$1`,[goal])).rows[0].membership_period_id;
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`);
assert.equal((await db.query(`select * from public.health_os_pod_completions where membership_period_id=$1`,[legacy])).rows.length,0,'Legacy visibility must be quarantined for non-owner');
await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);`);
assert.equal((await db.query(`select * from public.health_os_pod_completions where membership_period_id=$1`,[legacy])).rows.length,1,'Owner legacy history preserved');
await db.exec('reset role;');
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`);
assert.equal((await db.query(`select public.health_os_pod_action('preview',null,jsonb_build_object('code',$1::text)) as value`,[waitingCode])).rows[0].value.status,'ready','Existing active invitation retained');
await db.query(`select public.health_os_pod_action('accept',null,jsonb_build_object('code',$1::text,'displayName','Friend'))`,[waitingCode]);
await db.exec('reset role;');
for (const test of ['supabase/tests/friend-pods-security.sql','supabase/tests/friend-pods-partnership.sql']) {
 const result = await db.exec(fs.readFileSync(test,'utf8'));
 console.log(test, JSON.stringify(result.flatMap(item=>item.rows).filter(row=>row.result)));
}
// Failed preflight must leave no partial backfill; never attempt an automatic repair.
await db.exec(`begin; insert into public.health_os_pods(owner_id,name) values('${a}','Invalid owner membership'); commit;`);
const countBeforeFailure = (await db.query('select count(*)::int as count from public.health_os_pod_periods')).rows[0].count;
await assert.rejects(db.exec(migration),/Preflight: Pod owner membership missing/);
await db.exec('rollback;');
assert.equal((await db.query('select count(*)::int as count from public.health_os_pod_periods')).rows[0].count,countBeforeFailure);
const report = { migration:migrationPath, sha256:crypto.createHash('sha256').update(migration).digest('hex'), runtime:'PGlite isolated PostgreSQL', originalPayloadsPreserved:true, unrelatedHealthDataAndPoliciesPreserved:true, activeInvitationPreserved:true, idempotent:true, preflightAbortsWithoutPartialWrites:true, legacyVisibilityChecked:true, securitySuitesPassed:true, limitations:['Crypto is stubbed locally; SHA256 and Supabase API/auth integration require an approved staging validation.','True simultaneous accepts and physical devices were not tested.','No production SQL was executed for this verification.'] };
fs.mkdirSync('output/friend-pods',{recursive:true}); fs.writeFileSync('output/friend-pods/migration-local-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await db.close();
