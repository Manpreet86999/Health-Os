/**
 * Free GitHub Releases auto-update for Health OS.
 *
 * DATA SAFETY (hard rules):
 * 1. Refuse install if dual safety backup fails verification.
 * 2. Backup lives in {app}/backups AND %LOCALAPPDATA%\\WorkoutOS\\SafetyVault (outside install).
 * 3. Post-install script restores DB from vault if data file missing/tiny.
 * 4. Installer packaging never includes user data; ISS never deletes data/.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { ROOT, DATA_DIR } from '../config.js';
import { APP_VERSION, isRemoteNewer, normalizeVersion } from '../../shared/version.js';
import { GITHUB_UPDATES_REPO, GITHUB_UPDATES_URL, GITHUB_UPDATES_ENABLED, UPDATES_DISCONNECTED_MESSAGE } from '../../shared/update-repo.js';
import {
  createPreUpdateSafetyBackup,
  recoverDataIfMissing,
  VAULT_ROOT,
  writeUpdateGuardScript,
  type SafetyBackupResult,
} from './safe-backup.js';

const CACHE_MS = 15 * 60 * 1000; // shorter cache so friends see new releases sooner
const UA = 'Workout-OS-Updater';

export interface UpdateCheckResult {
  configured: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  htmlUrl: string | null;
  repo: string | null;
  message?: string;
  checkedAt: string;
  fromCache?: boolean;
  /** Always remind clients about safety */
  dataProtection?: {
    dualBackupRequired: boolean;
    safetyVault: string;
    note: string;
  };
}

export interface UpdateDownloadStatus {
  phase: 'idle' | 'downloading' | 'ready' | 'failed';
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
  message: string;
  error?: string;
}

interface CacheEntry {
  at: number;
  result: UpdateCheckResult;
}

let cache: CacheEntry | null = null;
let downloadPath: string | null = null;
let installInProgress = false;
let lastSafetyBackup: SafetyBackupResult | null = null;
let downloadStatus: UpdateDownloadStatus = {
  phase: 'idle', bytesDownloaded: 0, totalBytes: null, percent: null, message: 'No update download in progress.',
};
let downloadedRelease: UpdateCheckResult | null = null;

const UPDATE_NOTICE_FILE = path.join(DATA_DIR, 'last-update-notice.json');

/** Update source is configured in code; an empty source disables the updater. */
function resolveRepo(): string {
  return GITHUB_UPDATES_REPO;
}

function protectionNote() {
  return {
    dualBackupRequired: true,
    safetyVault: VAULT_ROOT,
    note:
      'Before any install, Health OS saves a verified copy of your database in two places (app backups + Windows SafetyVault outside the install folder). If data is missing after install, it is restored automatically. Install is blocked if backup fails.',
  };
}

function emptyResult(partial: Partial<UpdateCheckResult> & { message?: string }): UpdateCheckResult {
  return {
    configured: GITHUB_UPDATES_ENABLED,
    currentVersion: APP_VERSION,
    latestVersion: null,
    updateAvailable: false,
    releaseName: null,
    releaseNotes: null,
    publishedAt: null,
    downloadUrl: null,
    assetName: null,
    htmlUrl: null,
    repo: GITHUB_UPDATES_REPO || null,
    checkedAt: new Date().toISOString(),
    dataProtection: protectionNote(),
    ...partial,
  };
}

function pickSetupAsset(assets: Array<{ name: string; browser_download_url: string; size?: number }>) {
  if (!Array.isArray(assets)) return null;
  return (
    assets.find((a) => /(?:WorkoutOS|BodyOS)-Setup\.exe$/i.test(a.name)) ||
    assets.find((a) => /Setup\.exe$/i.test(a.name)) ||
    assets.find((a) => /\.exe$/i.test(a.name)) ||
    null
  );
}

export async function checkForUpdates(opts?: { force?: boolean }): Promise<UpdateCheckResult> {
  const repo = resolveRepo();

  if (!repo) {
    return emptyResult({ message: UPDATES_DISCONNECTED_MESSAGE });
  }

  if (!opts?.force && cache && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.result, fromCache: true, dataProtection: protectionNote() };
  }

  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': UA,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (e) {
    return emptyResult({
      configured: true,
      repo,
      message: `Could not reach GitHub: ${(e as Error).message}. Check internet connection.`,
    });
  }

  if (res.status === 404) {
    return emptyResult({
      configured: true,
      repo,
      message: `No releases yet on ${GITHUB_UPDATES_URL}/releases. Publish a Release with tag vX.Y.Z and WorkoutOS-Setup.exe.`,
    });
  }
  if (res.status === 403) {
    return emptyResult({
      configured: true,
      repo,
      message: 'GitHub rate limit hit. Try again in a few minutes (free public API is limited).',
    });
  }
  if (!res.ok) {
    return emptyResult({
      configured: true,
      repo,
      message: `GitHub returned ${res.status}`.slice(0, 200),
    });
  }

  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    published_at?: string;
    html_url?: string;
    assets?: Array<{ name: string; browser_download_url: string; size?: number }>;
  };

  const latestVersion = normalizeVersion(data.tag_name || data.name || '');
  const asset = pickSetupAsset(data.assets || []);
  const newerVersion = Boolean(latestVersion && isRemoteNewer(latestVersion, APP_VERSION));
  const updateAvailable = Boolean(newerVersion && asset);

  const result: UpdateCheckResult = {
    configured: true,
    currentVersion: APP_VERSION,
    latestVersion: latestVersion || null,
    updateAvailable,
    releaseName: data.name || data.tag_name || null,
    releaseNotes: (data.body || '').slice(0, 4000) || null,
    publishedAt: data.published_at || null,
    downloadUrl: asset?.browser_download_url || null,
    assetName: asset?.name || null,
    htmlUrl: data.html_url || null,
    repo,
    checkedAt: new Date().toISOString(),
    dataProtection: protectionNote(),
    message: !asset
      ? 'Latest release has no .exe installer asset. Upload WorkoutOS-Setup.exe to the Release.'
      : updateAvailable
        ? `Version ${latestVersion} is available. Install only after automatic dual backup succeeds.`
        : `You are on the latest version (${APP_VERSION}).`,
  };

  cache = { at: Date.now(), result };
  return result;
}

async function downloadAsset(
  url: string,
  dest: string,
  onProgress?: (bytesDownloaded: number, totalBytes: number | null) => void,
): Promise<number> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const totalBytes = Number(res.headers.get('content-length')) || null;
  const output = fs.createWriteStream(dest);
  let bytesDownloaded = 0;
  try {
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      bytesDownloaded += chunk.length;
      if (!output.write(chunk)) await new Promise<void>((resolve) => output.once('drain', resolve));
      onProgress?.(bytesDownloaded, totalBytes);
    }
    await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()));
    return bytesDownloaded;
  } catch (error) {
    output.destroy();
    fs.rmSync(dest, { force: true });
    throw error;
  }
}

async function downloadAndVerifyUpdate(): Promise<void> {
  const check = await checkForUpdates({ force: true });
  if (!check.updateAvailable || !check.downloadUrl) {
    throw new Error(check.message || 'No update is available to download.');
  }

  const dest = path.join(os.tmpdir(), check.assetName || 'WorkoutOS-Setup-update.exe');
  try {
    downloadStatus = { phase: 'downloading', bytesDownloaded: 0, totalBytes: null, percent: null, message: 'Downloading update…' };
    const bytes = await downloadAsset(check.downloadUrl, dest, (bytesDownloaded, totalBytes) => {
      downloadStatus = {
        phase: 'downloading', bytesDownloaded, totalBytes,
        percent: totalBytes ? Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100)) : null,
        message: totalBytes ? `Downloading update — ${Math.round((bytesDownloaded / totalBytes) * 100)}%` : 'Downloading update…',
      };
    });
    if (bytes < 100_000) {
      throw new Error('Downloaded file is too small to be a valid installer.');
    }
    downloadPath = dest;
    downloadedRelease = check;
    downloadStatus = { phase: 'ready', bytesDownloaded: bytes, totalBytes: bytes, percent: 100, message: 'Download complete. Ready to install.' };
  } catch (e) {
    downloadPath = null;
    downloadedRelease = null;
    downloadStatus = { phase: 'failed', bytesDownloaded: 0, totalBytes: null, percent: null, message: 'Update download failed.', error: (e as Error).message };
  }
}

/** Starts the download in the background so the web UI can display actual byte progress. */
export function beginUpdateDownload(): UpdateDownloadStatus {
  if (!GITHUB_UPDATES_ENABLED) {
    downloadStatus = { phase: 'failed', bytesDownloaded: 0, totalBytes: null, percent: null, message: UPDATES_DISCONNECTED_MESSAGE, error: UPDATES_DISCONNECTED_MESSAGE };
    return downloadStatus;
  }
  if (downloadStatus.phase === 'downloading') return downloadStatus;
  downloadStatus = {
    phase: 'downloading', bytesDownloaded: 0, totalBytes: null, percent: null, message: 'Preparing verified update download…',
  };
  void downloadAndVerifyUpdate();
  return downloadStatus;
}

export function getUpdateDownloadStatus(): UpdateDownloadStatus {
  return downloadStatus;
}

export function getDownloadedInstallerPath(): string | null {
  if (downloadPath && fs.existsSync(downloadPath)) return downloadPath;
  return null;
}

export interface UpdateNotice {
  version: string;
  name: string | null;
  notes: string | null;
  updatedAt: string;
  acknowledgedAt?: string;
}

function writeUpdateNotice() {
  if (!downloadedRelease?.latestVersion) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const notice: UpdateNotice = {
    version: downloadedRelease.latestVersion,
    name: downloadedRelease.releaseName,
    notes: downloadedRelease.releaseNotes,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(UPDATE_NOTICE_FILE, JSON.stringify(notice, null, 2), 'utf8');
}

export function getUpdateNotice(): UpdateNotice | null {
  try {
    if (fs.existsSync(UPDATE_NOTICE_FILE)) {
      const notice = JSON.parse(fs.readFileSync(UPDATE_NOTICE_FILE, 'utf8')) as UpdateNotice;
      if (notice.version === APP_VERSION) {
        return !notice.acknowledgedAt ? notice : null;
      }
    }
  } catch {
    /* fallback to release notes */
  }

  // Provide first-run announcement for current app version if not yet acknowledged
  const releaseNotesPath = path.join(ROOT, `release-notes-v${APP_VERSION}.md`);
  let notes = '';
  if (fs.existsSync(releaseNotesPath)) {
    try {
      notes = fs.readFileSync(releaseNotesPath, 'utf8');
    } catch {}
  }
  if (!notes) {
    notes = `Health OS v${APP_VERSION} brings Realtime Cloud Sync, workout tracking, a training calendar, and readiness tools.`;
  }

  return {
    version: APP_VERSION,
    name: `Health OS v${APP_VERSION}`,
    notes,
    updatedAt: new Date().toISOString(),
  };
}

export function acknowledgeUpdateNotice(): void {
  const notice = getUpdateNotice();
  if (!notice) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(UPDATE_NOTICE_FILE, JSON.stringify({ ...notice, acknowledgedAt: new Date().toISOString() }, null, 2), 'utf8');
}

/**
 * HARD SAFETY GATE then silent install.
 * Order: dual backup → verify → spawn guard script → exit process.
 * If backup fails, install never starts.
 */
export function applyDownloadedUpdate():
  | {
      ok: true;
      message: string;
      backup: { appBackupDir: string; vaultDir: string; dbBytes: number; jsonBytes: number };
    }
  | { ok: false; error: string } {
  if (!GITHUB_UPDATES_ENABLED) {
    return { ok: false, error: UPDATES_DISCONNECTED_MESSAGE };
  }
  if (installInProgress) {
    return { ok: false, error: 'Update already in progress.' };
  }
  const setup = getDownloadedInstallerPath();
  if (!setup) {
    return { ok: false, error: 'Installer not downloaded yet. Download first.' };
  }
  if (downloadStatus.phase !== 'ready') {
    return { ok: false, error: 'Update download has not completed. Download the update again.' };
  }
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'Automatic install is only supported on Windows. Run the downloaded Setup.exe manually after exporting a backup.',
    };
  }

  // ——— DATA PROTECTION GATE (must pass) ———
  const backup = createPreUpdateSafetyBackup('pre-update');
  if (!backup.ok) {
    return {
      ok: false,
      error: `Update BLOCKED to protect your workouts: ${backup.error}. Fix disk space/permissions, then try again. Nothing was installed.`,
    };
  }
  lastSafetyBackup = backup;

  try {
    writeUpdateNotice();
    const helper = writeUpdateGuardScript({
      setupExe: setup,
      installDir: ROOT,
      vaultDir: backup.vaultDir,
      appBackupDir: backup.appBackupDir,
    });

    installInProgress = true;
    const child = spawn('cmd.exe', ['/c', helper], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: os.tmpdir(),
    });
    child.unref();

    setTimeout(() => {
      try {
        process.exit(0);
      } catch {
        /* ignore */
      }
    }, 900);

    return {
      ok: true,
      message: `Safety backup verified (DB ${backup.dbBytes} bytes + JSON). Installing app files only. If anything goes wrong, data restores from: ${backup.vaultDir}`,
      backup: {
        appBackupDir: backup.appBackupDir,
        vaultDir: backup.vaultDir,
        dbBytes: backup.dbBytes,
        jsonBytes: backup.jsonBytes,
      },
    };
  } catch (e) {
    installInProgress = false;
    return { ok: false, error: (e as Error).message };
  }
}

export function getAppVersion(): string {
  return APP_VERSION;
}

export function getLastSafetyBackup(): SafetyBackupResult | null {
  return lastSafetyBackup;
}

/** Call once at process boot — recovers wiped data folder from SafetyVault. */
export function runStartupDataRecovery(): { recovered: boolean; message: string } {
  return recoverDataIfMissing();
}
