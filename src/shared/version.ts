/** App version string used for update checks (keep in sync with package.json). */
export const APP_VERSION = '0.1.0';

/** Normalize tags like "v2.2.0" → "2.2.0" */
export function normalizeVersion(v: string): string {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+\-]/)[0];
}

/** True if remote is strictly newer than local (semver major.minor.patch). */
export function isRemoteNewer(remote: string, local: string): boolean {
  const r = normalizeVersion(remote)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const l = normalizeVersion(local)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}
