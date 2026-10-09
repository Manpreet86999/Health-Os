import { releaseConfig as config } from './release-config.js';

export function isNewer(remote, local) {
  const parse = value => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  const r = parse(remote), l = parse(local);
  if (!r || !l) return false;
  for (let i = 1; i <= 3; i++) { if (Number(r[i]) !== Number(l[i])) return Number(r[i]) > Number(l[i]); }
  return false;
}
export function releaseAsset(release, android = false) {
  if (!release || release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return null;
  const name = android ? `Health-OS-${release.tag_name}.apk` : `Health-OS-Setup-${release.tag_name}.exe`;
  const expected = `https://github.com/${config.repo}/releases/download/${release.tag_name}/${name}`;
  return release.assets?.find(asset => asset.name === name && asset.browser_download_url === expected && asset.size > 0) || null;
}

const features = [
  ['Today', 'Your day, beautifully connected.', 'Check your readiness, see your priorities, log the little things and pick up a workout exactly where you left it.', 'Readiness · quick logs · daily priorities', '#197a65', '◎'],
  ['Train', 'Make every session count.', 'Plan your week, follow exercise guides, log sets and weights, take timed rests and review your workout history.', 'Planner · workout tracker · exercise library', '#d06432', '↗'],
  ['Eat', 'Nourishment with a little clarity.', 'Log meals, protein and hydration. Build recipes, explore your food library and see how nutrition supports your goals.', 'Food diary · recipes · water · targets', '#b08219', '◒'],
  ['Recover', 'Listen before you push.', 'Track sleep, soreness, stress and energy. Bring those signals together to help choose a sustainable training day.', 'Sleep · readiness · recovery trends', '#7964b0', '☾'],
  ['Health', 'A home for your health records.', 'Keep symptoms, appointments, measurements and documents together. Review extracted information before you save it.', 'Timeline · check-ins · appointments · records', '#cb577c', '♡'],
  ['Body', 'See the bigger picture.', 'Follow body measurements, your goals and changes over time with visual views of your progress.', 'Measurements · body views · progress', '#3c87aa', '◈'],
  ['Care', 'Small rituals. Steady care.', 'Build a personal routine, organise your products, set care goals and check in on what is working for you.', 'Routines · product shelf · care calendar', '#9c6345', '✿'],
  ['Insights', 'Turn your records into perspective.', 'Explore trends, weekly reviews and reports across your health workspace. AI coaching needs your own configured provider.', 'Trends · weekly review · report studio', '#6655a5', '✧'],
  ['Pods', 'Keep showing up, together.', 'Create a Pod, invite someone you trust, review join requests and track shared goals. Share completions only when you choose.', 'Invitations · shared goals · weekly progress', '#24806a', '∞'],
  ['Automations', 'A gentle nudge at the right time.', 'Set rules, reminders and report preferences. Notifications require permission; some tasks need a connected personal worker.', 'Rules · reminders · scheduled reports', '#b65c35', '⌁'],
  ['Your workspace', 'Yours, across your devices.', 'Sign in to your own account, sync your records, change appearance and export a backup. Cloud features need an internet connection.', 'Account · sync · settings · backup export', '#44809c', '⤴'],
];

let welcome, update, pendingRelease, checking = false, previousFocus;
const seenKey = 'health-os-welcome-version';
const storage = { get: key => { try { return localStorage.getItem(key); } catch { return null; } }, set: (key, value) => { try { localStorage.setItem(key, value); } catch {} } };
const android = () => window.Capacitor?.getPlatform?.() === 'android' || /Android/i.test(navigator.userAgent);
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const button = (text, cls, action) => { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', action); return node; };
function dialog(label) {
  previousFocus = document.activeElement;
  const node = el('dialog', 'hos-release'); node.setAttribute('aria-label', label);
  document.body.append(node);
  node.addEventListener('close', () => { node.remove(); previousFocus?.isConnected && previousFocus.focus(); });
  return node;
}
function closeWelcome() {
  storage.set(seenKey, config.version); welcome?.close(); welcome = null;
  if (pendingRelease) { const next = pendingRelease; pendingRelease = null; showUpdate(next); }
}
function constellation() {
  const art = el('div', 'hos-constellation'); art.setAttribute('aria-hidden', 'true');
  const ring = el('div', 'hos-orbit'); art.append(ring);
  const logo = el('div', 'hos-art-logo'); const img = el('img'); img.src = '/health-os-mark.svg'; img.alt = ''; logo.append(img); art.append(logo);
  [['MOVE', '↗'], ['NOURISH', '◒'], ['REST', '☾'], ['CONNECT', '♡']].forEach(([name, icon], i) => {
    const bubble = el('div', `hos-bubble hos-bubble-${i}`); bubble.append(el('span', '', icon), el('small', '', name)); art.append(bubble);
  }); return art;
}
function brandLine(copy) { const node = el('div', 'hos-topline'); node.append(el('span', 'hos-dot'), el('span', '', 'HEALTH OS'), el('span', 'hos-version', copy)); return node; }

export function showWelcome() {
  if (welcome?.open) return;
  welcome = dialog('Health Os is here'); const node = welcome;
  node.addEventListener('cancel', event => { event.preventDefault(); closeWelcome(); });
  const left = el('div', 'hos-art'); left.append(brandLine(`v${config.version}`), constellation(), el('p', 'hos-art-caption', 'A little more balance.\nA whole lot more you.'));
  const right = el('div', 'hos-copy');
  const close = button('×', 'hos-close', closeWelcome); close.setAttribute('aria-label', 'Close welcome tour'); right.append(close);
  right.append(el('span', 'hos-eyebrow', 'YOUR NEXT CHAPTER STARTS HERE'), el('h1', 'hos-title', 'Health Os is here'), el('p', 'hos-intro', 'One beautiful home for your training, nourishment, recovery and everyday health.'));
  const tabs = el('div', 'hos-feature-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Explore Health OS features');
  const detail = el('section', 'hos-feature-detail'); detail.id = 'hos-feature-detail'; detail.setAttribute('role', 'tabpanel'); detail.tabIndex = 0;
  let selected = 0; const tabButtons = [];
  function select(index) {
    selected = index; const [name, title, description, tools, color, icon] = features[index];
    detail.style.setProperty('--feature-color', color); detail.setAttribute('aria-labelledby', `hos-tab-${index}`); detail.replaceChildren();
    const heading = el('div', 'hos-feature-heading'); heading.append(el('span', 'hos-feature-icon', icon), el('h2', '', title)); detail.append(heading, el('p', '', description), el('small', '', tools));
    tabButtons.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    count.textContent = `${index + 1} / ${features.length}`; next.textContent = index === features.length - 1 ? 'Enter Health OS →' : 'Next feature →';
  }
  features.forEach(([name, , , , color, icon], i) => {
    const tab = button(`${icon}  ${name}`, 'hos-feature-tab', () => select(i)); tab.id = `hos-tab-${i}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', detail.id); tab.style.setProperty('--feature-color', color);
    tab.addEventListener('keydown', event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (delta) { event.preventDefault(); const index = (selected + delta + features.length) % features.length; select(index); tabButtons[index].focus(); } });
    tabs.append(tab); tabButtons.push(tab);
  });
  const footer = el('div', 'hos-footer'); const count = el('span', 'hos-count'); const next = button('Next feature →', 'hos-primary', () => selected === features.length - 1 ? closeWelcome() : select(selected + 1));
  footer.append(button('Start exploring', 'hos-secondary', closeWelcome), count, next);
  right.append(tabs, detail, footer, el('p', 'hos-footnote', 'Your account. Your pace. Your health story.'));
  node.append(left, right); select(0); node.showModal();
}

export function showUpdate(release, preview = false) {
  if (welcome?.open) { pendingRelease = release; return; }
  if (update?.open) return;
  const asset = releaseAsset(release, android()); if (!asset) return;
  const node = dialog(`Health OS ${release.tag_name} update available`); update = node;
  const defer = () => { node.close(); update = null; storage.set('health-os-update-deferred', JSON.stringify({ version: release.tag_name, until: Date.now() + 24 * 60 * 60 * 1000 })); };
  node.addEventListener('cancel', event => { event.preventDefault(); defer(); });
  const art = el('div', 'hos-art hos-update-art'); art.append(brandLine(release.tag_name), constellation(), el('p', 'hos-art-caption', 'Fresh possibilities.\nSame personal journey.'));
  const copy = el('div', 'hos-copy'); const close = button('×', 'hos-close', defer); close.setAttribute('aria-label', 'Close update dialog'); copy.append(close, el('span', 'hos-eyebrow', 'SOMETHING NEW IS READY'), el('h1', 'hos-title', 'A fresh start.\nAn even better OS.'), el('p', 'hos-intro', `Health OS ${release.tag_name} is available. You’re using v${config.version}.`));
  const notes = el('div', 'hos-release-notes'); notes.append(el('h2', '', 'What’s new'), el('p', '', release.body || 'See the release page for the changes in this version.')); copy.append(notes);
  const status = el('p', 'hos-install-status'); status.setAttribute('role', 'status');
  const install = button(android() ? 'Download Android update ↗' : 'Download & install →', 'hos-primary', async () => {
    if (preview) { status.textContent = 'This is a preview. No update will be downloaded or installed.'; return; }
    install.disabled = true; status.textContent = 'Preparing your update…';
    try {
      let capability = null;
      if (!android() && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
        const response = await fetch('/health-os-desktop', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) capability = await response.json();
      }
      if (capability?.canInstall) {
        status.textContent = 'Downloading and verifying your installer…';
        const response = await fetch('/health-os-desktop/install', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Health-OS-Token': capability.token }, body: JSON.stringify({ tag: release.tag_name }), signal: AbortSignal.timeout(600000) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to start the installer.');
        status.textContent = 'Installer opened. Choose your installation folder, then reopen Health OS when it finishes.';
      } else {
        const link = el('a'); link.href = asset.browser_download_url; link.rel = 'noopener noreferrer'; link.target = '_blank'; document.body.append(link); link.click(); link.remove();
        status.textContent = android() ? 'Open the downloaded APK. Android will ask you to approve installation.' : 'Open the downloaded installer and choose where to install Health OS.';
      }
    } catch (error) { status.textContent = `${error.message} You can download from the release page below.`; }
    finally { install.disabled = false; }
  });
  const footer = el('div', 'hos-footer'); footer.append(button('Later', 'hos-secondary', defer), install); copy.append(status, footer);
  const link = el('a', 'hos-footnote', 'View this release on GitHub ↗'); link.href = `https://github.com/${config.repo}/releases/tag/${release.tag_name}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; copy.append(link, el('p', 'hos-footnote', android() ? 'Android controls installation approval. Your existing account and records stay in place.' : 'The installer asks for your folder every time. Your cloud account and browser records stay in place.'));
  node.append(art, copy); node.showModal();
}

export async function checkForUpdates(manual = false) {
  if (checking) return; checking = true;
  try {
    const response = await fetch(`https://api.github.com/repos/${config.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.status === 404) { if (manual) report('No public releases are available yet.'); return; }
    if (!response.ok) throw new Error('Unable to check for updates. Please try again later.');
    const release = await response.json();
    if (!releaseAsset(release, android()) || !isNewer(release.tag_name, config.version)) { if (manual) report(`You’re up to date · v${config.version}`); return; }
    let deferred; try { deferred = JSON.parse(storage.get('health-os-update-deferred')); } catch {}
    if (!manual && deferred?.version === release.tag_name && deferred.until > Date.now()) return;
    showUpdate(release);
  } catch (error) { if (manual) report(error.message); }
  finally { checking = false; }
}
function report(message) { window.dispatchEvent(new CustomEvent('health-os-update-status', { detail: message })); }
if (typeof window !== 'undefined') {
  window.addEventListener('health-os-show-welcome', showWelcome);
  window.addEventListener('health-os-check-updates', () => void checkForUpdates(true));
  const start = () => {
    const preview = new URLSearchParams(location.search).get('health-os-preview');
    if (preview === 'welcome') { showWelcome(); return; }
    if (preview === 'update') { const tag = 'v0.1.1', name = android() ? `Health-OS-${tag}.apk` : `Health-OS-Setup-${tag}.exe`; showUpdate({ tag_name: tag, body: 'A brighter daily experience.\nFaster workspace loading and thoughtful improvements across training, nutrition and recovery.', assets: [{ name, size: 1, browser_download_url: `https://github.com/${config.repo}/releases/download/${tag}/${name}` }] }, true); return; }
    if (storage.get(seenKey) !== config.version) showWelcome();
    window.setTimeout(() => void checkForUpdates(), 4000);
    window.setInterval(() => void checkForUpdates(), 30 * 60 * 1000);
    let lastFocus = Date.now(); window.addEventListener('focus', () => { if (Date.now() - lastFocus > 5 * 60 * 1000) { lastFocus = Date.now(); void checkForUpdates(); } });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
