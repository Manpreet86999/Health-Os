import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { DATA_DIR } from '../config.js';

const folder = path.join(DATA_DIR, 'diagnostics');
fs.mkdirSync(folder, { recursive: true });
const destination = path.join(folder, 'events.jsonl');
if (fs.existsSync(destination) && fs.statSync(destination).size > 5_000_000) {
  fs.renameSync(destination, path.join(folder, 'events.previous.jsonl'));
}
export const logger = pino({
  base: undefined,
  redact: { paths: ['password', 'token', 'apiKey', 'authorization', 'body', 'headers', '*.password', '*.token', '*.apiKey'], remove: true },
}, pino.destination({ dest: destination, sync: true }));

/** Only fixed event names and non-personal diagnostics are accepted at call sites. */
export function logFailure(event: string, error: unknown) {
  logger.error({ event, errorType: error instanceof Error ? error.name : 'UnknownError' }, 'Operation failed');
}
