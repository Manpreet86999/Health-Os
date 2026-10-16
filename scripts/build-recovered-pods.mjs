import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Bundle the entire dependency graph; stripping TypeScript imports cannot do this safely. */
export async function buildRecoveredPods() {
  const result = await build({
    stdin: { contents: `export { TodayPodsCard } from './src/client/components/TodayPodsCard'; export { friendPods } from './src/client/lib/pods-service'; export { capturePodInvite } from './src/client/lib/pod-invitation';`, resolveDir: repository, loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'HealthOSRecoveredPods', target: 'es2022', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    plugins: [{ name: 'recovered-pods-platform', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'recovered-pods' }));
      builder.onResolve({ filter: /(?:^|\/)cloud-session$/ }, () => ({ path: 'session', namespace: 'recovered-pods' }));
      builder.onLoad({ filter: /.*/, namespace: 'recovered-pods' }, args => args.path === 'react' ? { contents: `const React=globalThis.__HEOS_PODS_REACT__; export const {createElement,Fragment,useState,useEffect,useRef,useCallback,useMemo}=React;`, loader: 'js' } : { contents: `export const activeSession=()=>globalThis.__HEOS_PODS_ACTIVE_SESSION__(); export function storedSession(){try{return JSON.parse(localStorage.getItem('body-os-supabase-session-v1')||'null');}catch{return null;}}`, loader: 'js' });
      builder.onLoad({ filter: /pods-workspace\.css$/ }, () => ({ contents: '', loader: 'js' }));
    } }],
  });
  const code = result.outputFiles[0].text;
  for (const symbol of ['PodsExperience','useFriendPods','createPodsService','pendingPodInvite','PodGoalForm','PodDialog']) if (!code.includes(symbol)) throw new Error(`Recovered Pods dependency missing: ${symbol}`);
  return code;
}
