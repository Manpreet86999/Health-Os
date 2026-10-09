const fs = require('fs');
const { spawnSync } = require('child_process');

const file = process.argv[2] || 'requirements.txt';
if (!fs.existsSync(file)) fail('This update is missing its embedded requirements.txt file.');

const values = new Map();
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const match = line.match(/^([a-z-]+)\s*(?:=|>=)\s*(.+)$/i);
  if (match) values.set(match[1].toLowerCase(), match[2].trim().toLowerCase());
}

const minNode = Number((values.get('node') || '').match(/^\d+/)?.[0]);
const minNpm = Number((values.get('npm') || '').match(/^\d+/)?.[0]);
if (values.get('body-os-requirements') !== '1' || !Number.isInteger(minNode) || !Number.isInteger(minNpm) || values.get('install') !== 'npm-install') {
  fail('The embedded requirements.txt file is invalid.');
}

const major = (value) => Number(String(value).match(/^v?(\d+)/)?.[1] || 0);
if (major(process.version) < minNode) fail(`This update needs Node.js ${minNode} or newer. Install the current Node.js LTS release, then start Body OS again.`);

const npm = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd --version'], { encoding: 'utf8', windowsHide: true })
  : spawnSync('npm', ['--version'], { encoding: 'utf8' });
if (npm.error || npm.status !== 0 || major(npm.stdout) < minNpm) fail(`This update needs npm ${minNpm} or newer. Install the current Node.js LTS release, then start Body OS again.`);

console.log(`Requirements verified: Node.js ${major(process.version)}, npm ${major(npm.stdout)}.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
