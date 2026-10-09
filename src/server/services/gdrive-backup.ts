import { google } from 'googleapis';
import { PORT } from '../config.js';
import stream from 'stream';
import { getSettings, saveSettings, loadAppDb } from '../db/repository.js';
import { APP_VERSION } from '../../shared/version.js';
import { logEvent } from '../db/repository.js';
import crypto from 'crypto';
import { syncRecordsFromDb } from '../../shared/sync.js';

// appDataFolder is private to Health OS. Backups do not appear in the user's Drive.
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const pendingStates = new Map<string, number>();

function getOAuth2Client() {
  const settings = getSettings();
  if (!settings.googleClientId || !settings.googleClientSecret) {
    throw new Error('Google Drive is not configured. Please add Google Client ID and Secret in Settings.');
  }

  // The redirect URI must match the one configured in Google Cloud Console
  // We use a localhost port that the server runs on
  const redirectUri = `http://localhost:${PORT}/api/gdrive/callback`;
  
  const oauth2Client = new google.auth.OAuth2(
    settings.googleClientId,
    settings.googleClientSecret,
    redirectUri
  );

  // Drive must not depend on the Google Fit token. The fallback keeps existing
  // installations working once, then the next Drive authorization stores its own token.
  if (settings.gdriveRefreshToken || settings.googleRefreshToken) {
    oauth2Client.setCredentials({
      refresh_token: settings.gdriveRefreshToken || settings.googleRefreshToken
    });
  }

  return oauth2Client;
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
    state,
  });
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const expiry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!expiry || expiry < Date.now()) throw new Error('This Google Drive connection link expired. Please try again.');
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  if (tokens.refresh_token) {
    await saveSettings({ 
      gdriveRefreshToken: tokens.refresh_token,
      gdriveEnabled: true
    });
  } else {
    // If no refresh token is returned, they might have authorized before. 
    // We just enable it if they already have one.
    const current = getSettings();
    if (current.gdriveRefreshToken || current.googleRefreshToken) {
      await saveSettings({ gdriveEnabled: true });
    } else {
      throw new Error('No refresh token received from Google. Please disconnect and try again, ensuring you grant offline access.');
    }
  }
}

export async function uploadBackup(): Promise<{ ok: boolean; size?: number; error?: string }> {
  try {
    const oauth2Client = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const snapshot = loadAppDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `workout-os-backup-${timestamp}-v${APP_VERSION}.json`;
    
    const jsonBody = JSON.stringify({
      format: 'body-os-portable-backup', version: 2, createdAt: new Date().toISOString(), originDeviceId: 'desktop',
      source: { appVersion: APP_VERSION, kind: 'gdrive-auto' },
      // This excludes settings, OAuth refresh tokens and all desktop-only secrets.
      records: syncRecordsFromDb(snapshot, 'web-backup'),
    }, null, 2);

    const buffer = Buffer.from(jsonBody, 'utf8');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
      name: fileName,
      parents: ['appDataFolder'],
    };

    const media = {
      mimeType: 'application/json',
      body: bufferStream,
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, size',
    });

    const size = parseInt(res.data.size || '0', 10);
    
    await saveSettings({
      gdriveLastBackup: new Date().toISOString(),
      gdriveLastBackupSize: size
    });

    logEvent('gdrive_backup_success', { size, fileName });

    // Cleanup old backups
    await deleteOldBackups(drive, 5);

    return { ok: true, size };
  } catch (e) {
    console.error('[gdrive] Backup failed:', e);
    return { ok: false, error: (e as Error).message };
  }
}

async function deleteOldBackups(drive: any, keep: number) {
  try {
    const res = await drive.files.list({
      q: `'appDataFolder' in parents and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      spaces: 'appDataFolder',
    });

    const files = res.data.files || [];
    if (files.length > keep) {
      const toDelete = files.slice(keep);
      for (const file of toDelete) {
        await drive.files.delete({ fileId: file.id });
      }
    }
  } catch (e) {
    console.error('[gdrive] Failed to delete old backups:', e);
  }
}

export async function listBackups(): Promise<Array<{ id: string; name: string; date: string; size: number }>> {
  try {
    const oauth2Client = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const res = await drive.files.list({
      q: `'appDataFolder' in parents and trashed=false`,
      fields: 'files(id, name, createdTime, size)',
      orderBy: 'createdTime desc',
      spaces: 'appDataFolder',
    });

    return (res.data.files || []).map(f => ({
      id: f.id as string,
      name: f.name as string,
      date: f.createdTime as string,
      size: parseInt(f.size || '0', 10)
    }));
  } catch (e) {
    console.error('[gdrive] List backups failed:', e);
    return [];
  }
}

export async function downloadBackup(fileId: string): Promise<any> {
  const oauth2Client = getOAuth2Client();
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'json' }
  );

  return res.data;
}

export async function disconnect(): Promise<void> {
  await saveSettings({
    gdriveEnabled: false,
    gdriveSchedule: 'weekly',
    gdriveLastBackup: '',
    gdriveLastBackupSize: 0,
    gdriveFolderId: '',
    gdriveRefreshToken: '',
  });
}
