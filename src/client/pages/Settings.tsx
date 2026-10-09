import { useDraftState } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { cloudFetch as fetch } from '../lib/cloud-api';
import { AutomationSettings } from '../components/AutomationSettings';
import { LoadIncrementEditor } from '../components/LoadIncrementEditor';
import { CloudSyncPanel } from '../components/CloudSyncPanel';
import { ExerciseIntegrationSettings } from '../components/ExerciseIntegrationSettings';
import { useEffect, useState } from 'react';
import { getAuthToken, post, setAuthToken } from '../lib/api';
import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { UPDATES_DISCONNECTED_MESSAGE } from '../../shared/update-repo';

interface FreeModel {
  id: string;
  label: string;
  notes: string;
  rank: number;
}

export function Settings({profileOnly=false}:{profileOnly?:boolean}) {
  const app = useApp();
  const toast = useToast();
  const { settings, refresh, toggleTheme, theme } = app;
  const settingsDraft=useDraftState('legacy-settings',() => ({
    userEmail: settings?.userEmail || '',
    recipients: (settings?.recipients || []).join(', '),
    streakStartDate: settings?.streakStartDate || '',
    aiProvider: settings?.aiProvider || 'openrouter',
    aiModel: settings?.aiModel || 'openrouter/free',
    aiApiKey: '',
    profileName: settings?.profileName || '',
    gender: settings?.gender || 'male',
    height: settings?.height || '',
    units: settings?.units || 'kg',
    telegramBotToken: '', // Keep token hidden unless editing
    telegramChatId: '',
    telegramMiniAppUrl: settings?.telegramMiniAppUrl || '',
    reportSchedule: settings?.reportSchedule || 'Sunday 20:00',
    braveSearchApiKey: '',
    tavilyApiKey: '',
    googleClientId: '',
    googleClientSecret: '',
  }),['aiApiKey','telegramBotToken','telegramChatId','googleClientId','googleClientSecret','braveSearchApiKey','tavilyApiKey']);
  const {value:form,setValue:setForm}=settingsDraft;
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [benchStatus, setBenchStatus] = useState('');
  const [aiModels, setAiModels] = useState<{openRouter: any[], nvidia: any[]}>({ openRouter: [], nvidia: [] });
  const [recommended, setRecommended] = useState('openrouter/free');
  const [restoreJson, setRestoreJson] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [hardResetModal, setHardResetModal] = useState(false);
  const [otpModal, setOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [gdriveBackups, setGdriveBackups] = useState<Array<{ id: string; name: string; date: string; size: number }>>([]);
  const [gdriveBusy, setGdriveBusy] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState('');
  const [section, setSection] = useState<'profile' | 'security' | 'integrations' | 'data' | 'updates' | 'help' | 'automation'>('profile');
  const [feedbackCategory, setFeedbackCategory] = useState('Idea');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackReplyTo, setFeedbackReplyTo] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [flexibleModeDialog, setFlexibleModeDialog] = useState(false);
  const [helpService, setHelpService] = useState<'google' | 'email' | 'ai' | null>(null);
  const [replaceGoogleCredential, setReplaceGoogleCredential] = useState(false);
  const [vaultPassphrase,setVaultPassphrase]=useState('');
  const [vaultBusy,setVaultBusy]=useState(false);

  async function importGoogleCredential(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const credential = raw.installed || raw.web;
      if (!credential?.client_id || !credential?.client_secret) throw new Error('Choose the OAuth client JSON downloaded from Google Cloud Console.');
      setForm((current) => ({ ...current, googleClientId: credential.client_id, googleClientSecret: credential.client_secret }));
      toast.push('Google credential loaded. Save it once, then connect each service separately.', 'ok');
    } catch (error) { toast.push(error instanceof Error ? error.message : 'Could not read the credential JSON.', 'err'); }
  }

  useEffect(() => {
    void app.api.getAiModels()
      .then((r) => {
        setAiModels({
          openRouter: r.models || [],
          nvidia: r.nvidiaModels || [],
        });
        if (r.recommended) setRecommended(r.recommended);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const refreshOnFocus = () => { void refresh(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [refresh]);

  if (!settings) return null;

  async function save() {
    const next = await app.api.saveSettings(form);await settingsDraft.clear();
    await refresh();
    setForm((f) => ({
      ...f,
      aiApiKey: '',
      userEmail: next.userEmail || '',
      recipients: (next.recipients || []).join(', '),
      profileName: next.profileName,
      gender: next.gender || 'male',
      height: next.height || '',
      units: next.units,
      streakStartDate: next.streakStartDate,
      telegramBotToken: '', // Clear after save
      telegramChatId: '',
      telegramMiniAppUrl: next.telegramMiniAppUrl || '',
      braveSearchApiKey: '',
      tavilyApiKey: '',
      googleClientId: '',
      googleClientSecret: '',
    }));
    toast.push('Settings saved', 'ok');
  }

  async function triggerGdriveBackup() {
    setGdriveBusy(true);
    setGdriveStatus('Uploading backup to Google Drive...');
    try {
      const res = await app.api.triggerGdriveBackup();
      if (res.ok) {
        toast.push('Backup uploaded to Google Drive!', 'ok');
        setGdriveStatus(`Last backup: ${new Date().toLocaleString()} (${Math.round((res.size || 0) / 1024)} KB)`);
        await refresh();
      } else {
        toast.push('Backup failed', 'err');
        setGdriveStatus('Failed to upload backup');
      }
    } catch (e) {
      toast.push((e as Error).message, 'err');
      setGdriveStatus('Backup error');
    } finally {
      setGdriveBusy(false);
    }
  }

  async function loadGdriveBackups() {
    try {
      const res = await app.api.listGdriveBackups();
      setGdriveBackups(res.backups || []);
    } catch (e) {
      toast.push('Failed to load Google Drive backups', 'err');
    }
  }

  async function restoreGdriveBackup(fileId: string) {
    if (!confirm('This will replace your current data with the backup from Google Drive. Are you sure?')) return;
    setGdriveBusy(true);
    setGdriveStatus('Restoring backup from Google Drive...');
    try {
      const result = await app.api.restoreGdriveBackup(fileId);
      toast.push('Backup restored from Google Drive!', 'ok');
      setGdriveStatus(`Restore complete. Local safety backup created at ${new Date(result.safetyBackup.createdAt).toLocaleString()}.`);
      await refresh();
    } catch (e) {
      toast.push((e as Error).message, 'err');
      setGdriveStatus('Restore error');
    } finally {
      setGdriveBusy(false);
    }
  }

  async function handleGdriveAuth() {
    try {
      if (form.googleClientId || form.googleClientSecret) {
        await app.api.saveSettings({ googleClientId: form.googleClientId, googleClientSecret: form.googleClientSecret });
      }
      const { url } = await app.api.getGdriveAuthUrl();
      if (url) {
        window.open(url, '_blank', 'width=500,height=600');
        toast.push('Complete authentication in the popup window, then reload this page.', 'info');
      }
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  async function disconnectGdrive() {
    if (!confirm('Disconnect Google Drive and stop automatic backups?')) return;
    try {
      await app.api.disconnectGdrive();
      toast.push('Google Drive disconnected', 'info');
      await refresh();
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  async function sendFeedback() {
    if (feedbackMessage.trim().length < 10) {
      toast.push('Please write a little more detail before sending feedback.', 'info');
      return;
    }
    setFeedbackBusy(true);
    try {
      await app.api.sendFeedback({ category: feedbackCategory, message: feedbackMessage, replyTo: feedbackReplyTo });
      setFeedbackMessage('');
      toast.push('Feedback sent directly to the developer.', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div className="fade page-shell settings-shell">
      <header className="page-hero settings-hero">
        <div>
          <span className="page-eyebrow">Core workspace</span>
          <h1 className="page-title">{profileOnly?'Profile':'Settings'}</h1>
          <p className="page-sub">Your profile, connections, protection, and intelligence tools in one calm place.</p>
        </div>
      </header>

      <nav hidden={profileOnly} className="settings-nav settings-section-grid" aria-label="Settings sections">
        {(
          [
            ['automation', '↻', 'Automation', 'Evidence, confirmations and repair'], ['profile', '◎', 'Profile', 'Personal preferences'], ['security', '◈', 'Security', 'PIN and device sync'], ['integrations', '⌁', 'Integrations', 'Connected services'], ['data', '▣', 'Backup & Data', 'Recovery and local data'], ['updates', '↻', 'Updates', 'Version and release safety'], ['help', '?', 'Help', 'Guide and developer feedback'],
          ] as const
        ).map(([id, icon, label, description]) => (
          <button
            key={id}
            type="button"
            className={`settings-section-card ${section === id ? 'active' : ''}`}
            onClick={() => setSection(id)}
          >
            <span className="settings-section-icon">{icon}</span>
            <span><b>{label}</b><small>{description}</small></span>
          </button>
        ))}
      </nav>

      {section === 'automation' && <AutomationSettings/>}
      {section === 'help' ? <div className="settings-help-grid">
        <section className="page-panel settings-action-card stack"><span className="settings-card-icon">◌</span><h3 style={{ margin: 0 }}>Need a refresher?</h3><p className="subtle">Replay the guided tour for Dashboard, Tracker, Planner, analysis, settings, and backup safety.</p><button className="btn btn-hot" type="button" onClick={async () => { await app.api.saveSettings({ hasSeenFeatureGuide: false }); await refresh(); }}>Replay user guide</button></section>
        <section className="page-panel settings-feedback-card stack">
          <div><span className="settings-card-icon">✉</span><span className="dash-eyebrow">Direct developer feedback</span><h3 style={{ margin: '7px 0 0' }}>Tell us what should improve</h3></div>
          <p className="subtle">Your message is sent directly to the Health OS developer through your configured email delivery service.</p>
          <div className="settings-feedback-fields">
            <label className="form-field"><span>Feedback Category</span><select className="input" value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value)}><option>Idea</option><option>Problem</option><option>Design feedback</option><option>Feature request</option></select></label>
            <label className="form-field"><span>Feedback Reply To</span><input className="input" type="email" value={feedbackReplyTo} onChange={(e) => setFeedbackReplyTo(e.target.value)} placeholder={settings.userEmail || settings.recipients?.[0] || 'Reply email (optional)'} /></label>
            <label className="form-field"><span>Feedback Message</span><textarea className="input" rows={5} value={feedbackMessage} onChange={(e) => setFeedbackMessage(e.target.value)} placeholder="Describe what happened, what you expected, or the feature you need." /></label>
          </div>
          <button className="btn btn-hot" type="button" disabled={feedbackBusy} onClick={() => void sendFeedback()}>{feedbackBusy ? 'Sending…' : 'Send feedback to developer'}</button>
        </section>
      </div> : null}

      <div className="grid-2">
        <div className="page-panel stack" style={{ display: section === 'updates' ? undefined : 'none' }}>
          <h3 style={{ margin: 0 }}>App updates</h3>
          <p className="subtle">
            Installed version: <b className="mono">{settings.appVersion || '—'}</b>
          </p>
          <p className="subtle" style={{ margin: 0 }}>
            {UPDATES_DISCONNECTED_MESSAGE}
          </p>
          <p className="subtle" style={{ fontSize: 13 }}>
            You can continue using your current local version and records.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-soft" disabled>
              GitHub updates disconnected
            </button>
          </div>
        </div>

        <div className="page-panel stack" style={{ display: section === 'profile' ? undefined : 'none' }}>
          <h3 style={{ margin: 0 }}>Profile</h3>
          <p className="subtle">Single-user local profile (shown on sessions and reports).</p>
          <label className="form-field"><span>Display name</span><input
            className="input"
            value={form.profileName}
            onChange={(e) => setForm({ ...form, profileName: e.target.value })}
            placeholder="Display name"
          /></label>
          <label className="form-field"><span>Your account email (separate from report email)</span><input className="input" type="email" value={form.userEmail} onChange={(e) => setForm({ ...form, userEmail: e.target.value })} placeholder="Your account email (separate from report email)" /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="form-field"><span>Height</span><input
              className="input"
              type="number"
              value={form.height}
              onChange={(e) => setForm({ ...form, height: e.target.value })}
              placeholder={`Height (${form.units === 'kg' ? 'cm' : 'in'})`}
            /></label>
            <label className="form-field"><span>Units</span><select className="input" style={{ maxWidth: 150 }} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value as 'kg' | 'lb' })}>
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select></label>
            <label className="form-field"><span>Gender</span><select className="input" style={{ maxWidth: 150 }} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'male' | 'female' })}>
              <option value="male">Male Anatomy</option>
              <option value="female">Female Anatomy</option>
            </select></label>
          </div>

          <button type="button" className="btn btn-hot" onClick={() => void save()}>Save profile</button>
        </div>

        <div className="page-panel stack" style={{ display: !profileOnly && section === 'profile' ? undefined : 'none' }}>
          <h3 style={{ margin: 0 }}>Training and appearance</h3>
          <section className="settings-action-card stack"><div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><div><strong>Preplanned Week</strong><p className="subtle" style={{ margin: '4px 0 0' }}>Turn off to plan today&apos;s workout directly in Tracker.</p></div><label className="switch"><input type="checkbox" checked={app.db?.trainingConfig?.preplannedWeekMode !== false} onChange={async (event) => { if (event.target.checked) { await app.api.saveTrainingConfig({ preplannedWeekMode: true }); await refresh(); toast.push('Preplanned Week mode is on.', 'ok'); } else setFlexibleModeDialog(true); }}/><span className="slider" /></label></div></section>
          <label>Appearance <select className="input" value={app.appearance} onChange={(event) => app.setAppearance(event.target.value as 'system' | 'light' | 'dark')}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label className="subtle">Streak start<input className="input" type="date" value={form.streakStartDate} onChange={(e) => setForm({ ...form, streakStartDate: e.target.value })}/></label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}><label className="subtle"><input type="checkbox" defaultChecked={app.db?.trainingConfig?.reminders?.train} onChange={async (e) => { await app.api.saveTrainingConfig({ reminders: { ...app.db?.trainingConfig?.reminders, train: e.target.checked } as any }); await refresh(); }}/> Train reminder</label><label className="subtle"><input type="checkbox" defaultChecked={app.db?.trainingConfig?.reminders?.readiness} onChange={async (e) => { await app.api.saveTrainingConfig({ reminders: { ...app.db?.trainingConfig?.reminders, readiness: e.target.checked } as any }); await refresh(); }}/> Readiness reminder</label></div>
          <h3 style={{ margin: '10px 0 0' }}>Personal Supabase</h3><p className="subtle">Sync this workspace through the Supabase project you own.</p><CloudSyncPanel />
        </div>

        {section === 'integrations' && <ExerciseIntegrationSettings />}
        <div className="page-panel stack" style={{ display: section === 'integrations' ? undefined : 'none' }}>
          <div className="row"><h3 style={{ margin: 0 }}>Supabase email delivery <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpService('email')}>?</button></h3><span className="chip ready-ok">Account-managed</span></div><p className="subtle">Reports are sent from developer.healthos@gmail.com to your signed-in Supabase account email. Recipients cannot be changed in the app.</p>
        </div>

        <div className="page-panel stack" style={{ display: section === 'integrations' ? undefined : 'none' }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>Telegram Bot & Weekly Reports</h3>
            {settings.hasTelegramBot ? <span className="chip ready-ok">Active</span> : null}
          </div>
          <p className="subtle">Send reports and open the live gym logger directly inside Telegram.</p>
          <label className="form-field"><span>Telegram Bot Token</span><input className="input" type="password" placeholder={settings.hasTelegramBot ? "Bot Token (Saved, enter to change)" : "Bot Token (e.g. 123456:ABC-DEF)"} value={form.telegramBotToken} onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })} /></label>
          <label className="form-field"><span>Telegram Chat Id</span><input className="input" type="text" placeholder={settings.hasTelegramBot ? "Chat ID (Saved, comma-separated for multiple)" : "Your Chat ID (comma-separated for multiple)"} value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} /></label>
          <label className="form-field"><span>https://your-host.example/telegram.html</span><input className="input" type="url" placeholder="https://your-host.example/telegram.html" value={form.telegramMiniAppUrl} onChange={(e) => setForm({ ...form, telegramMiniAppUrl: e.target.value })} /></label>
          <p className="subtle" style={{ fontSize: 12 }}>Mini Apps must use a public HTTPS address. Enter the address where this build&apos;s <span className="mono">telegram.html</span> is hosted.</p>
          <p className="subtle" style={{ fontSize: 12 }}>Don't know your Chat ID? Message your bot, then test the connection below to auto-fetch it.</p>
          <div className="row">
            <label className="subtle" style={{ width: 120 }}>Schedule:</label>
            <label className="form-field"><span>e.g. Sunday 20:00</span><input className="input flex-1" type="text" placeholder="e.g. Sunday 20:00" value={form.reportSchedule} onChange={(e) => setForm({ ...form, reportSchedule: e.target.value })} /></label>
          </div>
          <div className="row mt-2">
            <button className="btn btn-dark" type="button" onClick={save}>Save Telegram Setup</button>
            <button className="btn btn-soft" type="button" onClick={async () => {
              try {
                toast.push('Testing Telegram...', 'info');
                const res = await fetch('/api/telegram/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
                  body: JSON.stringify({ token: form.telegramBotToken }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to test Telegram');
                if (data.chatId) {
                  setForm(f => ({ ...f, telegramChatId: String(data.chatId) }));
                  toast.push(`Found Chat ID: ${data.chatId}. Save it to apply.`, 'ok');
                } else {
                  toast.push('Message sent! Check your Telegram.', 'ok');
                }
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}>Test Connection & Fetch ID</button>
            <button className="btn btn-soft" type="button" onClick={async () => {
              try {
                toast.push('Generating and sending HTML...', 'info');
                const weekId = app.db?.meta.activeWeekId;
                if (!weekId) throw new Error('No active week is available yet.');
                const res = await fetch('/api/telegram/send-report', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
                  body: JSON.stringify({ weekId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to send HTML');
                toast.push('HTML Report sent! Check your Telegram.', 'ok');
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}>Send Test HTML Report</button>
          </div>
        </div>

        <div className="page-panel stack" style={{ display: section === 'integrations' ? undefined : 'none' }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>Google Fit Sync</h3>
            {settings.hasGoogleFit ? <span className="chip ready-ok">Connected</span> : null}
          </div>
          <p className="subtle">Use the same Google OAuth JSON once for Drive and Google Fit. Each service still needs its own Google approval.</p>
          {settings.hasGoogleOAuthConfig && !replaceGoogleCredential ? <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><span className="chip ready-ok">OAuth credential saved</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplaceGoogleCredential(true)}>Replace credential JSON</button></div> : <><input className="input" type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importGoogleCredential(file); }} /><label className="form-field"><span>Shared Google OAuth Client ID</span><input className="input" type="text" placeholder="Shared Google OAuth Client ID" value={form.googleClientId} onChange={(e) => setForm({ ...form, googleClientId: e.target.value })} /></label><label className="form-field"><span>Shared Google OAuth Client Secret</span><input className="input" type="password" placeholder="Shared Google OAuth Client Secret" value={form.googleClientSecret} onChange={(e) => setForm({ ...form, googleClientSecret: e.target.value })} /></label></>}
          <div className="row mt-2">
            <button className="btn btn-dark" type="button" onClick={async () => {
              if (form.googleClientId || form.googleClientSecret) {
                await save();
              }
              try {
                const res = await fetch('/api/google-fit/auth', { headers: { Authorization: `Bearer ${getAuthToken()}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                window.open(data.url, '_blank', 'width=600,height=700');
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}>{settings.hasGoogleFit ? 'Reconnect Google Fit' : 'Authorize & Connect'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpService('google')}>?</button>
            <button className="btn btn-soft" type="button" disabled={!settings.hasGoogleFit} onClick={async () => {
              try {
                toast.push('Syncing Google Fit...', 'info');
                const res = await fetch('/api/google-fit/sync', { method: 'POST', headers: { Authorization: `Bearer ${getAuthToken()}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toast.push(data.message, 'ok');
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}>Sync Now</button>
          </div>
        </div>

        <div className="page-panel stack" style={{ display: section === 'integrations' ? undefined : 'none' }}>
          <div className="row"><h3 style={{ margin: 0 }}>Google Drive <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpService('google')}>?</button></h3><span className={`chip ${settings.hasGdrive ? 'ready-ok' : ''}`}>{settings.hasGdrive ? 'Connected' : 'Not connected'}</span></div>
          <p className="subtle">Private Drive storage is used for backups and recovery only. It uses the shared Google credential above.</p>
          <button className="btn btn-soft" type="button" onClick={() => settings.hasGdrive ? setSection('data') : handleGdriveAuth()}>{settings.hasGdrive ? 'Open backup details' : 'Connect Google Drive'}</button>
        </div>

        <div className="page-panel stack" style={{ display: section === 'security' ? undefined : 'none' }}>
          <h3 style={{ margin: 0 }}>Local PIN lock</h3>
          <p className="subtle">Optional. Protects API access if someone opens this browser on your PC.</p>
          <label className="form-field"><span>New PIN (4–8 digits)</span><input className="input" type="password" inputMode="numeric" placeholder="New PIN (4–8 digits)" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
          {settings.hasPin ? (
            <label className="form-field"><span>Current PIN</span><input className="input" type="password" inputMode="numeric" placeholder="Current PIN" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} /></label>
          ) : null}
          <div className="row">
            <button
              type="button"
              className="btn btn-dark"
              onClick={async () => {
                try {
                  const res = await app.api.authSetupPin(pin, currentPin);
                  setAuthToken(res.token);
                  setPin('');
                  setCurrentPin('');
                  await refresh();
                  toast.push('PIN saved', 'ok');
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              {settings.hasPin ? 'Update PIN' : 'Set PIN'}
            </button>
            {settings.hasPin ? (
              <button
                type="button"
                className="btn btn-soft"
                onClick={async () => {
                  try {
                    await app.api.authClearPin(currentPin || pin);
                    setAuthToken('');
                    await refresh();
                    toast.push('PIN cleared', 'ok');
                  } catch (e) {
                    toast.push((e as Error).message, 'err');
                  }
                }}
              >
                Clear PIN
              </button>
            ) : null}
          </div>

          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Device sync</h3>
          <p className="subtle">Check the personal Supabase project and sync state for this device.</p>
          <CloudSyncPanel />
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Encrypted credential vault</h3>
          <p className="subtle">Use a separate sync passphrase to encrypt API keys and service passwords before they enter Supabase. Account sessions and Google authorization tokens stay on this device.</p>
          <label className="form-field"><span>Vault passphrase · at least 10 characters</span><input className="input" type="password" autoComplete="new-password" value={vaultPassphrase} onChange={event=>setVaultPassphrase(event.target.value)} placeholder="Vault passphrase · at least 10 characters" /></label>
          <div className="row" style={{flexWrap:'wrap'}}>
            <button className="btn btn-hot" disabled={vaultBusy||vaultPassphrase.length<10} onClick={async()=>{setVaultBusy(true);try{const result=await post<{recoveryEnvelope:unknown}>('/api/settings/vault/export',{passphrase:vaultPassphrase});const blob=new Blob([JSON.stringify(result.recoveryEnvelope,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='body-os-vault-recovery.json';link.click();URL.revokeObjectURL(url);toast.push('Encrypted credentials queued for sync. Recovery envelope downloaded.','ok');}catch(error){toast.push((error as Error).message,'err');}finally{setVaultBusy(false);}}}>Encrypt and sync current credentials</button>
            <button className="btn btn-soft" disabled={vaultBusy||vaultPassphrase.length<10} onClick={async()=>{setVaultBusy(true);try{await post('/api/settings/vault/unlock',{passphrase:vaultPassphrase});await refresh();toast.push('Synced credentials unlocked on this device.','ok');}catch(error){toast.push((error as Error).message,'err');}finally{setVaultBusy(false);}}}>Unlock synced credentials</button>
          </div>
        </div>

        <div className="page-panel stack" style={{ display: section === 'integrations' ? undefined : 'none' }}>
          <h3>AI engine <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpService('ai')}>?</button></h3>
          <p className="subtle">
            Backend coach runs on your PC and calls AI APIs. Keys are encrypted at rest and never shown back to the browser.
            Get a free key at openrouter.ai or build.nvidia.com.
          </p>
          <label className="form-field"><span>Ai Provider</span><select
            className="input"
            value={form.aiProvider}
            onChange={(e) => {
              const aiProvider = e.target.value;
              setForm((current) => ({
                ...current,
                aiProvider,
                // Replace legacy model defaults when returning to OpenRouter.
                aiModel: aiProvider === 'openrouter' && (!current.aiModel || current.aiModel === 'google/gemma-4-31b-it:free') ? 'openrouter/free' : current.aiModel,
              }));
            }}
          >
            <option value="">Local coach only (no network)</option>
            <option value="ollama">Ollama (Local Server)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="nvidia">NVIDIA</option>
          </select></label>
          <label className="form-field"><span>Ai Model</span><input className="input" list="body-os-ai-models" value={form.aiModel} onChange={(e) => setForm({ ...form, aiModel: e.target.value.trim() })} placeholder={form.aiProvider === 'nvidia' ? 'Example: meta/llama-3.1-8b-instruct' : 'Example: openrouter/free'} /></label>
          <datalist id="body-os-ai-models">{(form.aiProvider === 'nvidia' ? aiModels.nvidia : aiModels.openRouter).slice(0, 5).map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</datalist>
          <p className="subtle">Choose DeepSeek V4.1 Flash or enter any model ID your provider supports. OpenRouter format: <code>publisher/model</code> or <code>publisher/model:free</code>. NVIDIA format: <code>publisher/model-name</code>. DeepSeek V4.1 Flash uses your saved OpenRouter key and available OpenRouter credit.</p>
          {form.aiProvider !== 'ollama' && (
            <label className="form-field"><span>Ai Api Key</span><input
              className="input"
              type="password"
              value={form.aiApiKey}
              onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
              placeholder={settings.hasAiApiKey ? 'Saved — enter to change' : `${form.aiProvider === 'nvidia' ? 'NVIDIA' : 'OpenRouter'} API key`}
            /></label>
          )}
          <label className="form-field"><span>Brave Search Api Key</span><input
            className="input"
            type="password"
            value={form.braveSearchApiKey}
            onChange={(e) => setForm({ ...form, braveSearchApiKey: e.target.value })}
            placeholder={settings.hasBraveSearchApiKey ? 'Saved — enter to change' : 'Brave Search API Key (optional)'}
          /></label>
          <label className="form-field"><span>Tavily Api Key</span><input
            className="input"
            type="password"
            value={form.tavilyApiKey}
            onChange={(e) => setForm({ ...form, tavilyApiKey: e.target.value })}
            placeholder={settings.hasTavilyApiKey ? 'Tavily saved - enter to change' : 'Tavily API Key (optional)'}
          /></label>
          <p className="subtle" style={{ margin: 0 }}>Tavily is used only when you select a web search. Searches this month: {settings.tavilySearchCount || 0}.</p>
          <div className="row">
            <button
              type="button"
              className="btn btn-hot btn-sm"
              disabled={aiBusy}
              onClick={async () => {
                setAiBusy(true);
                setAiStatus('Saving & testing AI…');
                try {
                  await app.api.saveSettings(form);await settingsDraft.clear();
                  await refresh();
                  const res = await app.api.testAi();
                  if (res.ok) {
                    setAiStatus(`✓ ${res.message || 'Online'} · ${res.model} · ${res.latencyMs}ms\n${res.sample || ''}`);
                    toast.push('AI engine online', 'ok');
                  } else {
                    setAiStatus(`✗ ${res.error || 'Test failed'}`);
                    toast.push(res.error || 'AI test failed', 'err');
                  }
                } catch (e) {
                  setAiStatus((e as Error).message);
                  toast.push((e as Error).message, 'err');
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              Test AI
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={aiBusy || form.aiProvider === 'ollama'}
              onClick={async () => {
                setAiBusy(true);
                setBenchStatus('Benchmarking free models (may take ~30s)…');
                try {
                  await app.api.saveSettings(form);await settingsDraft.clear();
                  const res = await app.api.benchmarkAi(5);
                  if (res.bestLive) {
                    setForm((f) => ({ ...f, aiModel: res.bestLive!.model, aiProvider: 'openrouter' }));
                    setBenchStatus(
                      `Best live free model: ${res.bestLive.label}\n${res.bestLive.model} · ${res.bestLive.latencyMs}ms\n${res.bestLive.sample || ''}\n\n` +
                        res.results
                          .map((r: { ok: boolean; model: string; latencyMs?: number; error?: string }) => `${r.ok ? '✓' : '✗'} ${r.model} ${r.ok ? r.latencyMs + 'ms' : r.error || ''}`)
                          .join('\n'),
                    );
                    toast.push(`Best free model: ${res.bestLive.model}`, 'ok');
                  } else {
                    setBenchStatus(
                      `No free model responded. Default remains ${res.recommendedDefault}.\n` +
                        res.results.map((r: { model: string; error?: string }) => `✗ ${r.model}: ${r.error || 'fail'}`).join('\n'),
                    );
                    toast.push('No free model responded — check key / rate limits', 'err');
                  }
                } catch (e) {
                  setBenchStatus((e as Error).message);
                  toast.push((e as Error).message, 'err');
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              Benchmark free models
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => void save()}>
              Save AI settings
            </button>
          </div>
          {aiStatus ? <pre className="subtle mono" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>{aiStatus}</pre> : null}
          {benchStatus ? <pre className="subtle mono" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>{benchStatus}</pre> : null}
        </div>

        <div style={{ display: 'none' }}>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Theme</h3>
          <button type="button" className="btn btn-soft" onClick={toggleTheme}>
            Toggle {theme === 'dark' ? 'Bright' : 'Dark'}
          </button>

          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Streak Start</h3>
          <p className="subtle">Use when consistency started before saved sessions exist.</p>
          <label className="form-field"><span>Streak Start Date</span><input
            className="input"
            type="date"
            value={form.streakStartDate}
            onChange={(e) => setForm({ ...form, streakStartDate: e.target.value })}
          /></label>

          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Training config</h3>
          <section className="settings-action-card stack" style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><div><strong>Preplanned Week</strong><p className="subtle" style={{ margin: '4px 0 0' }}>Use imported plans and their prescribed exercises for each day.</p></div><label className="switch"><input type="checkbox" checked={app.db?.trainingConfig?.preplannedWeekMode !== false} onChange={async (event) => { if (event.target.checked) { await app.api.saveTrainingConfig({ preplannedWeekMode: true }); await refresh(); toast.push('Preplanned Week mode is on.', 'ok'); } else setFlexibleModeDialog(true); }}/><span className="slider" /></label></div>
          </section>
          <LoadIncrementEditor />
          <p className="subtle">Personal volume landmarks (MEV/MAV/MRV) and local reminders.</p>
          <button
            type="button"
            className="btn btn-soft"
            onClick={async () => {
              try {
                const cfg = app.db?.trainingConfig;
                if (!cfg) {
                  toast.push('Load app data first', 'err');
                  return;
                }
                const muscle = window.prompt('Muscle name (e.g. Chest)', 'Chest');
                if (!muscle) return;
                const mev = Number(window.prompt('MEV sets/week', '6') || 6);
                const mav = Number(window.prompt('MAV sets/week', '12') || 12);
                const mrv = Number(window.prompt('MRV sets/week', '20') || 20);
                const volumeLandmarks = [...(cfg.volumeLandmarks || [])];
                const idx = volumeLandmarks.findIndex((v) => v.muscle.toLowerCase() === muscle.toLowerCase());
                const row = { muscle, mev, mav, mrv };
                if (idx >= 0) volumeLandmarks[idx] = row;
                else volumeLandmarks.push(row);
                await app.api.saveTrainingConfig({ volumeLandmarks });
                await refresh();
                toast.push(`Landmark saved for ${muscle}`, 'ok');
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}
          >
            Edit volume landmark
          </button>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="subtle" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                defaultChecked={app.db?.trainingConfig?.reminders?.train}
                onChange={async (e) => {
                  await app.api.saveTrainingConfig({
                    reminders: { ...app.db?.trainingConfig?.reminders, train: e.target.checked } as any,
                  });
                  await refresh();
                }}
              />
              Train reminder
            </label>
            <label className="subtle" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                defaultChecked={app.db?.trainingConfig?.reminders?.readiness}
                onChange={async (e) => {
                  await app.api.saveTrainingConfig({
                    reminders: { ...app.db?.trainingConfig?.reminders, readiness: e.target.checked } as any,
                  });
                  await refresh();
                }}
              />
              Readiness reminder
            </label>
            <label className="subtle" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                defaultChecked={app.db?.trainingConfig?.gymModeDefault}
                onChange={async (e) => {
                  localStorage.setItem('workout-os-gym-mode', e.target.checked ? '1' : '0');
                  await app.api.saveTrainingConfig({ gymModeDefault: e.target.checked });
                  await refresh();
                }}
              />
              Default gym mode
            </label>
          </div>
          <p className="subtle" style={{ fontSize: 12 }}>
            Reminders store preferences locally (browser can show OS notifications when the app is open).
          </p>
        </div>

        <div className="page-panel stack" style={{ display: section === 'data' ? undefined : 'none' }}>
          <h3>Backup Health Center</h3>
          <p className="subtle">Check cloud protection, create a backup now, inspect restore points, and recover safely. Drive copies stay in Health OS’s private app-data area and retain the five newest backups.</p>

          {!settings.hasGdrive ? (
            <div className="box mb-3 p-3">
              <p>Google Drive is disconnected. Export a local backup below, or connect Drive for automatic cloud copies.</p>
              {!settings.hasGoogleOAuthConfig && <p className="subtle" style={{ fontSize: 12 }}>Drive backup is not available on this Health OS host yet. It needs the platform’s Drive connection configured by its owner; no client secret is entered into this page.</p>}
              <button className="btn btn-primary mt-2" onClick={handleGdriveAuth}>
                Connect Google Drive
              </button>
            </div>
          ) : (
            <div className="box mb-3 p-3">
              <p className="text-ok">✅ Google Drive is connected.</p>

              <div className="form-group mt-3">
                <label>Automatic Backup Schedule</label>
                <label className="form-field"><span>Settings</span><select
                  className="input"
                  value={settings.gdriveSchedule || 'weekly'}
                  onChange={async (e) => {
                    await app.api.saveSettings({ gdriveSchedule: e.target.value as any });
                    await refresh();
                    toast.push('Schedule updated', 'ok');
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select></label>
              </div>

              <div className="mt-2 mb-3 subtle">
                {settings.gdriveLastBackup ? (
                  <>Last backup: {new Date(settings.gdriveLastBackup).toLocaleString()} ({Math.round((settings.gdriveLastBackupSize || 0) / 1024)} KB)</>
                ) : (
                  <>No backup has been uploaded yet.</>
                )}
              </div>

              {gdriveStatus && <p className="mb-2 subtle">{gdriveStatus}</p>}

              <div className="row mt-3">
                <button className="btn btn-dark" onClick={triggerGdriveBackup} disabled={gdriveBusy}>
                  {gdriveBusy ? 'Uploading...' : 'Backup Now'}
                </button>
                <button className="btn btn-soft" onClick={loadGdriveBackups} disabled={gdriveBusy}>
                  List Available Backups
                </button>
                <button className="btn btn-danger-soft" onClick={disconnectGdrive}>
                  Disconnect
                </button>
              </div>

              {gdriveBackups.length > 0 && (
                <div className="mt-3">
                  <h4>Available Backups on Drive</h4>
                  <ul style={{ paddingLeft: '1rem', marginTop: '0.5rem' }}>
                    {gdriveBackups.map(b => (
                      <li key={b.id} className="mb-2">
                        <div className="row justify-between">
                          <span>{new Date(b.date).toLocaleString()} ({Math.round(b.size / 1024)} KB)</span>
                          <button className="btn btn-sm btn-soft" onClick={() => restoreGdriveBackup(b.id)} disabled={gdriveBusy}>
                            Restore
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Local backup & recovery</h3>
          <p className="subtle">Export all local data or restore a previous JSON backup. Always export before a major upgrade. Google Drive restores automatically create a local safety copy first.</p>
          <button
            type="button"
            className="btn btn-dark"
            onClick={async () => {
              const data = await app.api.getBackup();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'workout-os-backup.json';
              a.click();
              toast.push('Backup downloaded', 'ok');
            }}
          >
            Export Backup
          </button>
          <label className="form-field"><span>Restore Json</span><textarea
            className="input min-h-160 mono"
            value={restoreJson}
            onChange={(e) => setRestoreJson(e.target.value)}
            placeholder="Paste backup JSON"
          /></label>
          <button
            type="button"
            className="btn btn-soft"
            onClick={async () => {
              try {
                await app.api.restoreBackup(JSON.parse(restoreJson));
                await refresh();
                toast.push('Backup restored', 'ok');
              } catch (e) {
                toast.push((e as Error).message, 'err');
              }
            }}
          >
            Restore Backup
          </button>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <h3>Data Management</h3>
          <p className="subtle">Manage your raw data and factory reset the app if needed.</p>
          <div className="row">
            <button type="button" className="btn btn-soft" onClick={() => setResetModal(true)}>
              Reset Data
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setHardResetModal(true)}>
              Hard Reset
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={resetModal}
        title="Reset Data"
        onClose={() => setResetModal(false)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setResetModal(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  const res = await fetch('/api/settings/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` }
                  });
                  if (!res.ok) throw new Error('Reset failed');
                  toast.push('Data reset successfully. Settings preserved.', 'ok');
                  setResetModal(false);
                  window.location.reload();
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              Reset Data
            </button>
          </>
        }
      >
        <p>This will delete all your workout history, habits, and logs. It will <strong>preserve</strong> your settings (API keys, email) and your Week 1 layout.</p>
      </Modal>

      <Modal
        open={hardResetModal}
        title=""
        onClose={() => setHardResetModal(false)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setHardResetModal(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  toast.push('Sending OTP...', 'info');
                  const res = await fetch('/api/settings/hard-reset/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` }
                  });
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to request hard reset');
                  }
                  toast.push('OTP sent to your email!', 'ok');
                  setHardResetModal(false);
                  setOtpModal(true);
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              Request Hard Reset
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--red)' }}>Hard Reset</h3>
          <button type="button" className="btn btn-soft" onClick={() => setHardResetModal(false)} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <p>This will completely destroy <strong>ALL</strong> data, including your settings, PIN, API keys, and email config.</p>
        <p>To proceed, an OTP will be sent to your account email or first report recipient.</p>
      </Modal>

      <Modal
        open={otpModal}
        title="Enter OTP"
        onClose={() => setOtpModal(false)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setOtpModal(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  const res = await fetch('/api/settings/hard-reset/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
                    body: JSON.stringify({ otp: otpCode })
                  });
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Invalid OTP');
                  }
                  toast.push('Hard Reset Complete!', 'ok');
                  sessionStorage.clear();
                  window.location.reload();
                } catch (e) {
                  toast.push((e as Error).message, 'err');
                }
              }}
            >
              Confirm Wipe
            </button>
          </>
        }
      >
        <p>Please check your email and enter the 6-digit OTP below to authorize the hard reset.</p>
        <label className="form-field"><span>Enter 6-digit OTP</span><input
          className="input"
          type="text"
          placeholder="Enter 6-digit OTP"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
        /></label>
      </Modal>

      <Modal open={flexibleModeDialog} title="Start flexible training" onClose={() => setFlexibleModeDialog(false)}>
        <div className="stack"><p className="subtle">Choose where this Monday–Sunday flexible week begins. Your imported plan stays unchanged.</p>{([['today','Start today'],['monday','Start this Monday'],['next-monday','Start next Monday']] as const).map(([strategy, label]) => <button key={strategy} className="btn btn-hot" onClick={async () => { try { await app.api.saveTrainingConfig({ preplannedWeekMode: false }); await app.api.startFlexibleWeek(strategy); await refresh(); setFlexibleModeDialog(false); toast.push(`Flexible mode starts ${label.toLowerCase().replace('start ', '')}.`, 'ok'); } catch (error) { toast.push((error as Error).message, 'err'); } }}>{label}</button>)}</div>
      </Modal>
      <Modal open={Boolean(helpService)} title={helpService === 'google' ? 'Connect a Google service' : helpService === 'email' ? 'Email delivery' : 'Set up the AI engine'} onClose={() => setHelpService(null)}>
        {helpService === 'google' ? <div className="stack"><p>In Google Cloud Console, create an <strong>OAuth client</strong> and download its JSON file. Upload that one file in Google Fit. It is shared with Google Drive, but you must approve each service separately.</p><p className="subtle">Add these exact redirect URLs to the OAuth client: <code>http://127.0.0.1:10000/api/google-fit/callback</code> and <code>http://localhost:10000/api/gdrive/callback</code>. If your Health OS port is different, replace 10000 with the address shown in its terminal.</p></div> : helpService === 'email' ? <div className="stack"><p>Health OS sends reports from <strong>developer.healthos@gmail.com</strong> to the primary email on your signed-in Supabase account.</p><p className="subtle">The Supabase Edge Function resolves the recipient and holds the sender credential. The app never receives either a recipient override or an SMTP password.</p></div> : <div className="stack"><p>Choose OpenRouter, NVIDIA, or local Ollama. Paste the provider key and a model ID, then use Test AI. Only a successful AI response can send an AI workout report.</p><p className="subtle">For OpenRouter use <code>openrouter/free</code> or a current model ID from OpenRouter. For NVIDIA use a model listed in NVIDIA Build. Model availability changes, so a typed model plus Test AI is more reliable than a long hard-coded list.</p></div>}
      </Modal>

    </div>
  );
}
