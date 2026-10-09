import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { releaseConfig as config } from '../dist/client/release-config.js';

const token = crypto.randomBytes(32).toString('hex');
const enabled = process.platform === 'win32' && process.env.HEALTH_OS_INSTALLED === '1';
let installing = false;
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); }
export function authorized(req, port) {
  const host = req.headers.host;
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(host) && req.headers.origin === `http://${host}` && req.headers['x-health-os-token'] === token;
}
async function get(url, timeout = 15000) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Health-OS-Updater' }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`GitHub download failed (${response.status}).`); return response;
}
function newer(remote) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(remote); if (!match) return false;
  const local = config.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const part = Number(match[i + 1]); if (part !== local[i]) return part > local[i]; } return false;
}
export async function desktopRoute(req, res, port) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (!pathname.startsWith('/health-os-desktop')) return false;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { json(res, 403, { error: 'Local access required.' }); return true; }
  if (pathname === '/health-os-desktop' && req.method === 'GET') { json(res, 200, { app: 'Health OS', version: config.version, canInstall: enabled, token: enabled ? token : undefined }); return true; }
  if (pathname !== '/health-os-desktop/install' || req.method !== 'POST') { json(res, 405, { error: 'Method not allowed.' }); return true; }
  if (!enabled || !authorized(req, port)) { json(res, 403, { error: 'Use the installed Health OS app to start an update.' }); return true; }
  if (installing) { json(res, 409, { error: 'An update is already in progress.' }); return true; }
  installing = true; let directory;
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error('Invalid update request.'); }
    const { tag } = JSON.parse(body);
    const release = await (await get(`https://api.github.com/repos/${config.repo}/releases/latest`)).json();
    if (release.draft || release.prerelease || release.tag_name !== tag || !newer(tag)) throw new Error('This is not a newer published stable release.');
    const name = `Health-OS-Setup-${tag}.exe`, expectedURL = `https://github.com/${config.repo}/releases/download/${tag}/${name}`;
    const asset = release.assets?.find(item => item.name === name && item.browser_download_url === expectedURL);
    if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 512 * 1024 * 1024) throw new Error('A valid Windows installer is missing from this release.');
    const checksumURL = `https://github.com/${config.repo}/releases/download/${tag}/SHA256SUMS.txt`;
    if (!release.assets.some(item => item.name === 'SHA256SUMS.txt' && item.browser_download_url === checksumURL)) throw new Error('The release checksum file is missing.');
    const checksum = (await (await get(checksumURL)).text()).split(/\r?\n/).find(line => line.trim().endsWith(`  ${name}`));
    const expectedHash = checksum?.split(/\s+/)[0]; if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw new Error('The installer checksum is missing or invalid.');
    const response = await get(expectedURL, 600000);
    directory = await mkdtemp(path.join(os.tmpdir(), 'health-os-update-')); const installer = path.join(directory, name);
    let bytes = 0; const hash = crypto.createHash('sha256');
    const inspect = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; if (bytes > asset.size) { callback(new Error('Installer size mismatch.')); return; } hash.update(chunk); callback(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body), inspect, createWriteStream(installer, { flags: 'wx' }));
    if (bytes !== asset.size || hash.digest('hex') !== expectedHash.toLowerCase()) throw new Error('Installer checksum verification failed. No installer was started.');
    const child = spawn(installer, [], { detached: true, stdio: 'ignore', windowsHide: false });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
    await writeFile(path.join(directory, 'verified.txt'), `Health OS ${tag}\nSHA-256 ${expectedHash}\n`);
    json(res, 200, { ok: true }); setTimeout(() => process.exit(0), 1500).unref();
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    json(res, 400, { error: error.message }); installing = false;
  }
  return true;
}
