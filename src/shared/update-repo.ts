/** Retired Express desktop updater. Current releases use public/release-config.js and scripts/desktop-updater.mjs. */
export const GITHUB_UPDATES_REPO: string = '';
export const GITHUB_UPDATES_ENABLED = Boolean(GITHUB_UPDATES_REPO);
export const UPDATES_DISCONNECTED_MESSAGE = 'GitHub updates are disconnected. Health OS will not check for, download, or install repository updates.';

export const GITHUB_UPDATES_URL = GITHUB_UPDATES_REPO ? `https://github.com/${GITHUB_UPDATES_REPO}` : '';

/** Normalize owner/repo or full GitHub URL → owner/repo */
export function toOwnerRepo(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}
