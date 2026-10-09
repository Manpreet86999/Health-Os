import { APP_VERSION } from '../../src/shared/version';
import { expect, type Page } from '@playwright/test';

export const owner = '11111111-1111-4111-8111-111111111111';
export const base = 'https://lphlihwyrcqgmdiwlvuq.supabase.co';
export async function setup(page: Page, signedIn = true, preserveSession = false) {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date());
  const date = new Date().toLocaleDateString('en-CA');
  const records: any[] = [];
  const catalog:any[]=[];
  const biological:any[]=[];let bioVersion=0;
  const jobs:any[]=[];
  let version = 1;
  let rejectSession = false;
  const add = (type: string, id: string, payload: any) => { const time = new Date().toISOString(); records.push({ user_id: owner, entity_type: type, record_id: id, payload: { ...payload, id }, updated_at: time, cloud_updated_at: time, revision: 1, device_id: 'test', change_version: version++ }); };
  add('week', 'week-one', { name: 'Cloud strength', weekNumber: 1, startDate: date, notes: '', active: true, days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(key => ({ key, title: 'Strength day', type: 'training', subtitle: '', muscles: ['Chest'], exercises: [{ name: 'Bench Press', target: 'Chest', vol: '1 x 5', cue: 'Control the bar' }] })) });
  add('workspaceState', 'workspace-state', { activeWeekId: 'week-one' });
  add('profile', 'profile', { displayName: 'Cloud Athlete', units: 'kg', createdAt: new Date().toISOString() });
  add('readiness', 'ready', { date, weekId: 'week-one', dayKey: day, sleepHours: 8, sleepQuality: 8, soreness: 2, energy: 8, stress: 2, motivation: 8, mood: 8, steps: 4000, hydration: 2, mealProtein: 0, painFlag: false, restingHeartRate: '', notes: '', score: 88, band: 'Ready', recommendation: 'Train normally.' });
  await page.addInitScript(({ signedIn, owner, base, preserveSession, appVersion }) => {
    if (!preserveSession || !localStorage.getItem('health-os-test-seeded')) {
      localStorage.clear();localStorage.setItem('health-os-welcome-version',appVersion); sessionStorage.clear();
      if (signedIn) localStorage.setItem('body-os-supabase-session-v1', JSON.stringify({ uid: owner, email: 'cloud-test@example.com', accessToken: 'test-access-token', refreshToken: 'test-refresh-token', expiresAt: Date.now() + 3600000, config: { url: base, publishableKey: 'test-publishable-key' } }));
      if (preserveSession) localStorage.setItem('health-os-test-seeded', 'yes');
    }
    class FakeSocket { readyState = 0; static OPEN = 1; static CONNECTING = 0; send() {} close() {} }
    (window as any).WebSocket = FakeSocket;
  }, { signedIn, owner, base, preserveSession, appVersion: APP_VERSION });
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  const originApi: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) originApi.push(req.url()); });
  await page.route(`${base}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    if(url.pathname.endsWith('/functions/v1/body-os-exercise-library')){
      const input=req.postDataJSON();
      const previous=catalog.find(exercise=>exercise.id===input.exerciseId||exercise.name===input.name);
      const exercise=previous||{id:input.exerciseId||crypto.randomUUID(),name:input.name,muscles:input.muscles||[],equipment:Array.isArray(input.equipment)?input.equipment:input.equipment?[input.equipment]:[],body_part:input.bodyPart||null,movement_pattern:input.movementPattern||null,source_payload:{}};
      if(!previous)catalog.push(exercise);return route.fulfill({json:{exercise,media:[],errors:[]}});
    }
    if(url.pathname.endsWith('/body_os_exercises')) { expect(url.searchParams.get('select')).toContain('body_os_exercise_media!body_os_exercise_media_exercise_id_fkey'); return route.fulfill({json:catalog.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+1000)}); }
    if(url.pathname.endsWith('/health_os_workers'))return route.fulfill({json:[]});
    if(url.pathname.endsWith('/rpc/health_os_enqueue_job')){const input=req.postDataJSON();const job={id:input.p_id,user_id:owner,operation:input.p_operation,input:input.p_input,status:'queued',attempts:0,created_at:new Date().toISOString()};jobs.push(job);return route.fulfill({json:job});}
    if(url.pathname.endsWith('/rpc/health_os_cancel_job')){const job=jobs.find(j=>j.id===req.postDataJSON().p_id);if(job)job.status='cancelled';return route.fulfill({json:Boolean(job)});}
    if(url.pathname.endsWith('/health_os_worker_jobs'))return route.fulfill({json:jobs.filter(j=>!url.searchParams.has('id')||url.searchParams.get('id')===`eq.${j.id}`)});
    if(url.pathname.endsWith('/rpc/health_os_pull_biological_delta')){const after=req.postDataJSON().after_version;const rows=biological.filter(r=>r.change_version>after);return route.fulfill({json:{protocolVersion:2,records:rows,cursor:rows.at(-1)?.change_version||after,hasMore:false}});}
    if(url.pathname.endsWith('/rpc/health_os_save_biological_record')){const input=req.postDataJSON();expect(input.p_payload.userId).toBe(owner);const previous=biological.find(r=>r.record_id===input.p_record_id);if((previous?.revision||null)!==input.p_expected_revision)return route.fulfill({json:{status:'conflict',revision:previous.revision,payload:previous.payload}});const revision=(previous?.revision||0)+1;const payload={...input.p_payload,revision,syncState:'saved'};const row={record_id:input.p_record_id,revision,payload,change_version:++bioVersion};if(previous)Object.assign(previous,row);else biological.push(row);return route.fulfill({json:{status:'saved',revision,payload}});}
    if(url.pathname.includes('/health_os_biological_records'))return route.fulfill({json:biological});
    if (url.pathname.includes('/functions/v1/body-os-email')) return route.fulfill({ json: { ok: true, jobs: [], sentTo: ['cloud-test@example.com'] } });
    if (url.pathname.includes('/functions/v1/body-os-integrations')) return route.fulfill({ json: {driveConnected:false,hasGoogleClient:false,hasTelegram:false,redirectUri:`${base}/functions/v1/body-os-integrations/drive-callback`} });
    if (url.pathname.includes('/rpc/body_os_save_care')) {
      const input=req.postDataJSON();const settings=records.find(r=>r.entity_type==='careSettings'&&r.record_id==='care-settings'&&!r.deleted_at);
      if((settings?.payload.revision||0)!==input.expected_revision||(settings?.payload.updatedAt||'1970-01-01T00:00:00.000Z')!==input.expected_updated_at)return route.fulfill({status:409,json:{code:'40001',message:'Care changed elsewhere. Reload before saving.'}});
      const types=['careSettings','careTask','careGoal','careEvent','careCheckIn','careReview','carePlanVersion'];const keys=new Set(input.entries.map((r:any)=>`${r.entityType}:${r.id}`));
      for(const record of records.filter(r=>types.includes(r.entity_type)&&!r.deleted_at&&!keys.has(`${r.entity_type}:${r.record_id}`))){record.deleted_at=new Date().toISOString();record.change_version=version++;}
      for(const entry of input.entries){const previous=records.find(r=>r.entity_type===entry.entityType&&r.record_id===entry.id);if(previous){previous.payload=entry.payload;previous.deleted_at=null;previous.change_version=version++;}else add(entry.entityType,entry.id,entry.payload);}
      return route.fulfill({json:records.filter(r=>types.includes(r.entity_type)).map(r=>({id:r.record_id,entityType:r.entity_type,payload:r.payload,revision:r.revision,deviceId:r.device_id,updatedAt:r.updated_at,deletedAt:r.deleted_at||null,cloudVersion:r.cloud_updated_at,changeVersion:r.change_version}))});
    }
    if (url.pathname.includes('body_os_email_jobs')) return route.fulfill({ json: [] });
    if (url.pathname.includes('/auth/v1/token')) return route.fulfill({ json: { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, user: { id: owner, email: 'cloud-test@example.com' } } });
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ json: {} });
    if (url.pathname.includes('/rpc/body_os_pull_delta')) {
      const after = req.postDataJSON().after_version; const pending = records.filter(r => r.change_version > after).sort((a,b) => a.change_version - b.change_version).slice(0,500);
      return route.fulfill({ json: { protocolVersion: 2, records: pending.map(r => ({ id:r.record_id, entityType:r.entity_type, payload:r.payload, revision:r.revision, deviceId:r.device_id, updatedAt:r.updated_at, deletedAt:r.deleted_at || undefined, changeVersion:r.change_version })), cursor:pending.at(-1)?.change_version || after, hasMore:false } });
    }
    if (url.pathname.includes('/body_os_records')) {
      expect(req.headers().authorization).toBe('Bearer test-access-token');
      if (req.method() === 'GET') {
        expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`);
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 500);
        const after=Number((url.searchParams.get('change_version')||'gt.0').slice(3));
        const matching=records.filter(r=>r.change_version>after).sort((a,b)=>a.change_version-b.change_version);
        return route.fulfill({ json: matching.slice(offset, offset + limit) });
      }
      const payload = req.postDataJSON();
      if (rejectSession && payload.entity_type === 'session') return route.fulfill({status:503,json:{error:'Temporary database failure'}});
      if (req.method() === 'POST') {
        expect(payload.user_id).toBe(owner);
        if (records.some(r => r.entity_type === payload.entity_type && r.record_id === payload.record_id)) return route.fulfill({ status: 409, json: { error: 'duplicate' } });
        records.push({ ...payload, cloud_updated_at: new Date().toISOString(), change_version: version++ });
        return route.fulfill({ json: [records.at(-1)] });
      }
      const index = records.findIndex(r => `eq.${r.entity_type}` === url.searchParams.get('entity_type') && `eq.${r.record_id}` === url.searchParams.get('record_id') && (url.searchParams.has('cloud_updated_at') ? `eq.${r.cloud_updated_at}` === url.searchParams.get('cloud_updated_at') : `eq.${r.change_version}` === url.searchParams.get('change_version')));
      if (index < 0) return route.fulfill({ json: [] });
      records[index] = { ...records[index], ...payload, cloud_updated_at: new Date().toISOString(), change_version: version++ };
      return route.fulfill({ json: [records[index]] });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected cloud request' } });
  });
  return { records, catalog, biological, jobs, originApi, add, rejectSession: (value: boolean) => { rejectSession = value; } };
}
