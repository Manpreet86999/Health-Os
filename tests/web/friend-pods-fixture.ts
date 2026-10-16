import { expect, type Page } from '@playwright/test';
import { setup, base, owner } from './cloud-fixture';
import { podToday, podWeek } from '../../src/shared/friend-pods';
export const friend = '44444444-4444-4444-8444-444444444444';
export const stranger = '55555555-5555-4555-8555-555555555555';
export const podId = '22222222-2222-4222-8222-222222222222';
export const goalId = '33333333-3333-4333-8333-333333333333';
export const periodId = '66666666-6666-4666-8666-666666666666';
export const v2Caps = { version: 2, supportsMembershipPeriods: true, supportsInvitationPreview: true, supportsGoalVersions: true, supportsGoalEditing: true, supportsPodDisplayNames: true, supportsPodRename: true, supportsGoalArchive: true };
export async function setupFriendPods(page: Page, version: 1 | 2 = 1, initial: 'empty' | 'connected' = 'empty', signedIn = true) {
  await setup(page, signedIn, true);
  const created = new Date(Date.now() - 7 * 86400000).toISOString();
  const pods: any[] = [], members: any[] = [], goals: any[] = [], completions: any[] = [], versions: any[] = [], writes: any[] = [], unexpected: string[] = [], reads: string[] = [];
  let viewer = owner, nextFailure = '', capabilityError = false, previewStatus = 'ready';
  const pod = () => ({ id: podId, name: 'Winter Arc', owner_id: owner, created_at: created, ...(version === 2 ? { current_period_id: periodId } : {}) });
  const member = (user: string) => ({ pod_id: podId, user_id: user, joined_at: created, ...(version === 2 ? { membership_period_id: periodId, display_name: user === owner ? 'Maan' : 'Parm', role: user === owner ? 'owner' : 'member' } : {}) });
  const goal = () => ({ id: goalId, pod_id: podId, name: 'Gym', target_per_week: 5, created_at: created, ...(version === 2 ? { membership_period_id: periodId, description: 'Small steps together', archived_at: null } : {}) });
  if (initial === 'connected') { pods.push(pod()); members.push(member(owner), member(friend)); goals.push(goal()); }
  const assertLegacy = (message: string, condition: boolean) => { if (!condition) unexpected.push(message); };
  await page.route(`${base}/rest/v1/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    if (!url.pathname.includes('health_os_pod')) return route.fallback();
    expect(req.headers().authorization).toBe('Bearer test-access-token');
    if (url.pathname.endsWith('/health_os_pod_capabilities')) {
      if (capabilityError) return route.fulfill({ status: 503, json: { message: 'Capability connection unavailable' } });
      return version === 1 ? route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.health_os_pod_capabilities in the schema cache' } }) : route.fulfill({ json: v2Caps });
    }
    if (url.pathname.includes('/rpc/')) {
      const input = req.postDataJSON(); writes.push(input);
      if (version === 1) {
        assertLegacy('unsupported v2 action', ['create','invite','accept','revoke','goal','complete','leave','remove'].includes(input.action));
        assertLegacy('unsupported v2 endpoint', !url.pathname.endsWith('_v2'));
        assertLegacy('unsupported v2 payload', !Object.keys(input.args || {}).some(key => ['displayName','timezone','description','membershipPeriodId'].includes(key)));
      }
      if (input.action === nextFailure) { nextFailure = ''; return route.fulfill({ status: 503, json: { message: 'Could not save check-in. Try again.' } }); }
      if (input.action === 'create') { pods.push({ ...pod(), name: input.args.name }); members.push({ ...member(viewer), ...(version === 2 ? { display_name: input.args.displayName } : {}) }); return route.fulfill({ json: { id: podId } }); }
      if (input.action === 'invite') return route.fulfill({ json: { code: 'A'.repeat(32), expiresAt: new Date(Date.now() + 48 * 3600000).toISOString() } });
      if (input.action === 'preview') return route.fulfill({ json: { status: previewStatus, ...(previewStatus === 'ready' ? { name: 'Morning Walk', inviter: 'Parm', expiresAt: new Date(Date.now() + 3600000).toISOString() } : {}) } });
      if (input.action === 'accept') {
        if (previewStatus !== 'ready') return route.fulfill({ status: 400, json: { message: `Invitation ${previewStatus}` } });
        if (!pods.length) { pods.push({ ...pod(), owner_id: friend, name: 'Morning Walk' }); members.push(member(friend)); goals.push(goal()); }
        if (members.some(m => m.user_id === viewer)) return route.fulfill({ status: 400, json: { message: 'Already a member' } });
        members.push({ ...member(viewer), ...(version === 2 ? { display_name: input.args.displayName } : {}) }); return route.fulfill({ json: { id: podId } });
      }
      if (input.action === 'goal') goals.push({ ...goal(), name: input.args.name, target_per_week: input.args.targetPerWeek, ...(version === 2 ? { description: input.args.description || '' } : {}) });
      if (input.action === 'complete') { const existing = completions.find(row => row.goal_id === input.args.goalId && row.user_id === viewer && row.day === input.args.day); const row = { pod_id: podId, goal_id: input.args.goalId, user_id: viewer, day: input.args.day, completed: input.args.completed, ...(version === 2 ? { membership_period_id: periodId, timezone: input.args.timezone, updated_at: new Date().toISOString() } : {}) }; if (existing) Object.assign(existing, row); else completions.push(row); }
      if (input.action === 'rename') pods[0].name = input.args.name;
      if (input.action === 'display_name') members.find(m => m.user_id === viewer).display_name = input.args.displayName;
      if (input.action === 'update_goal') versions.push({ goal_id: goalId, membership_period_id: periodId, effective_week: podWeek(podToday(new Date(Date.now() + 7 * 86400000))), name: input.args.name, target_per_week: input.args.targetPerWeek, description: input.args.description });
      if (input.action === 'archive_goal') goals.find(g => g.id === input.args.goalId).archived_at = new Date().toISOString();
      if (input.action === 'remove') { const index = members.findIndex(m => m.user_id === input.args.memberId); members.splice(index, 1); }
      if (input.action === 'delete' || input.action === 'leave' && pods[0]?.owner_id === viewer) { pods.splice(0); members.splice(0); goals.splice(0); completions.splice(0); }
      else if (input.action === 'leave') members.splice(members.findIndex(m => m.user_id === viewer), 1);
      return route.fulfill({ json: { ok: true } });
    }
    reads.push(url.pathname + url.search);
    if (version === 1) {
      assertLegacy('query for nonexistent column', !/current_period_id|membership_period_id|display_name|description|archived_at|timezone|updated_at/.test(url.searchParams.get('select') || ''));
      assertLegacy('query for nonexistent table', !/health_os_pod_(periods|participants|goal_versions)/.test(url.pathname));
    }
    if (unexpected.length) return route.fulfill({ status: 400, json: { message: unexpected.at(-1) } });
    const allowed = members.some(m => m.user_id === viewer), table = url.pathname.split('/').at(-1);
    const rows = !allowed ? [] : table === 'health_os_pods' ? pods : table === 'health_os_pod_members' ? members : table === 'health_os_pod_goals' ? goals : table === 'health_os_pod_completions' ? completions : table === 'health_os_pod_periods' ? [{ id: periodId, pod_id: podId, started_at: created, ended_at: null }] : table === 'health_os_pod_participants' ? members : table === 'health_os_pod_goal_versions' ? versions : [];
    return route.fulfill({ json: rows });
  });
  return { pods, members, goals, completions, writes, unexpected, reads, failNext: (action: string) => { nextFailure = action; }, failCapabilities: () => { capabilityError = true; }, setPreviewStatus: (status: string) => { previewStatus = status; },
    enableV2: () => { version = 2; for (const pod of pods) pod.current_period_id = periodId; for (const row of members) Object.assign(row, { membership_period_id: periodId, display_name: row.user_id === owner ? 'Maan' : 'Parm' }); for (const row of goals) Object.assign(row, { membership_period_id: periodId, description: '', archived_at: null }); },
    connectFriend: () => { if (!members.some(m => m.user_id === friend)) members.push(member(friend)); },
    switchUser: async (id: string) => { viewer = id; await page.route(`${base}/rest/v1/body_os_records?*`, route => route.fulfill({json:[]})); await page.evaluate(uid => { const session = JSON.parse(localStorage.getItem('body-os-supabase-session-v1')!); session.uid = uid; localStorage.setItem('body-os-supabase-session-v1', JSON.stringify(session)); window.dispatchEvent(new Event('body-os-account-changed')); }, id); },
  };
}
