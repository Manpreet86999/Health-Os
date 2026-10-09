import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { BACKUP_DIR, DATA_DIR, HOST, PORT, SQLITE_FILE } from './config.js';
import { createApp } from './app.js';
import { getDb, closeDb } from './db/connection.js';
import { retireLegacyEmailCredentials } from './db/repository.js';
import { migrate } from './db/migrate.js';
import { startCronJobs } from './services/cron.js';
import { initMcp } from './ai/mcp.js';
import { runStartupDataRecovery } from './services/updates.js';
import { APP_VERSION } from '../shared/version.js';
import { UPDATES_DISCONNECTED_MESSAGE } from '../shared/update-repo.js';

function openDesktopAppWindow() {
  if (process.env.BODY_OS_OPEN_APP !== '1') return;

  const url = `http://127.0.0.1:${PORT}`;
  const launch = (command: string, args: string[]) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  };

  if (process.platform === 'win32') {
    const edgeCandidates = [
      process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ].filter((path): path is string => Boolean(path));
    const edge = edgeCandidates.find((path) => fs.existsSync(path));

    if (edge) {
      console.log(`  [launcher] Opening Health OS in its own app window: ${url}`);
      launch(edge, [`--app=${url}`]);
      return;
    }

    console.log(`  [launcher] Opening Health OS in your default browser: ${url}`);
    launch('cmd.exe', ['/c', 'start', '', url]);
    return;
  }

  console.log(`  [launcher] Opening Health OS: ${url}`);
  launch(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // If an update (or anything else) wiped/missing the DB, restore from SafetyVault first.
  const recovery = runStartupDataRecovery();
  if (recovery.recovered) {
    console.log(`  [data-guard] ${recovery.message}`);
  } else if (recovery.message && !recovery.message.includes('Data OK')) {
    console.warn(`  [data-guard] ${recovery.message}`);
  }

  const db = getDb();
  migrate(db);
  retireLegacyEmailCredentials();

  const app = createApp();
  
  // Initialize MCP servers in background
  initMcp().catch(console.error);

  const server = app.listen(PORT, HOST, () => {
    console.log('');
    console.log(`  Health OS ${APP_VERSION} (local single-user)`);
    console.log(`  URL:  http://127.0.0.1:${PORT}`);
    console.log(`  DB:   ${SQLITE_FILE}`);
    console.log(`  Bind: ${HOST} only (not exposed on LAN)`);
    console.log(`  Updates: ${UPDATES_DISCONNECTED_MESSAGE}`);
    console.log('  Keep this terminal open. Press Ctrl+C to stop.');
    console.log('');

    openDesktopAppWindow();

    startCronJobs();
  });

  const shutdown = () => {
    console.log('\nShutting down…');
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
