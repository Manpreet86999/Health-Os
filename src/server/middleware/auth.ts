import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_TTL_MS } from '../config.js';
import { getSettings } from '../db/repository.js';
import { verifyPin } from '../lib/secrets.js';

export interface SessionInfo {
  token: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionInfo>();

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/status',
  '/api/auth/unlock',
  '/api/auth/setup-pin',
  '/api/google-fit/callback',
  '/api/gdrive/callback',
]);

export function createSessionToken(): string {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { token, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function revokeSession(token: string): void {
  sessions.delete(token);
}

export function isSessionValid(token?: string | null): boolean {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api')) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  const settings = getSettings();
  // No PIN configured → open for single local user
  if (!settings.pinHash) return next();

  const authHeader = req.header('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7) : '';
  const header = req.header('x-body-os-token') || req.header('x-workout-os-token') || req.header('x-powerpulse-token') || bearerToken || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = header || queryToken;
  if (isSessionValid(token)) return next();

  res.status(401).json({ error: 'PIN unlock required.', code: 'PIN_REQUIRED' });
}

export function tryUnlock(pin: string): { ok: true; token: string } | { ok: false; error: string } {
  const settings = getSettings();
  if (!settings.pinHash) {
    return { ok: true, token: createSessionToken() };
  }
  if (!verifyPin(pin, settings.pinHash, settings.secretsSalt)) {
    return { ok: false, error: 'Incorrect PIN.' };
  }
  return { ok: true, token: createSessionToken() };
}
