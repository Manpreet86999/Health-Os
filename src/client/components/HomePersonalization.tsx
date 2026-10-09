import { useState } from 'react';
import { useUx } from '../state/UxContext';
import { HOME_SUMMARIES } from '../../shared/ux';
import { Modal } from './Modal';
export function HomePersonalization({iconOnly=false}:{iconOnly?:boolean}) {
  const { preferences, save, saving } = useUx();
  const [open, setOpen] = useState(false), [form, setForm] = useState(preferences), [error, setError] = useState('');
  return <><button type="button" className={iconOnly?"icon-btn ux-personalize-corner":"btn btn-soft ux-personalize-button"} aria-label="Customize Today" title="Customize Today" onClick={() => { setForm(preferences); setError(''); setOpen(true); }}>{iconOnly?<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16l-1 4Z"/></svg>:'Customize Today'}</button>
    <Modal open={open} title="Make Health OS yours" onClose={() => setOpen(false)}><form className="stack" onSubmit={async event => { event.preventDefault(); setError(''); try { await save(form); setOpen(false); } catch (cause) { setError((cause as Error).message); } }}>
      <fieldset className="ux-fieldset stack" disabled={saving}><legend>Choose up to three home summaries</legend>{HOME_SUMMARIES.map(name => <label key={name}><input type="checkbox" checked={form.homeSummaries.includes(name)} disabled={!form.homeSummaries.includes(name) && form.homeSummaries.length >= 3} onChange={event => setForm(previous => ({ ...previous, homeSummaries: event.target.checked ? [...previous.homeSummaries, name] : previous.homeSummaries.filter(value => value !== name) }))}/>{name}</label>)}
      <h3>Choose up to five favorite logging actions</h3>{['Water', 'Food', 'Weight', 'Workout', 'Symptom', 'Pain', 'Supplement', 'Medication', 'Body Measurement', 'Care Observation', 'Note', 'Check-in'].map(name => <label key={name}><input type="checkbox" checked={form.quickLogFavorites.includes(name)} disabled={!form.quickLogFavorites.includes(name) && form.quickLogFavorites.length >= 5} onChange={event => setForm(previous => ({ ...previous, quickLogFavorites: event.target.checked ? [...previous.quickLogFavorites, name] : previous.quickLogFavorites.filter(value => value !== name) }))}/>{name}</label>)}{error && <p role="alert">{error}</p>}<button className="btn btn-hot">{saving ? 'Saving…' : 'Save preferences'}</button></fieldset>
    </form></Modal></>;
}
