import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Bell, Check, ChevronRight, CircleUserRound, Cloud, Dumbbell, KeyRound, Link2, LoaderCircle, Monitor, Moon, Search, Settings2, ShieldCheck, Sparkles, Sun, X } from 'lucide-react';
import { CloudSyncPanel } from '../components/CloudSyncPanel';
import { HealthConnectPanel } from '../components/HealthConnectPanel';
import { ReleaseSettings } from '../components/ReleaseSettings';
import { McpControlCenter } from '../components/McpControlCenter';
import { UxDiagnostics } from '../components/UxDiagnostics';
import { Modal } from '../components/Modal';
import { SettingsToggle } from '../components/SettingsToggle';
import { CloudConnections } from '../components/CloudConnections';
import { post } from '../lib/api';
import { useDraftState } from '../lib/use-draft';
import { testExerciseMedia } from '../lib/exercise-references';
import { useApp } from '../state/AppContext';
import { useCloudAccount } from '../state/CloudAccountContext';
import { useToast } from '../components/Toast';
import '../settings.css';

const sections = [
  { id: 'Profile', label: 'My profile', icon: CircleUserRound, group: 'Personal', description: 'Your details, in one place.', keywords: 'name height weight units account email' },
  { id: 'Appearance', label: 'Appearance', icon: Monitor, group: 'Personal', description: 'A workspace that feels like you.', keywords: 'theme light dark system today customize home' },
  { id: 'Training', label: 'Training', icon: Dumbbell, group: 'Preferences', description: 'Set your pace. Make it yours.', keywords: 'workout goal rest timer planned flexible week' },
  { id: 'Reports', label: 'Reports', icon: Bell, group: 'Preferences', description: 'Choose what arrives in your inbox.', keywords: 'email notifications weekly monthly schedule summaries' },
  { id: 'Connections', label: 'Connected services', icon: Link2, group: 'Connections', description: 'Bring your tools together.', keywords: 'google drive telegram worker youtube guides backups' },
  { id: 'HEOS MCP', label: 'HEOS MCP', icon: ShieldCheck, group: 'Connections', description: 'Control access from connected AI apps.', keywords: 'chatgpt permissions clients approval privacy writes' },
  { id: 'Privacy', label: 'Privacy & Account', icon: KeyRound, group: 'Workspace', description: 'Account access and permissions.', keywords: 'privacy account sign out permissions' },
  { id: 'Data & account', label: 'Data & Backup', icon: Cloud, group: 'Workspace', description: 'Your records. Your control.', keywords: 'export import backup sign out sync updates diagnostics privacy' },
] as const;
type SectionId = typeof sections[number]['id'];
const resolveSection = (value: string): SectionId => sections.some(section => section.id === value) ? value as SectionId : 'Profile';
type Form = { profileName: string; height: string | number; units: string; weeklyGoal: string | number; restSeconds: string | number; weeklyReportEnabled: boolean; monthlyReportEnabled: boolean; reportSchedule: string; emailTimezone: string; dailyReportEnabled: boolean };
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function Card({ title, description, icon, children }: { title: string; description?: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="settings-card"><header className="settings-card-heading">{icon && <span className="settings-card-icon">{icon}</span>}<div><h3>{title}</h3>{description && <p>{description}</p>}</div></header><div className="settings-card-body">{children}</div></section>;
}

export function WebSettings({ initialTab = '' }: { initialTab?: string } = {}) {
  const app = useApp(), cloud = useCloudAccount(), toast = useToast();
  const [tab, setTab] = useState<SectionId>(() => resolveSection(initialTab));
  useEffect(() => { setTab(resolveSection(initialTab)); }, [initialTab]);
  const [plannedWeek, setPlannedWeek] = useState(app.db?.trainingConfig.preplannedWeekMode !== false);
  useEffect(() => { setPlannedWeek(app.db?.trainingConfig.preplannedWeekMode !== false); }, [app.db?.trainingConfig.preplannedWeekMode]);
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [restore, setRestore] = useState<{ backup: unknown; preview: { newRecords: number; unchanged: number; conflicts: number; total: number; differentOwner: boolean } } | null>(null);
  const [mediaTest, setMediaTest] = useState<{ ok: boolean; message: string } | null>(null);
  const settingsDraft = useDraftState<Form>('settings:public', {
    profileName: app.settings?.profileName || app.db?.profile?.displayName || '', height: app.settings?.height ?? '', units: app.settings?.units || 'kg', weeklyGoal: app.settings?.weeklyGoal ?? 4, restSeconds: app.settings?.restSeconds ?? 90,
    weeklyReportEnabled: (app.settings as any)?.weeklyReportEnabled === true, monthlyReportEnabled: (app.settings as any)?.monthlyReportEnabled === true,
    reportSchedule: app.settings?.reportSchedule || 'Sunday 20:00', emailTimezone: (app.settings as any)?.emailTimezone || 'Asia/Kolkata', dailyReportEnabled: (app.settings as any)?.dailyReportEnabled !== false,
  });
  const form = settingsDraft.value;
  const [baseline, setBaseline] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const currentSection = sections.find(section => section.id === tab)!;
  const visibleSections = sections.filter(section => `${section.label} ${section.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const update = <K extends keyof Form>(key: K, value: Form[K]) => { settingsDraft.setValue(previous => ({ ...previous, [key]: value })); setSaved(false); setError(''); };
  function choose(id: SectionId) { setTab(id); app.setPage('Settings', id); }
  function field(key: 'profileName' | 'height' | 'weeklyGoal' | 'restSeconds', label: string, type = 'text', hint?: string) {
    const bounds = key === 'height' ? { min: 1, max: 300 } : key === 'weeklyGoal' ? { min: 1, max: 7 } : key === 'restSeconds' ? { min: 0, max: 3600 } : {};
    return <label className="settings-field"><span>{label}</span><input className="input" type={type} aria-label={label} aria-describedby={hint ? `settings-hint-${key}` : undefined} {...bounds} value={form[key]} disabled={busy || !settingsDraft.ready} onChange={event => update(key, event.target.value)} autoComplete={type === 'password' ? 'new-password' : key === 'profileName' ? 'name' : undefined}/>{hint && <small id={`settings-hint-${key}`}>{hint}</small>}</label>;
  }
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await work(); toast.push(message, 'ok'); return true; }
    catch (cause) { const message = (cause as Error).message; setError(message); toast.push(message, 'err'); return false; }
    finally { setBusy(false); }
  }
  async function save() {
    if (!Number.isInteger(Number(form.weeklyGoal)) || Number(form.weeklyGoal) < 1 || Number(form.weeklyGoal) > 7) { choose('Training'); throw new Error('Choose a weekly workout goal between 1 and 7.'); }
    if (form.restSeconds === '' || !Number.isFinite(Number(form.restSeconds)) || Number(form.restSeconds) < 0 || Number(form.restSeconds) > 3600) { choose('Training'); throw new Error('Choose a rest timer between 0 and 3600 seconds.'); }
    if (form.height !== '' && (!Number.isFinite(Number(form.height)) || Number(form.height) < 1 || Number(form.height) > 300)) { choose('Profile'); throw new Error('Enter a height between 1 and 300 cm, or leave it blank.'); }
    if (!/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) ([01][0-9]|2[0-3]):[0-5][0-9]$/.test(form.reportSchedule)) { choose('Reports'); throw new Error('Choose a valid report day and time.'); }
    await app.api.saveSettings({ ...form, weeklyGoal: Number(form.weeklyGoal), restSeconds: Number(form.restSeconds) });
    await app.refresh();
    const clean = { ...form };
    settingsDraft.setValue(clean); setBaseline(clean); await settingsDraft.clear(); setSaved(true);
  }
  const toggle = (key: 'dailyReportEnabled' | 'weeklyReportEnabled' | 'monthlyReportEnabled', label: string, description: string) => <SettingsToggle label={label} description={description} checked={form[key]} disabled={busy || !settingsDraft.ready} onChange={value => update(key, value)}/>;
  const [scheduleDay = 'Sunday', scheduleTime = '20:00'] = form.reportSchedule.split(' ');
  const editable = ['Profile', 'Training', 'Reports'].includes(tab);
  const name = app.settings?.profileName || app.db?.profile?.displayName || 'Your profile';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();

  return <div className="settings-workspace">
    <header className="settings-hero"><div><span className="settings-eyebrow">MAKE HEALTH OS YOURS</span><h1>Settings<span>.</span></h1><p>A little personalization. A better everyday experience.</p></div><span className="settings-cloud-badge"><Cloud size={15}/> Cloud workspace</span></header>
    <div className="settings-layout">
      <aside className="settings-sidebar" aria-label="Settings navigation">
        <button className="settings-account-preview" onClick={() => choose('Profile')}><span className="settings-avatar">{initials}</span><span><strong>{name}</strong><small>Personal account</small></span><ChevronRight size={16}/></button>
        <label className="settings-search"><Search size={16}/><input type="search" aria-label="Search settings" placeholder="Find a setting…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Clear settings search" onClick={() => setQuery('')}><X size={15}/></button>}</label>
        <nav role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0 || !buttons.length) return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].focus(); buttons[next].click();
        }}>
          {['Personal', 'Preferences', 'Connections', 'Workspace'].map(group => <div className="settings-nav-group" key={group}>{visibleSections.some(section => section.group === group) && <span>{group}</span>}{visibleSections.filter(section => section.group === group).map(section => <button type="button" role="tab" id={`settings-tab-${section.id.replaceAll(' ', '-')}`} aria-selected={tab === section.id} aria-controls="settings-panel" tabIndex={tab === section.id || (!visibleSections.some(section => section.id === tab) && section === visibleSections[0]) ? 0 : -1} className={tab === section.id ? 'active' : ''} key={section.id} onClick={() => choose(section.id)}><section.icon size={18}/><span>{section.label}</span><ChevronRight size={14}/></button>)}</div>)}
          {!visibleSections.length && <p className="settings-no-results">No settings found. Try “email”, “theme” or “backup”.</p>}
        </nav>
        <div className="settings-sidebar-note"><ShieldCheck size={18}/><p>Your health. Your settings.<br/><span>Always in your control.</span></p></div>
      </aside>
      <div className="settings-main">
        <div id="settings-panel" role="tabpanel" tabIndex={0} aria-label={currentSection.label} className="settings-panel">
          <header className="settings-section-heading"><span className="settings-section-symbol"><currentSection.icon size={22}/></span><div><h2>{currentSection.label}</h2><p>{currentSection.description}</p></div><span className="settings-section-index">{String(sections.indexOf(currentSection) + 1).padStart(2, '0')} / 08</span></header>
          <fieldset className="settings-content-fields" disabled={busy || !settingsDraft.ready}>
          {tab === 'Profile' && <>
            <div className="settings-profile-banner"><span className="settings-avatar large">{initials}</span><div><strong>{name}</strong><p>{cloud.user?.email}</p><span><CircleUserRound size={13}/> Your Health OS account</span></div><span className="settings-profile-mark"><Settings2 size={68} strokeWidth={1}/></span></div>
            <Card title="Personal details" description="The details that make your workspace personal." icon={<CircleUserRound size={19}/>}>
              <div className="settings-fields-grid">{field('profileName', 'Your name', 'text', 'Shown throughout your workspace.')}<label className="settings-field"><span>Account email</span><input className="input" value={cloud.user?.email || ''} readOnly/><small>Managed by your signed-in account.</small></label></div>
            </Card>
            <Card title="Body & measurements" description="Keep your measurements consistent across Health OS." icon={<Dumbbell size={19}/>}><div className="settings-fields-grid">{field('height', 'Height (cm)', 'number', 'Optional. Used with your body measurements.')}<div className="settings-field"><span id="settings-units-label">Weight units</span><div className="settings-segmented" role="group" aria-labelledby="settings-units-label">{[['kg', 'Kilograms', 'kg'], ['lb', 'Pounds', 'lb']].map(([value, label, unit]) => <button type="button" aria-pressed={form.units === value} className={form.units === value ? 'active' : ''} key={value} onClick={() => update('units', value)}><strong>{unit}</strong><span>{label}</span>{form.units === value && <Check size={15}/>}</button>)}</div></div></div></Card>
            <div className="settings-tip"><ShieldCheck size={18}/><p>Your profile is shared across your Health OS workspaces. Save once to keep your details in sync.</p></div>
          </>}
          {tab === 'Appearance' && <>
            <Card title="Choose your theme" description="Applied immediately on this device." icon={<Sun size={19}/>}><div className="settings-theme-options">{([{ id: 'light', label: 'Light', icon: Sun, hint: 'Fresh & bright' }, { id: 'dark', label: 'Dark', icon: Moon, hint: 'Easy on the eyes' }, { id: 'system', label: 'System', icon: Monitor, hint: 'Follow your device' }] as const).map(theme => <button type="button" key={theme.id} className={`settings-theme ${theme.id} ${app.appearance === theme.id ? 'selected' : ''}`} aria-pressed={app.appearance === theme.id} onClick={() => app.setAppearance(theme.id)}><span className="settings-theme-preview"><i/><span><i/><i/><i/></span></span><span className="settings-theme-label"><theme.icon size={16}/><strong>{theme.label}</strong>{app.appearance === theme.id && <Check size={16}/>}</span><small>{theme.hint}</small></button>)}</div></Card>
            <div className="settings-tip"><Check size={18}/><p>Theme changes apply instantly. Dashboard choices save when you confirm them.</p></div>
          </>}
          {tab === 'Training' && <>
            <Card title="Workout defaults" description="A few small choices for a smoother session." icon={<Dumbbell size={19}/>}><div className="settings-fields-grid">{field('weeklyGoal', 'Weekly workout goal', 'number', '1–7 workouts per week.')}{field('restSeconds', 'Rest timer (seconds)', 'number', '0–3600 seconds. You can adjust it during a workout.')}</div></Card>
            <Card title="Your training week" description="Choose how you like to plan." icon={<Settings2 size={19}/>}><SettingsToggle label="Use a planned training week" description="On: follow your plan. Off: choose exercises as you train." checked={plannedWeek} disabled={busy} onChange={checked => { const previous = plannedWeek; setPlannedWeek(checked); void act(async () => { await app.api.saveTrainingConfig({ preplannedWeekMode: checked }); await app.refresh(); }, 'Training mode updated.').then(ok => { if (!ok) setPlannedWeek(previous); }); }}/><div className="settings-action-row"><p>Training mode saves immediately.</p><button type="button" className="btn btn-soft" onClick={() => app.setPage('Planner')}>Open planner <ChevronRight size={15}/></button></div></Card>
          </>}
          {tab === 'Reports' && <>
            <div className="settings-tip"><Bell size={18}/><p>Delivered to <strong>{cloud.user?.email}</strong>. Scheduled reports continue in the cloud when you close the app.</p></div>
            <Card title="Email preferences" description="Only the updates you want." icon={<Bell size={19}/>}>
              {toggle('dailyReportEnabled', 'Email my daily report at 23:00 IST', 'One daily review of training, nutrition, recovery and body measurements.')}
              {toggle('weeklyReportEnabled', 'Email weekly summaries', 'A regular check-in on your training progress.')}
              <div className={`settings-schedule ${!form.weeklyReportEnabled ? 'muted' : ''}`}><label className="settings-field"><span>Report day</span><select className="input" aria-label="Report day" value={scheduleDay} disabled={!form.weeklyReportEnabled || busy} onChange={event => update('reportSchedule', `${event.target.value} ${scheduleTime}`)}>{days.map(day => <option key={day}>{day}</option>)}</select></label><label className="settings-field"><span>Report time</span><input className="input" type="time" aria-label="Report time" value={scheduleTime} disabled={!form.weeklyReportEnabled || busy} onChange={event => update('reportSchedule', `${scheduleDay} ${event.target.value}`)}/></label><small>Time zone: {form.emailTimezone}</small></div>
              {toggle('monthlyReportEnabled', 'Email monthly summaries', 'The previous month, on the first day at 20:00 India time.')}
            </Card>
            <Card title="Delivery & history" description="Check your inbox or revisit a saved report."><div className="settings-action-row"><p>Workouts are saved immediately. Your daily report is prepared at 23:00 IST; failed delivery stays queued for retry.</p><div className="settings-button-group"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => void act(() => app.api.sendDummyEmail(), 'Test email accepted for delivery. Check your inbox and spam folder.')}>Send test email</button><button type="button" className="btn btn-soft" onClick={() => app.setPage('Reports', 'Workout Reports')}>Open saved reports</button></div></div></Card>
          </>}

          {tab === 'Connections' && <>
            <HealthConnectPanel/>
            <Card title="Exercise guides" description="Built into Health OS. No API key needed." icon={<Link2 size={19}/>}><section aria-label="YouTube guides connection"><div className="settings-action-row"><div><strong>YouTube guides</strong><p>Exercise guides are saved in the shared community library.</p></div><button type="button" className="btn btn-soft" disabled={busy} onClick={() => void act(async () => { try { const message = await testExerciseMedia('youtube'); setMediaTest({ ok: true, message }); } catch (cause) { setMediaTest({ ok: false, message: (cause as Error).message }); throw cause; } }, 'YouTube connection checked.')}>Test YouTube guides</button></div>{mediaTest && <p role={mediaTest.ok ? 'status' : 'alert'} className="settings-helper">{mediaTest.message}</p>}</section></Card>
            <Card title="Services & integrations" description="Cloud backups, messaging and your personal worker." icon={<Cloud size={19}/>}><CloudConnections/></Card>
          </>}
          {tab === 'HEOS MCP' && <Card title="Connected AI apps" description="Manage read access, write permissions and approvals." icon={<ShieldCheck size={19}/>}><McpControlCenter/></Card>}
          {(tab === 'Data & account'||tab === 'Privacy') && <>
            {tab==='Data & account'&&<CloudSyncPanel/>}
            <Card title="Backups & records" description="Keep a copy. Bring your own records back." icon={<Cloud size={19}/>}><p className="settings-helper">Your records sync to your cloud account. Imports add missing records and preserve existing conflicting edits.</p><div className="settings-data-actions"><button type="button" disabled={busy} onClick={() => void act(async () => { const data = await app.api.getBackup(); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `health-os-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, 'Backup exported.')}><ArrowDownToLine size={22}/><strong>Export all records</strong><span>Download a JSON backup</span></button><label><ArrowUpFromLine size={22}/><strong>Import a backup</strong><span>Review before restoring</span><input type="file" accept="application/json,.json" aria-label="Import a Health OS backup" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void act(async () => { const backup = JSON.parse(await file.text()); const preview = await post<any>('/api/backup/preview', backup); setRestore({ backup, preview }); }, 'Backup checked. Review the preview before importing.'); }}/></label></div></Card>
            <Card title="Account & privacy" description="Manage your account and review how data is used." icon={<KeyRound size={19}/>}><div className="settings-action-row"><div><strong>Signed in</strong><p>{cloud.user?.email}</p></div><button type="button" className="btn btn-soft" disabled={busy} onClick={() => void act(() => cloud.syncNow(), 'Cloud records refreshed.')}>Refresh cloud records</button></div><div className="settings-action-row"><div><strong>Permissions & privacy</strong><p>Connected services, notifications and account storage.</p></div><button type="button" className="btn btn-soft" onClick={() => choose('HEOS MCP')}>Review permissions</button></div><div className="settings-action-row"><div><strong>Sign out of this account</strong><p>Return to the sign-in screen on this device.</p></div><button type="button" className="btn btn-soft settings-signout" disabled={busy} onClick={() => void act(() => cloud.signOut(), 'Signed out.')}>Sign out</button></div></Card>
            <Card title="App updates" description="Your installed version and available updates."><ReleaseSettings/></Card>
            <details className="settings-advanced"><summary>Advanced diagnostics <ChevronRight size={16}/></summary><UxDiagnostics/></details>
          </>}
          </fieldset>
        </div>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {(editable || dirty) && <footer className={`settings-save-bar ${dirty ? 'has-changes' : ''}`}><div role="status" aria-live="polite">{busy ? <LoaderCircle size={17} className="settings-spinner"/> : dirty ? <span className="settings-unsaved-dot"/> : <Check size={17}/>}<span><strong>{busy ? 'Working…' : dirty ? 'You have unsaved changes' : saved ? 'Settings saved' : 'You’re all up to date'}</strong><small>{dirty ? settingsDraft.status || 'Save to update your cloud account.' : 'Profile and preferences in one place.'}</small></span></div><div className="settings-button-group">{dirty && <button type="button" className="btn btn-soft" disabled={busy || !settingsDraft.ready} onClick={async () => { settingsDraft.setValue(baseline); await settingsDraft.clear(); setSaved(false); setError(''); }}>Discard changes</button>}<button type="button" className="btn btn-hot" disabled={busy || !settingsDraft.ready || !dirty} onClick={() => void act(save, 'Settings saved to your cloud account.')}><Check size={16}/>{busy ? 'Saving…' : 'Save changes'}</button></div></footer>}
      </div>
    </div>
    <Modal open={!!restore} title="Review backup import" onClose={() => { if (!busy) setRestore(null); }}>{restore && <div className="stack"><p>{restore.preview.total} records checked: {restore.preview.newRecords} new, {restore.preview.unchanged} unchanged, {restore.preview.conflicts} conflicts.</p><p>New records are added. Current conflicting records are preserved. The import does not replace your account.</p>{restore.preview.differentOwner && <p>This backup was exported from another account. Confirm that these records belong in your signed-in account.</p>}<button type="button" className="btn btn-hot" disabled={busy} onClick={() => void act(async () => { const result = await app.api.restoreBackup(restore.backup as Parameters<typeof app.api.restoreBackup>[0]) as any; await app.refresh(); setRestore(null); if (result.conflicts) toast.push(`${result.conflicts} conflicting records were preserved.`, 'info'); }, 'Backup imported into your cloud account.')}>Confirm import</button><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setRestore(null)}>Cancel import</button></div>}</Modal>
  </div>;
}
