import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const MACHINE_KEY_FILE = path.join(DATA_DIR, '.machine-key');

function ensureMachineKey(): Buffer {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(MACHINE_KEY_FILE)) {
    return Buffer.from(fs.readFileSync(MACHINE_KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(MACHINE_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  try {
    fs.chmodSync(MACHINE_KEY_FILE, 0o600);
  } catch {
    /* windows */
  }
  return key;
}

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, useSalt, 64).toString('hex');
  return { hash, salt: useSalt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  if (!hash || !salt || !pin) return false;
  const next = crypto.scryptSync(pin, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch {
    return false;
  }
}

/** Encrypt sensitive setting values at rest with a machine-local key. */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (plain.startsWith('enc:v1:')) return plain;
  const key = ensureMachineKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(value: string): string {
  if (!value) return '';
  if (!value.startsWith('enc:v1:')) return value;
  const [, , ivHex, tagHex, dataHex] = value.split(':');
  const key = ensureMachineKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
