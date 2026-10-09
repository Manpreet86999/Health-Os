import { useEffect, useState } from 'react';
import { post } from '../lib/api';
import { ExerciseMedia } from './ExerciseMedia';
import type { Exercise } from '../../shared/types';

export function ExerciseReferences({ exercise, saved }: { exercise: string; saved?: Exercise }) {
  const identity = saved?.id || exercise;
  const [result, setResult] = useState<{ identity: string; exercise: Exercise }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLink(''); }, [identity]);
  async function contribute(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = await post<{ exercise: Exercise; errors: string[] }>('/api/exercise-catalog/media', { name: exercise, exerciseId: saved?.id, youtubeUrl: link, action: 'contribute' });
      setResult({ identity, exercise: data.exercise }); setLink('');
      window.dispatchEvent(new Event('body-os-cloud-refresh'));
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    void post<{ exercise: Exercise; errors: string[] }>('/api/exercise-catalog/media', { name: exercise, exerciseId: saved?.id }).then(data => {
      if (active) { setResult({ identity, exercise: data.exercise }); setError(data.errors.join(' ')); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [identity, exercise, saved?.id, attempt]);
  const current = result?.identity === identity ? result.exercise : saved;
  return <section className="stack" style={{ margin: '16px 0' }} aria-label="Exercise references">
    <ExerciseMedia key={identity} media={current?.media} name={exercise} />
    <form className="stack" onSubmit={contribute}>
      <label className="stack">Contribute a YouTube guide<input className="input" type="url" required value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
      <p className="subtle">Saved guides are shared with everyone. A new link replaces this exercise’s current guide.</p>
      <button className="btn btn-soft" type="submit" disabled={saving || busy || !link.trim()}>{saving ? 'Saving…' : 'Save for everyone'}</button>
    </form>
    {busy && <p role="status">Loading movement guide…</p>}
    {error && <><p role="alert" className="subtle">{error}</p><button type="button" className="btn btn-soft btn-sm" onClick={() => setAttempt(n => n + 1)}>Retry missing guides</button></>}
  </section>;
}
