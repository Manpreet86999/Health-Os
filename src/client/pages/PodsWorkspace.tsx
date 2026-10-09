import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCheck, Copy, HeartHandshake, Link2, LockKeyhole, Plus, ShieldCheck, Sprout, Target, UserRound, Users } from 'lucide-react';
import { friendPods } from '../lib/pods-service';
import { useCloudAccount } from '../state/CloudAccountContext';
import { dateOf } from '../../shared/biology';
import { shiftDay } from '../../shared/biological-intelligence';
import { Modal } from '../components/Modal';
import './pods-workspace.css';

function Connection({ connected = false }: { connected?: boolean }) {
  return <div className={`pod-connection ${connected ? 'is-connected' : ''}`} aria-hidden="true">
    <div className="pod-person"><span className="pod-avatar"><UserRound /></span><span>You</span></div>
    <div className="pod-connection-thread"><span /><HeartHandshake size={25} /><span /></div>
    <div className="pod-person"><span className="pod-avatar pod-avatar-partner"><UserRound /></span><span>{connected ? 'Your partner' : 'Someone in your corner'}</span></div>
  </div>;
}

export function PodsWorkspace() {
  const cloud = useCloudAccount(), uid = cloud.user?.id;
  const [selected, setSelected] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [goal, setGoal] = useState(''), [frequency, setFrequency] = useState(3), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null), [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'join' | 'leave' | null>(null);
  const today = dateOf(new Date().toISOString());
  const [week, setWeek] = useState(() => shiftDay(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7))), end = shiftDay(week, 6);
  const pods = useQuery({ queryKey: ['friend-pods', cloud.savedConfig?.url, uid], queryFn: friendPods.list, enabled: !!uid, retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  const pod = pods.data?.find(item => item.id === selected) || pods.data?.[0];
  const details = useQuery({ queryKey: ['friend-pod-details', cloud.savedConfig?.url, uid, pod?.id, week], queryFn: async () => {
    const [goals, members, completions] = await Promise.all([friendPods.goals(pod!.id), friendPods.members(pod!.id), friendPods.weeklyCompletions(pod!.id, week, end)]);
    return { goals, members, completions };
  }, enabled: !!uid && !!pod, retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  useEffect(() => { setInvite(null); setCopied(false); }, [pod?.id]);
  const owner = pod?.owner_id === uid, connected = (details.data?.members.length ?? 0) === 2;
  const memberName = (id: string) => id === uid ? 'You' : 'Your partner';
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await pods.refetch(); if (pod) await details.refetch(); }
    catch (exception) { setError((exception as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="flow-workspace stack pods-workspace">
    <header className="bio-page-head pod-page-head"><div><p className="bio-eyebrow">PODS / BETTER TOGETHER</p><h1>A little accountability, together.</h1><p className="subtle">Small steps. A shared rhythm. Someone in your corner.</p></div><span className="pod-private-badge"><LockKeyhole size={14} /> Just the two of you</span></header>
    {pods.isPending && uid && <p role="status">Loading your Pods…</p>}
    {pods.error && <section className="pod-panel"><h2>Pods could not connect</h2><p role="alert">{pods.error.message}</p><button className="btn btn-soft" onClick={() => void pods.refetch()}>Retry</button></section>}
    <div className="pod-workspace-grid">
      <div className="pod-main">
        {!pod && <section className="pod-welcome pod-panel">
          <span className="pod-kicker"><HeartHandshake size={16} /> A SMALL CIRCLE. A REAL CONNECTION.</span>
          <Connection />
          <div className="pod-welcome-copy"><h2>Good habits feel better<br />with good company.</h2><p>Bring a friend, a training partner, or someone you trust.<br className="pod-desktop-break" /> Pick a goal and keep showing up for each other.</p></div>
          <div className="pod-welcome-actions"><button className="btn btn-hot" onClick={() => document.getElementById('pod-name')?.focus()}>Start a Pod <ArrowRight size={16} /></button><button className="pod-text-button" onClick={() => document.getElementById('pod-invitation')?.focus()}>I have an invitation</button></div>
          <div className="pod-how"><div><span><Users size={19} /></span><h3>Find your person</h3><p>One invitation. Just you two.</p></div><div><span><Target size={19} /></span><h3>Share a small goal</h3><p>Make it something you can repeat.</p></div><div><span><Sprout size={19} /></span><h3>Grow together</h3><p>Every check-in is a little support.</p></div></div>
          {pods.data?.length === 0 && <p className="pod-empty-caption">No Pods yet. Create one or accept a friend’s invitation.</p>}
        </section>}
        {pod && <>
          <section className="pod-panel pod-together"><div className="pod-section-heading"><div><span className="pod-kicker">YOUR SHARED SPACE</span><h2>{pod.name}</h2></div><span className="pod-private-badge"><Users size={14} /> {details.data ? `${details.data.members.length} / 2 members` : 'Two-person Pod'}</span></div><Connection connected={connected} /><p>{connected ? 'Keep showing up. Every small step counts for both of you.' : owner ? 'Your space is ready. Invite your person to take the next step together.' : 'You’re in. Start with one small goal you can work on together.'}</p></section>
          <section className="pod-panel pod-goals"><div className="pod-section-heading"><div><span className="pod-kicker">ONE SMALL STEP AT A TIME</span><h2>Shared goals</h2></div><label className="pod-week-label">Week starting<input className="input" type="date" max={today} value={week} onChange={event => event.target.value && setWeek(event.target.value)} /></label></div>
            <p className="pod-week-caption">{new Date(`${week}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(`${end}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · Check in when you’ve done it.</p>
            {details.isPending && <p role="status">Loading shared progress…</p>}{details.error && <p role="alert">{details.error.message}</p>}
            {details.data?.goals.length === 0 && <div className="pod-goals-empty"><Target size={27} /><h3>Your first shared win starts here.</h3><p>No shared goals yet. Try a daily walk, a workout, or a little time to unwind.</p></div>}
            {details.data?.goals.map(item => <article className="pod-goal" key={item.id}><div className="pod-goal-heading"><span className="pod-goal-icon"><Target size={20} /></span><h3>{item.name} · {item.target_per_week} days/week</h3></div><div className="pod-member-progress">{details.data.members.map(member => {
              const count = new Set(details.data.completions.filter(row => row.goal_id === item.id && row.user_id === member.user_id && row.completed).map(row => row.day)).size;
              return <div className="pod-progress-person" key={member.user_id}><div><span className={`pod-mini-avatar ${member.user_id !== uid ? 'pod-avatar-partner' : ''}`}><UserRound size={16} /></span><span>{memberName(member.user_id)} · {count} / {item.target_per_week} days</span>{count >= item.target_per_week && <CheckCheck size={17} />}</div><progress max={item.target_per_week} value={Math.min(count, item.target_per_week)} aria-label={`${item.name} progress for ${memberName(member.user_id).toLowerCase()}`} /></div>;
            })}</div><div className="pod-checkin-label">Your check-ins</div><div className="pod-days">{Array.from({ length: 7 }, (_, i) => shiftDay(week, i)).map(day => {
              const completed = details.data.completions.some(row => row.goal_id === item.id && row.user_id === uid && row.day === day && row.completed);
              return <button key={day} className={`pod-day ${day === today ? 'is-today' : ''}`} aria-label={`${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} ${completed ? 'completed' : 'check in'}`} aria-pressed={completed} disabled={busy || day > today} onClick={() => void run(() => friendPods.complete(pod.id, item.id, day, !completed))}><span>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{completed ? <Check size={18} /> : new Date(`${day}T12:00:00`).getDate()}</strong></button>;
            })}</div></article>)}
            <form className="pod-add-goal" onSubmit={event => { event.preventDefault(); void run(async () => { await friendPods.addGoal(pod.id, goal.trim(), frequency); setGoal(''); }); }}><label>Shared goal<input className="input" required maxLength={120} placeholder="e.g. Take a 20-minute walk" value={goal} onChange={event => setGoal(event.target.value)} /></label><label>Days per week<input className="input" required type="number" min={1} max={7} value={frequency} onChange={event => setFrequency(Number(event.target.value))} /></label><button className="btn btn-hot" disabled={busy || !goal.trim()}><Plus size={16} /> Add goal</button></form>
          </section>
        </>}
        <details className="pod-panel pod-privacy"><summary><ShieldCheck size={19} /><span>Shared goals. Personal boundaries.</span><span className="pod-privacy-expand">Sharing & privacy</span></summary><p>Two members per Pod. Invitations expire after 48 hours and require explicit acceptance. Only goal metadata and manual goal completion are shared. Labs, medications, private notes, food diaries and photos are excluded. Leaving revokes membership access; personal health records remain yours.</p></details>
      </div>
      <aside className="pod-sidebar">
        <section className="pod-panel pod-start"><div className="pod-section-heading"><h2>Your Pods</h2><span className="pod-mini-avatar"><Users size={17} /></span></div>
          {!!pods.data?.length && <div className="pod-list">{pods.data.map(item => <button key={item.id} className="pod-list-item" aria-pressed={pod?.id === item.id} onClick={() => setSelected(item.id)}><span className="pod-mini-avatar"><HeartHandshake size={17} /></span><span>{item.name}<small>{item.owner_id === uid ? 'Created by you' : 'You’re a member'}</small></span><ArrowRight size={16} /></button>)}</div>}
          <div className="pod-form-intro"><h3>{pod ? 'Make another connection' : 'Start your own little circle'}</h3><p>Give it a name that feels like you.</p></div>
          <form className="pod-form" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await friendPods.create(name.trim()); setSelected(result.id); setName(''); }); }}><label>Pod name<input id="pod-name" className="input" required maxLength={80} placeholder="e.g. The morning crew" value={name} onChange={event => setName(event.target.value)} /></label><button className="btn btn-hot" disabled={busy || !name.trim() || !!pods.error || !uid}><Plus size={17} /> Create Pod</button></form>
          <div className="pod-form-divider"><span>or join your person</span></div><div className="pod-form"><label>Invitation code<input id="pod-invitation" className="input pod-code-input" autoComplete="off" spellCheck={false} maxLength={32} placeholder="Paste the code they shared" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))} /></label><button className="btn btn-soft" disabled={busy || code.length !== 32 || !!pods.error || !uid} onClick={() => setConfirm('join')}><Link2 size={16} /> Review & join</button></div><p className="pod-safe-note"><LockKeyhole size={13} /> Your personal health records stay private.</p>
        </section>
        {pod && <section className="pod-panel pod-members"><div className="pod-section-heading"><h2>Members & invitations</h2><span className="pod-kicker">{owner ? 'Owner' : 'Member'}</span></div>{details.data?.members.map(member => <div className="pod-member" key={member.user_id}><span className={`pod-mini-avatar ${member.user_id !== uid ? 'pod-avatar-partner' : ''}`}><UserRound size={18} /></span><div><strong>{memberName(member.user_id)}</strong><small>Joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>{owner && member.user_id !== uid && <button className="btn btn-soft" disabled={busy} onClick={() => void run(() => friendPods.remove(pod.id, member.user_id))}>Remove member</button>}</div>)}
          {owner && <div className="pod-invite-actions"><p>{connected ? 'Your circle is complete.' : 'Good company is one invitation away.'}</p><button className="btn btn-hot" disabled={busy || (details.data?.members.length ?? 2) >= 2} onClick={() => void run(async () => { setInvite(await friendPods.invite(pod.id)); setCopied(false); })}><Link2 size={16} /> Generate invitation</button><button className="pod-text-button" disabled={busy} onClick={() => void run(async () => { await friendPods.revoke(pod.id); setInvite(null); })}>Revoke invitations</button></div>}
          {invite && <div className="pod-invite-code"><span className="pod-kicker">YOUR INVITATION</span><code>{invite.code}</code><button className="btn btn-soft" onClick={async () => { try { await navigator.clipboard.writeText(invite.code); setCopied(true); } catch { setError('Could not copy. Select the invitation code and copy it manually.'); } }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy invitation'}</button><p>Expires {new Date(invite.expiresAt).toLocaleString()}. Share only with your intended member.</p><span role="status">{copied ? 'Invitation copied to clipboard.' : ''}</span></div>}
          <button className="pod-text-button pod-disconnect" disabled={busy} onClick={() => setConfirm('leave')}>{owner ? 'Delete Pod & disconnect' : 'Leave Pod'}</button>
        </section>}
      </aside>
    </div>{error && <p role="alert" className="pod-error">{error}</p>}
    <Modal open={!!confirm} title={confirm === 'join' ? 'Accept Pod sharing' : 'Disconnect Pod'} onClose={() => !busy && setConfirm(null)}><p>{confirm === 'join' ? 'Joining gives both members access to shared goal names and completion history. Your personal health records are excluded.' : owner ? 'Deleting this Pod removes its shared goals, invitations and completions for both members. Personal health records remain yours.' : 'Leaving removes your membership and shared completions. Personal health records remain yours.'}</p><button className="btn btn-hot" disabled={busy} onClick={() => void run(async () => { if (confirm === 'join') { const result = await friendPods.accept(code); setSelected(result.id); setCode(''); } else if (pod) { await friendPods.leave(pod.id); setSelected(''); } setConfirm(null); })}>{confirm === 'join' ? 'Accept & join' : owner ? 'Delete Pod' : 'Leave Pod'}</button></Modal>
  </div>;
}

