import { canonical } from '../../shared/cloud';
import { useCloudAccount, resolveConflictChoice } from '../state/CloudAccountContext';

const labels = {
  loading: 'Checking your Supabase account…', 'signed-out': 'Connect your personal Supabase project to sync devices.', saved: 'Saved', syncing: 'Syncing',
  offline: 'Offline — records will sync when you reconnect.', pending: 'Sync pending', 'needs-review': 'Needs review', error: 'Sync pending — local records are still safe on this device.',
} as const;

export function CloudSyncPanel() {
  const cloud = useCloudAccount();
  const conflicts = cloud.result?.conflicts || [];
  return <section className="glass card stack" aria-label="Device sync">
    <div className="row justify-between" style={{ alignItems: 'center' }}><h3 style={{ margin: 0 }}>Device sync</h3><span className={`chip ${cloud.status === 'saved' ? 'ready-ok' : ''}`}>{labels[cloud.status]}</span></div>
    <p className="subtle">{cloud.user?'Your connected account syncs records between devices. Your local cache keeps them available offline.':'Your records are available locally. Connect an optional account from Sync to share them between your devices.'}</p>
    {cloud.migrationRequired && <div className="box"><strong>First sync review</strong><p className="subtle">{cloud.migrationPreview ? `${cloud.migrationPreview.localRecords} cached records and ${cloud.migrationPreview.remoteRecords} Supabase records will be compared. Conflicting changes are held for your review.` : 'Preparing your first secure sync…'}</p><button type="button" className="btn btn-primary" disabled={!cloud.migrationPreview} onClick={() => void cloud.approveMigration()}>Compare and sync records</button></div>}
    {!cloud.user ? <p className="subtle">Sign in from the workspace connection screen.</p> : <>
      <p className="subtle" style={{ margin: 0 }}>Connected as {cloud.user.email || 'Supabase account'} · {cloud.savedConfig?.url}</p><div className="row"><button type="button" className="btn btn-primary" disabled={cloud.status === 'syncing'} onClick={() => void cloud.syncNow()}>{cloud.status === 'syncing' ? 'Syncing…' : 'Sync now'}</button><button type="button" className="btn btn-soft" disabled={cloud.status === 'syncing'} onClick={() => void cloud.signOut()}>Disconnect project</button></div>
    </>}
    <div role="status" className="subtle">{cloud.error || (cloud.result ? `${cloud.result.uploaded} uploaded · ${cloud.result.downloaded} downloaded · ${conflicts.length} need review` : labels[cloud.status])}</div>
    {conflicts.map((conflict) => {
      const local = conflict.local.payload as Record<string, unknown>, remote = conflict.remote.payload as Record<string, unknown>;
      const changed = Array.from(new Set([...Object.keys(local), ...Object.keys(remote)])).filter((key) => canonical(local[key]) !== canonical(remote[key]));
      return <details key={conflict.key}><summary>Review {String(local.name || local.date || conflict.key)}</summary><p className="subtle">Changed fields: {changed.join(', ') || 'Record state'}.</p><select className="input" aria-label={`Resolve ${conflict.key}`} value={cloud.choices[conflict.key]?.side || ''} onChange={(event) => cloud.choose(conflict.key, event.target.value ? resolveConflictChoice(conflict, event.target.value as 'local' | 'remote') : null)}><option value="">Choose which version to keep…</option><option value="remote">Keep Supabase version</option><option value="local">Keep this device's version</option></select></details>;
    })}
    {conflicts.length > 0 && <><p className="subtle">Both versions remain safe until you choose. Apply your selections to continue syncing.</p><button className="btn btn-primary" disabled={cloud.status === 'syncing' || !Object.keys(cloud.choices).length} onClick={() => void cloud.syncNow()}>Apply selected versions</button></>}
  </section>;
}
