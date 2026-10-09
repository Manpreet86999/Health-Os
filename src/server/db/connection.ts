import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DATA_DIR, SQLITE_FILE } from '../config.js';

export type AppDatabase = DatabaseSync;

let db: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(SQLITE_FILE);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

let transactionId = 0;

/** Run a function inside a SQLite transaction. */
export function withTransaction<T>(fn: () => T): T {
  const database = getDb();
  const savepoint = `body_os_${++transactionId}`;
  database.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = fn();
    database.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    try {
      database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      database.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      /* ignore */
    }
    throw error;
  }
}
