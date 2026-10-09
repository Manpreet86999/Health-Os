import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAccountEmail, type EmailDependencies } from '../functions/_shared/email-service.ts';

function fixture() {
  const events: string[] = [];
  const deps: EmailDependencies = {
    report: async user => { assert.equal(user, 'owner'); return [{ date: '2026-10-07', logs: [] }]; },
    generateWorkoutReport: async () => { events.push('analyze'); return { date: '2026-10-07', aiOverallSummary: 'AI assessment of logged sets.', logs: [{name:'Squat',status:'completed',sets:[],aiCoachComment:'AI progression guidance.'}] }; },
    preferences: async () => ({}), claim: async () => 'claimed',
    finish: async (_, __, status) => { events.push(status); },
    send: async message => { assert.equal(message.to, 'verified@example.com'); assert.match(message.html, /AI assessment of logged sets/); assert.match(message.text, /AI progression guidance/); events.push('send'); },
    completeReport: async (_, type, id) => { events.push(`complete:${type}:${id}`); }, log: () => {},
  };
  return { deps, events };
}
const user = { id: 'owner', email: 'verified@example.com', email_confirmed_at: '2026-10-07T00:00:00Z' };
test('successful cloud email completes its queue entry after delivery', async () => {
  const { deps, events } = fixture();
  await sendAccountEmail(user, { reportType: 'workout', reportId: 'session-one' }, deps);
  assert.deepEqual(events, ['analyze', 'send', 'sent', 'complete:workout:session-one']);
});
test('delivery failure preserves the pending queue and does not claim success', async () => {
  const { deps, events } = fixture(); deps.send = async () => { throw new Error('SMTP unavailable'); };
  await assert.rejects(sendAccountEmail(user, { reportType: 'workout', reportId: 'session-one' }, deps), /could not deliver/);
  assert.deepEqual(events, ['analyze', 'failed']);
});

test('failed AI analysis never falls back to a basic workout email', async () => {
  const { deps, events } = fixture();
  deps.generateWorkoutReport = async () => { throw new (await import('../../src/shared/email-contract.ts')).EmailError('REPORT_GENERATION_FAILED'); };
  await assert.rejects(sendAccountEmail(user, { reportType: 'workout', reportId: 'session-one' }, deps), /AI report generation failed/);
  assert.deepEqual(events, ['failed']);
});
test('unverified accounts and caller-supplied recipient addresses cannot send email', async () => {
  const { deps, events } = fixture();
  await assert.rejects(sendAccountEmail({ ...user, email_confirmed_at: undefined }, { reportType: 'test' }, deps), /Confirm your account email/);
  await assert.rejects(sendAccountEmail(user, { reportType: 'test', to: 'other@example.com' }, deps), /valid saved report/);
  assert.deepEqual(events, []);
});
test('automatic report preferences can disable email without blocking workout persistence', async () => {
  const { deps, events } = fixture(); deps.preferences = async () => ({ workoutReportEnabled: false });
  const result = await sendAccountEmail(user, { reportType: 'workout', reportId: 'session-one' }, deps, true);
  assert.equal('skipped' in result && result.skipped, true); assert.deepEqual(events, []);
});
