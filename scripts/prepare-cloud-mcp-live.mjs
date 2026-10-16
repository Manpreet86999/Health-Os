import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const fixtures=['a','b'].map(label=>{const id=randomUUID();return {label,id,email:`heos-mcp-cloud-test-${id}@example.test`,password:randomBytes(32).toString('base64url')};});
mkdirSync('output/cloud-mcp-live',{recursive:true});
writeFileSync('output/cloud-mcp-live/credentials.json',JSON.stringify({fixtures}));
const sql=fixtures.map(f=>`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,reauthentication_token,is_sso_user,is_anonymous) values('00000000-0000-0000-0000-000000000000','${f.id}','authenticated','authenticated','${f.email}',extensions.crypt('${f.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}','','','','','','',false,false);\ninsert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values('${f.id}','${f.id}','{"sub":"${f.id}","email":"${f.email}","email_verified":true}','email',now(),now());`).join('\n');
writeFileSync('output/cloud-mcp-live/create-fixtures.sql','begin;\n'+sql+'\ncommit;');
writeFileSync('output/cloud-mcp-live/cleanup-fixtures.sql',`begin;\ndelete from auth.users where id in (${fixtures.map(f=>`'${f.id}'`).join(',')}) and email like 'heos-mcp-cloud-test-%@example.test';\ncommit;`);
console.log(JSON.stringify({fixtureAccounts:fixtures.map(({id,label})=>({id,label})),credentials:'Stored only in ignored local test output; no real user credentials are used.'}));
