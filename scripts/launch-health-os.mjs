import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdirSync, openSync, closeSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const logDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Health Os', 'logs'); mkdirSync(logDir, { recursive: true });
const log = path.join(logDir, 'desktop.log'), port = 10000;
async function ready() { try { const response = await fetch(`http://127.0.0.1:${port}/health-os-desktop`, { signal: AbortSignal.timeout(800) }); return response.ok && (await response.json()).app === 'Health OS'; } catch { return false; } }
try {
  if (!await ready()) {
    const handle = openSync(log, 'a');
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'serve-web.mjs')], { cwd: root, env: { ...process.env, PORT: String(port), HEALTH_OS_INSTALLED: '1' }, detached: true, stdio: ['ignore', handle, handle], windowsHide: true });
    child.on('error', error => appendFileSync(log, `${error.message}\n`)); child.unref(); closeSync(handle);
    let started = false; for (let i = 0; i < 60; i++) { if (await ready()) { started = true; break; } await new Promise(resolve => setTimeout(resolve, 250)); }
    if (!started) throw new Error('Unable to start Health OS. Port 10000 may be in use. See ' + log);
  }
  const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  await new Promise((resolve, reject) => {
    const ps = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/open-health-os.ps1'), '-Url', `http://localhost:${port}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let details = '';
    ps.stdout.on('data', chunk => { details += chunk; });
    ps.stderr.on('data', chunk => { details += chunk; });
    ps.once('error', reject);
    ps.once('close', code => {
      appendFileSync(log, `${new Date().toISOString()} ${details.trim()}\n`);
      code === 0 ? resolve() : reject(new Error('Unable to open the Health Os browser window. See ' + log));
    });
  });
} catch (error) {
  process.exitCode = 1;
  appendFileSync(log, `${new Date().toISOString()} ${error.message}\n`);
  const message = 'Health OS could not start. Please see your local Health Os logs folder.';
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${message}', 'Health OS')`], { stdio: 'ignore', windowsHide: true }).unref();
}
