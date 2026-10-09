/**
 * Data-loss prevention for updates and emergencies.
 *
 * Rules:
 * 1. Never start an installer until a verified dual backup exists.
 * 2. One copy lives under {app}/backups (convenient).
 * 3. One copy lives OUTSIDE the install tree (survives full folder wipe).
 * 4. Post-update: if DB missing, auto-restore from vault.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { BACKUP_DIR, DATA_DIR, ROOT, SQLITE_FILE } from '../config.js';
import { closeDb, getDb } from '../db/connection.js';
import * as repo from '../db/repository.js';
import { APP_VERSION } from '../../shared/version.js';

export const VAULT_ROOT = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(),
  'WorkoutOS',
  'SafetyVault',
);

export interface BackupManifest {
  kind: 'pre-update' | 'manual' | 'startup';
  createdAt: string;
  appVersion: string;
  installRoot: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  dualPaths: { appBackups: string; safetyVault: string };
  dbPresentBefore: boolean;
  notes: string[];
}

export interface SafetyBackupResult {
  ok: true;
  stamp: string;
  appBackupDir: string;
  vaultDir: string;
  manifest: BackupManifest;
  jsonBytes: number;
  dbBytes: number;
}

export interface SafetyBackupFail {
  ok: false;
  error: string;
}

function sha256File(filePath: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFileSafe(src: string, dest: string) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function listDbSidecars(base: string): string[] {
  const names = [base, `${base}-wal`, `${base}-shm`];
  return names.filter((p) => fs.existsSync(p));
}

function writeTree(destDir: string, files: Array<{ name: string; abs: string }>): BackupManifest['files'] {
  ensureDir(destDir);
  const out: BackupManifest['files'] = [];
  for (const f of files) {
    const dest = path.join(destDir, f.name);
    copyFileSafe(f.abs, dest);
    const st = fs.statSync(dest);
    if (st.size <= 0 && !f.name.endsWith('.json')) {
      // empty sidecars ok; main db/json must not be empty if source had data
    }
    out.push({ name: f.name, bytes: st.size, sha256: sha256File(dest) });
  }
  return out;
}

function verifyCopy(srcManifestFiles: BackupManifest['files'], destDir: string): string | null {
  for (const f of srcManifestFiles) {
    const p = path.join(destDir, f.name);
    if (!fs.existsSync(p)) return `Missing after copy: ${f.name}`;
    const st = fs.statSync(p);
    if (st.size !== f.bytes) return `Size mismatch: ${f.name}`;
    if (sha256File(p) !== f.sha256) return `Checksum mismatch: ${f.name}`;
    if (f.name.endsWith('.db')) {
      const copy = new DatabaseSync(p, { readOnly: true });
      try {
        if (copy.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') return `Database integrity check failed: ${f.name}`;
      } finally { copy.close(); }
    }
  }
  return null;
}

/**
 * Create dual pre-update backup. HARD GATE for installers.
 * - JSON full export (restore via Settings)
 * - Raw SQLite files (bit-identical recovery)
 * - Written to app backups/ AND SafetyVault outside install dir
 */
export function createPreUpdateSafetyBackup(kind: BackupManifest['kind'] = 'pre-update'): SafetyBackupResult | SafetyBackupFail {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folderName = `${kind}-${stamp}-v${APP_VERSION}`;
  const appBackupDir = path.join(BACKUP_DIR, folderName);
  const vaultDir = path.join(VAULT_ROOT, folderName);
  const notes: string[] = [];

  try {
    ensureDir(BACKUP_DIR);
    ensureDir(VAULT_ROOT);
    ensureDir(appBackupDir);
    ensureDir(vaultDir);

    const dbPresentBefore = fs.existsSync(SQLITE_FILE);

    // 1) Live JSON snapshot (works while DB is open)
    const snapshot = repo.loadAppDb();
    const jsonName = 'workout-os-full-backup.json';
    const jsonTmp = path.join(os.tmpdir(), `wos-backup-${stamp}.json`);
    const jsonBody = JSON.stringify(
      {
        meta: {
          exportedAt: new Date().toISOString(),
          appVersion: APP_VERSION,
          kind,
          installRoot: ROOT,
        },
        db: snapshot,
      },
      null,
      2,
    );
    if (jsonBody.length < 20) {
      return { ok: false, error: 'JSON backup is empty — refusing to proceed (data protection).' };
    }
    fs.writeFileSync(jsonTmp, jsonBody, 'utf8');

    // 2) Checkpoint + close so WAL is merged, then copy raw DB files
    try {
      getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (e) {
      notes.push(`wal_checkpoint warning: ${(e as Error).message}`);
    }
    closeDb();

    const staged: Array<{ name: string; abs: string }> = [{ name: jsonName, abs: jsonTmp }];
    for (const abs of listDbSidecars(SQLITE_FILE)) {
      staged.push({ name: path.basename(abs), abs });
    }

    // Also copy any other small files in data/ (settings leftovers, etc.)
    if (fs.existsSync(DATA_DIR)) {
      for (const name of fs.readdirSync(DATA_DIR)) {
        if (name.startsWith('powerpulse.db')) continue; // already handled
        const abs = path.join(DATA_DIR, name);
        try {
          if (fs.statSync(abs).isFile() && fs.statSync(abs).size < 50 * 1024 * 1024) {
            staged.push({ name: `data-extra-${name}`, abs });
          }
        } catch {
          /* skip */
        }
      }
    }

    const filesApp = writeTree(appBackupDir, staged);
    const errApp = verifyCopy(filesApp, appBackupDir);
    if (errApp) return { ok: false, error: `App backup verify failed: ${errApp}` };

    // Dual write to external vault
    for (const f of filesApp) {
      copyFileSafe(path.join(appBackupDir, f.name), path.join(vaultDir, f.name));
    }
    const errVault = verifyCopy(filesApp, vaultDir);
    if (errVault) return { ok: false, error: `Safety vault verify failed: ${errVault}` };

    // If user had a DB, require non-trivial backup
    const dbEntry = filesApp.find((f) => f.name === 'powerpulse.db');
    const jsonEntry = filesApp.find((f) => f.name === jsonName);
    if (dbPresentBefore && (!dbEntry || dbEntry.bytes < 1000)) {
      return {
        ok: false,
        error: 'Database was present but backup copy is too small — update blocked to protect your data.',
      };
    }
    if (!jsonEntry || jsonEntry.bytes < 50) {
      return { ok: false, error: 'JSON backup verify failed — update blocked.' };
    }

    const manifest: BackupManifest = {
      kind,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      installRoot: ROOT,
      files: filesApp,
      dualPaths: { appBackups: appBackupDir, safetyVault: vaultDir },
      dbPresentBefore,
      notes,
    };

    const manPath = path.join(appBackupDir, 'manifest.json');
    const manVault = path.join(vaultDir, 'manifest.json');
    fs.writeFileSync(manPath, JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(manVault, JSON.stringify(manifest, null, 2), 'utf8');

    // Pointer to latest vault for emergency restore
    fs.writeFileSync(
      path.join(VAULT_ROOT, 'LATEST.json'),
      JSON.stringify(
        {
          folder: folderName,
          vaultDir,
          appBackupDir,
          createdAt: manifest.createdAt,
          appVersion: APP_VERSION,
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'LATEST-PRE-UPDATE.json'),
      JSON.stringify({ folder: folderName, appBackupDir, vaultDir, createdAt: manifest.createdAt }, null, 2),
      'utf8',
    );

    try {
      fs.unlinkSync(jsonTmp);
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      stamp,
      appBackupDir,
      vaultDir,
      manifest,
      jsonBytes: jsonEntry.bytes,
      dbBytes: dbEntry?.bytes || 0,
    };
  } catch (e) {
    return { ok: false, error: `Safety backup failed: ${(e as Error).message}` };
  }
}

/** True if the live install still has a usable DB file. */
export function liveDataLooksIntact(): boolean {
  try {
    if (!fs.existsSync(SQLITE_FILE)) return false;
    return fs.statSync(SQLITE_FILE).size >= 1000;
  } catch {
    return false;
  }
}

function findLatestVaultDir(): string | null {
  try {
    const latest = path.join(VAULT_ROOT, 'LATEST.json');
    if (fs.existsSync(latest)) {
      const j = JSON.parse(fs.readFileSync(latest, 'utf8')) as { vaultDir?: string };
      if (j.vaultDir && fs.existsSync(j.vaultDir)) return j.vaultDir;
    }
    if (!fs.existsSync(VAULT_ROOT)) return null;
    const dirs = fs
      .readdirSync(VAULT_ROOT)
      .filter((n) => n.startsWith('pre-update-') || n.startsWith('manual-') || n.startsWith('startup-'))
      .map((n) => ({ n, t: fs.statSync(path.join(VAULT_ROOT, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return dirs[0] ? path.join(VAULT_ROOT, dirs[0].n) : null;
  } catch {
    return null;
  }
}

/**
 * If data/ DB is missing or tiny, restore from SafetyVault (or app backups).
 * Safe to call on every startup.
 */
export function recoverDataIfMissing(): {
  recovered: boolean;
  message: string;
  from?: string;
} {
  if (liveDataLooksIntact()) {
    return { recovered: false, message: 'Data OK' };
  }

  const vault = findLatestVaultDir();
  const candidates: string[] = [];
  if (vault) candidates.push(vault);

  // Also try app backups latest
  try {
    const ptr = path.join(BACKUP_DIR, 'LATEST-PRE-UPDATE.json');
    if (fs.existsSync(ptr)) {
      const j = JSON.parse(fs.readFileSync(ptr, 'utf8')) as { appBackupDir?: string };
      if (j.appBackupDir && fs.existsSync(j.appBackupDir)) candidates.push(j.appBackupDir);
    }
  } catch {
    /* ignore */
  }

  for (const dir of candidates) {
    const dbSrc = path.join(dir, 'powerpulse.db');
    const jsonSrc = path.join(dir, 'workout-os-full-backup.json');
    if (fs.existsSync(dbSrc) && fs.statSync(dbSrc).size >= 1000) {
      try {
        closeDb();
        ensureDir(DATA_DIR);
        // Remove broken empties
        for (const side of listDbSidecars(SQLITE_FILE)) {
          try {
            fs.unlinkSync(side);
          } catch {
            /* ignore */
          }
        }
        copyFileSafe(dbSrc, SQLITE_FILE);
        for (const side of ['powerpulse.db-wal', 'powerpulse.db-shm']) {
          const s = path.join(dir, side);
          if (fs.existsSync(s)) copyFileSafe(s, path.join(DATA_DIR, side));
        }
        if (liveDataLooksIntact()) {
          return {
            recovered: true,
            message: `Restored database from safety backup: ${dir}`,
            from: dir,
          };
        }
      } catch (e) {
        return {
          recovered: false,
          message: `Restore attempt failed: ${(e as Error).message}`,
          from: dir,
        };
      }
    }
    // JSON-only path: leave for manual Settings restore; write a pointer file
    if (fs.existsSync(jsonSrc)) {
      ensureDir(DATA_DIR);
      const hint = path.join(DATA_DIR, 'RESTORE-FROM-BACKUP.txt');
      fs.writeFileSync(
        hint,
        `Your database file was missing after an update.\n\nA JSON backup is available at:\n${jsonSrc}\n\nOpen Health OS → Settings → Data → Restore Backup and paste that JSON file contents.\nVault: ${VAULT_ROOT}\n`,
        'utf8',
      );
    }
  }

  return {
    recovered: false,
    message: liveDataLooksIntact()
      ? 'Data OK'
      : `No usable DB found. Check safety vault: ${VAULT_ROOT}`,
  };
}

/** Write the post-update batch that verifies data and restores from vault if needed. */
export function writeUpdateGuardScript(opts: {
  setupExe: string;
  installDir: string;
  vaultDir: string;
  appBackupDir: string;
}): string {
  const helper = path.join(os.tmpdir(), 'workout-os-safe-update.bat');
  const logFile = path.join(opts.installDir, 'backups', 'last-update-log.txt');
  const dataDb = path.join(opts.installDir, 'data', 'powerpulse.db');
  const vaultDb = path.join(opts.vaultDir, 'powerpulse.db');
  const appDb = path.join(opts.appBackupDir, 'powerpulse.db');
  const startBat = path.join(opts.installDir, 'start.bat');

  // Pure cmd.exe — restore if DB missing after installer
  const bat = `@echo off
setlocal EnableExtensions
set "LOG=${logFile}"
set "INSTALL=${opts.installDir}"
set "SETUP=${opts.setupExe}"
set "DATA_DB=${dataDb}"
set "VAULT_DB=${vaultDb}"
set "APP_DB=${appDb}"
set "STARTBAT=${startBat}"
set "REQUIREMENTS=%INSTALL%\requirements.txt"
set "VERIFY_REQUIREMENTS=%INSTALL%\scripts\verify-update-requirements.cjs"

echo ===== Health OS SAFE UPDATE %DATE% %TIME% =====>> "%LOG%"
echo Install dir: %INSTALL%>> "%LOG%"
echo.
echo  Health OS safe update
echo  --------------------------------
echo  1. Your data was backed up BEFORE this step.
echo  2. Installer will NOT delete the data folder.
echo  3. If DB is missing after install, it auto-restores.
echo.
echo Waiting for app to exit...
timeout /t 4 /nobreak >nul

echo Stopping listeners on 10000/2000...>> "%LOG%"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":10000" ^| findstr "LISTENING"') do taskkill /F /T /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":2000" ^| findstr "LISTENING"') do taskkill /F /T /PID %%a >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Health OS Server*" /IM cmd.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Running installer (app files only)...>> "%LOG%"
REM Only replace application files; Inno script never ships/deletes user data
call "%SETUP%" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="%INSTALL%"
set "SETUP_ERR=%ERRORLEVEL%"
echo Installer exit code: %SETUP_ERR% >> "%LOG%"

if not "%SETUP_ERR%"=="0" (
  echo INSTALLER FAILED code %SETUP_ERR%>> "%LOG%"
  echo.
  echo  Installer reported an error. Your data backups are safe at:
  echo  ${opts.vaultDir}
  echo  ${opts.appBackupDir}
  pause
  exit /b 1
)

REM ---- EMBEDDED RELEASE REQUIREMENTS: verify runtime and install only missing/changed packages ----
echo Verifying update requirements...>> "%LOG%"
if not exist "%REQUIREMENTS%" (
  echo EMBEDDED REQUIREMENTS FILE MISSING>> "%LOG%"
  echo The update is incomplete because its embedded requirements file is missing.
  pause
  exit /b 1
)
if not exist "%VERIFY_REQUIREMENTS%" (
  echo EMBEDDED REQUIREMENTS CHECKER MISSING>> "%LOG%"
  echo The update is incomplete because its requirements checker is missing.
  pause
  exit /b 1
)
call node "%VERIFY_REQUIREMENTS%" "%REQUIREMENTS%" >> "%LOG%" 2>&1
set "REQ_ERR=%ERRORLEVEL%"
if not "%REQ_ERR%"=="0" (
  echo REQUIREMENTS CHECK FAILED code %REQ_ERR%>> "%LOG%"
  echo This update needs a newer Node.js or npm runtime. Check the update log for details.
  pause
  exit /b 1
)
echo Checking Health OS packages and installing missing requirements...>> "%LOG%"
call npm.cmd install --omit=dev --no-audit --no-fund >> "%LOG%" 2>&1
set "NPM_ERR=%ERRORLEVEL%"
if not "%NPM_ERR%"=="0" (
  echo PACKAGE INSTALL FAILED code %NPM_ERR%>> "%LOG%"
  echo The app files were updated, but required packages could not be installed. Check your internet connection and start Health OS again.
  pause
  exit /b 1
)
echo Package requirements fulfilled.>> "%LOG%"

REM ---- DATA GUARD: never leave user without a database if we had a backup ----
if not exist "%INSTALL%\\data" mkdir "%INSTALL%\\data" >nul 2>&1

set "NEED_RESTORE=0"
if not exist "%DATA_DB%" set "NEED_RESTORE=1"
if exist "%DATA_DB%" (
  for %%I in ("%DATA_DB%") do if %%~zI LSS 1000 set "NEED_RESTORE=1"
)

if "%NEED_RESTORE%"=="1" (
  echo DATA MISSING OR TOO SMALL — restoring from safety vault>> "%LOG%"
  if exist "%VAULT_DB%" (
    copy /Y "%VAULT_DB%" "%DATA_DB%" >nul
    if exist "${path.join(opts.vaultDir, 'powerpulse.db-wal')}" copy /Y "${path.join(opts.vaultDir, 'powerpulse.db-wal')}" "%INSTALL%\\data\\powerpulse.db-wal" >nul
    if exist "${path.join(opts.vaultDir, 'powerpulse.db-shm')}" copy /Y "${path.join(opts.vaultDir, 'powerpulse.db-shm')}" "%INSTALL%\\data\\powerpulse.db-shm" >nul
    echo Restored from vault: ${opts.vaultDir}>> "%LOG%"
  ) else if exist "%APP_DB%" (
    copy /Y "%APP_DB%" "%DATA_DB%" >nul
    echo Restored from app backup: ${opts.appBackupDir}>> "%LOG%"
  ) else (
    echo NO BACKUP DB FOUND — user must restore JSON manually>> "%LOG%"
    echo Could not find powerpulse.db backup.>> "%LOG%"
  )
) else (
  echo Data file present after install — OK>> "%LOG%"
)

REM Final check
if exist "%DATA_DB%" (
  for %%I in ("%DATA_DB%") do echo Final DB size: %%~zI>> "%LOG%"
) else (
  echo WARNING: DB still missing after restore attempts>> "%LOG%"
)

del /f /q "%SETUP%" >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting app...>> "%LOG%"
start "" "%STARTBAT%"
endlocal
`;

  fs.writeFileSync(helper, bat, 'utf8');
  return helper;
}
