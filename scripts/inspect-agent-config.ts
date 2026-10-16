import {loadWorkerSession,saveWorkerSession} from '../src/server/worker/credentials.js';
import {refreshSupabaseSession} from '../src/shared/supabase-auth.js';
import {readCloud} from '../src/shared/cloud.js';
let session=loadWorkerSession();if(Date.now()>=session.expiresAt){session=await refreshSupabaseSession(session);saveWorkerSession(session);}
const rows=await readCloud(session.config,session),prefs=rows.find(r=>r.entityType==='sharedPreferences'&&r.id==='shared-preferences')?.payload as any;
console.log(JSON.stringify({aiProvider:prefs.aiProvider,aiModel:prefs.aiModel,nvidiaKeyConfigured:!!prefs.nvidiaNimApiKey,roles:prefs.aiAgentRoles?JSON.parse(prefs.aiAgentRoles):{}}));
