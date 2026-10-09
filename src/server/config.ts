import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, '../..');

export const PORT = Number(process.env.PORT || 10000);
/** Single-user local-only: never bind to the public network by default. */
export const HOST = process.env.HOST || '127.0.0.1';
export const DATA_DIR = path.resolve(process.env.BODY_OS_DATA_DIR || path.join(ROOT, 'data'));
export const BACKUP_DIR = path.resolve(process.env.BODY_OS_BACKUP_DIR || path.join(ROOT, 'backups'));
export const SQLITE_FILE = path.join(DATA_DIR, 'powerpulse.db');
/** Separate, rebuildable analytical mirror. It never stores credentials or replaces live records. */
export const DUCKDB_FILE = path.join(DATA_DIR, 'body-os-analytics.duckdb');
export const LEGACY_JSON_DB = path.join(DATA_DIR, 'powerpulse-db.json');
export const LEGACY_SETTINGS = path.join(DATA_DIR, 'email-settings.json');

/** Mail is delivered by Supabase Edge Functions. Local processes never receive SMTP credentials. */
export const HEALTH_OS_SENDER_EMAIL = 'developer.healthos@gmail.com';
export const HEALTH_OS_SENDER_NAME = 'Health OS';
export const isHealthOsEmailConfigured = (): boolean => false;
export const CLIENT_DIST = path.join(ROOT, 'dist/client');
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
