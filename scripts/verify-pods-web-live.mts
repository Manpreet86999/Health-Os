import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createPodsService, PodRequestError } from '../src/client/lib/pods-domain-service';
import { DEFAULT_SUPABASE_CONFIG } from '../src/shared/supabase-project';
const config = DEFAULT_SUPABASE_CONFIG;
let discovery: { status: number; code?: string } | undefined;
// Public-key metadata probe only. No session tokens, personal-data reads, or writes.
const service = createPodsService({ scope: () => `${config.url}:read-only-discovery`, userId: () => undefined, request: async path => {
  if (path !== 'rpc/health_os_pod_capabilities') throw new Error('Only capability discovery is permitted by this probe.');
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.publishableKey }, signal: AbortSignal.timeout(20000) });
  const result = await response.json(); discovery = { status: response.status, code: result?.code };
  if (!response.ok) throw new PodRequestError(result?.message || 'Discovery unavailable', response.status, result?.code);
  return result;
} });
const capabilities = await service.capabilities();
const installed = await fs.readFile('../dist/client/index.html');
const built = await fs.readFile('dist/client/index.html');
const hash = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
let runningApp: { status?: number; matchesInstalled?: boolean; unavailable?: boolean };
try { const response = await fetch('http://localhost:10000/', { signal: AbortSignal.timeout(5000) }); runningApp = { status: response.status, matchesInstalled: hash(Buffer.from(await response.arrayBuffer())) === hash(installed) }; }
catch { runningApp = { unavailable: true }; }
const report = { checkedAt: new Date().toISOString(), project: new URL(config.url).hostname.split('.')[0], readOnly: true, discovery, capabilities, installedIndexMatchesBuild: hash(installed) === hash(built), runningApp, migrationSha256: hash(await fs.readFile('supabase/migrations/20261011160711_friend_pods_partnership.sql')), limitations: ['Capability discovery does not verify the signed-in user journey; end-to-end browser writes use fixtures.'] };
await fs.mkdir('output/friend-pods', { recursive: true }); await fs.writeFile('output/friend-pods/live-discovery.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
