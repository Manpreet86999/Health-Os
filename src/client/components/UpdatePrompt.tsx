import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useApp } from '../state/AppContext';
import { useToast } from './Toast';
import type { UpdateCheckResult, UpdateDownloadStatus, UpdateNotice } from '../lib/api-client';
import { GITHUB_UPDATES_ENABLED } from '../../shared/update-repo';

const SKIP_KEY = 'workout-os-skip-update';

function skippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

function setSkippedVersion(v: string) {
  try {
    localStorage.setItem(SKIP_KEY, v);
  } catch {
    /* ignore */
  }
}

/**
 * On startup (after unlock), check free GitHub Releases for a newer installer.
 * Asks permission before downloading / installing. data/ is never wiped.
 */
export function UpdatePrompt() {
  const app = useApp();
  const toast = useToast();
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'download' | 'install'>('idle');
  const [progress, setProgress] = useState('');
  const [download, setDownload] = useState<UpdateDownloadStatus | null>(null);
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  const runCheck = useCallback(
    async (force = false) => {
      try {
        const result = await app.api.checkUpdates(force);
        setInfo(result);
        if (!result.configured) return;
        if (!result.updateAvailable || !result.latestVersion) return;
        if (skippedVersion() === result.latestVersion) return;
        setOpen(true);
      } catch {
        /* offline — silent */
      }
    },
    [app.api],
  );

  useEffect(() => {
    if (!GITHUB_UPDATES_ENABLED) return;
    const t = window.setTimeout(() => void runCheck(true), 1200);
    return () => window.clearTimeout(t);
  }, [runCheck]);

  useEffect(() => {
    if (!GITHUB_UPDATES_ENABLED) return;
    void app.api.getUpdateNotice().then((result) => setNotice(result.notice)).catch(() => undefined);
  }, [app.api]);

  async function installNow() {
    setBusy('download');
    setProgress('Preparing verified update download…');
    try {
      await app.api.downloadUpdate();
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const status = await app.api.getUpdateDownloadStatus();
        setDownload(status);
        setProgress(status.message);
        if (status.phase === 'ready') break;
        if (status.phase === 'failed') throw new Error(status.error || 'Download failed');
      }
      setBusy('install');
      setProgress(
        'Creating the verified safety backup before installation…',
      );
      const inst = await app.api.installUpdate();
      if (!inst.ok) {
        toast.push(inst.error || 'Install blocked — your data was not touched.', 'err');
        setBusy('idle');
        setProgress('');
        return;
      }
      toast.push(inst.message, 'ok');
      setProgress(
        'Backup verified. The installer will verify its embedded requirements, install any missing packages, restart the local Health OS server, then show what changed.',
      );
    } catch (e) {
      toast.push((e as Error).message, 'err');
      setBusy('idle');
      setProgress('');
    }
  }

  async function closeNotice() {
    try {
      await app.api.acknowledgeUpdateNotice();
    } finally {
      setNotice(null);
    }
  }

  function later() {
    if (info?.latestVersion) setSkippedVersion(info.latestVersion);
    setOpen(false);
  }

  if (notice) {
    return (
      <Modal open title={`Health OS ${notice.version} is ready`} onClose={() => void closeNotice()} actions={<button type="button" className="btn btn-hot" onClick={() => void closeNotice()}>Start using the update</button>}>
        <div className="stack" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}><b>Your local server restarted successfully.</b> Here is what this version brings:</p>
          {notice.notes ? <pre className="subtle mono" style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', margin: 0, fontSize: 12, padding: 12, background: 'var(--panel-2, rgba(0,0,0,0.04))', borderRadius: 10 }}>{notice.notes}</pre> : <p className="subtle" style={{ margin: 0 }}>This release did not include written release notes.</p>}
          <p className="subtle" style={{ margin: 0, fontSize: 12 }}>Your existing records stayed in place. The update also checked its declared runtime and package requirements.</p>
        </div>
      </Modal>
    );
  }

  if (!open || !info?.updateAvailable) return null;

  return (
    <Modal
      open={open}
      title="Update available"
      onClose={() => {
        if (busy === 'idle') later();
      }}
      actions={
        busy === 'idle' ? (
          <>
            <button type="button" className="btn btn-soft" onClick={later}>
              Not now
            </button>
            <button type="button" className="btn btn-hot" onClick={() => void installNow()}>
              Install update
            </button>
          </>
        ) : (
          <span className="subtle">{progress || 'Working…'}</span>
        )
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <p style={{ margin: 0 }}>
          <b>Health OS {info.latestVersion}</b> is available
          {info.currentVersion ? (
            <span className="subtle"> (you have {info.currentVersion})</span>
          ) : null}
          .
        </p>
        {download ? (
          <div aria-live="polite" style={{ display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
              <span>{download.message}</span>
              <span>{download.percent === null ? 'Preparing…' : `${download.percent}%`}</span>
            </div>
            <div style={{ height: 8, overflow: 'hidden', borderRadius: 99, background: 'var(--bg-inset, rgba(0,0,0,.08))' }}>
              <div style={{ height: '100%', width: `${download.percent ?? 0}%`, borderRadius: 'inherit', background: 'var(--accent)' }} />
            </div>
          </div>
        ) : null}
        <div
          className="subtle"
          style={{
            margin: 0,
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'rgba(34, 197, 94, 0.08)',
            fontSize: 13,
          }}
        >
          <b>Data protection (required before install)</b>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>
              Dual backup: <code className="mono">backups\</code> + Windows{' '}
              <code className="mono">SafetyVault</code> (outside the app folder)
            </li>
            <li>Install is <b>blocked</b> if backup verification fails — nothing is changed</li>
            <li>Installer only replaces program files, not your workouts database</li>
            <li>After install, if DB is missing it is auto-restored from the vault</li>
            <li>The installer includes its own requirements file and verifies it automatically</li>
          </ul>
          {info.dataProtection?.safetyVault ? (
            <p style={{ margin: '8px 0 0', fontSize: 11 }} className="mono">
              Vault: {info.dataProtection.safetyVault}
            </p>
          ) : null}
        </div>
        {info.releaseNotes ? (
          <pre
            className="subtle mono"
            style={{
              whiteSpace: 'pre-wrap',
              maxHeight: 160,
              overflow: 'auto',
              margin: 0,
              fontSize: 12,
              padding: 10,
              background: 'var(--panel-2, rgba(0,0,0,0.04))',
              borderRadius: 8,
            }}
          >
            {info.releaseNotes}
          </pre>
        ) : null}
        {progress ? <p className="subtle">{progress}</p> : null}
      </div>
    </Modal>
  );
}

/** Expose a manual re-check for Settings */
export async function manualUpdateCheck(
  api: { checkUpdates: (force?: boolean) => Promise<UpdateCheckResult> },
): Promise<UpdateCheckResult> {
  return api.checkUpdates(true);
}
