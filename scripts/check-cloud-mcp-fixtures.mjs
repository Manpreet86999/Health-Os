import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DEFAULT_SUPABASE_CONFIG} from '../src/shared/supabase-project.ts';
const file='output/cloud-mcp-live/credentials.json',state=JSON.parse(readFileSync(file,'utf8'));
for(const fixture of state.fixtures){const response=await fetch(DEFAULT_SUPABASE_CONFIG.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:DEFAULT_SUPABASE_CONFIG.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})});const session=await response.json();assert.equal(response.status,200,session.msg||session.error_description||'Fixture authentication failed');assert.equal(session.user.id,fixture.id);fixture.session={uid:fixture.id,email:fixture.email,accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000,config:DEFAULT_SUPABASE_CONFIG};console.log('Temporary acceptance account '+fixture.label+' authenticates with its own Supabase session.');}
writeFileSync(file,JSON.stringify(state));
