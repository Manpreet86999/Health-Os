/** Keep loopback aliases from creating separate accounts, caches and installed apps. */
export async function useCanonicalOrigin() {
  if (location.hostname !== '127.0.0.1' || location.port !== '10000' || location.protocol !== 'http:') return false;
  const target = 'http://localhost:10000';
  let session: string | null = null;
  try { session = localStorage.getItem('body-os-supabase-session-v1'); } catch { /* Continue to the canonical sign-in screen if browser storage is disabled. */ }
  if (session) {
    // Transfer only to this app on the other loopback alias. Tokens never enter a URL.
    await new Promise<void>(resolve => {
      const frame = document.createElement('iframe');
      frame.hidden = true; frame.src = `${target}/session-bridge.html`;
      const finish = () => { clearTimeout(timer); window.removeEventListener('message', received); frame.remove(); resolve(); };
      const received = (event: MessageEvent) => {
        if (event.origin === target && event.source === frame.contentWindow && event.data?.type === 'health-os-session-carried') { localStorage.removeItem('body-os-supabase-session-v1'); finish(); }
      };
      const timer = setTimeout(finish, 4000);
      window.addEventListener('message', received);
      frame.onload = () => frame.contentWindow?.postMessage({ type: 'health-os-carry-session', session }, target);
      document.body.append(frame);
    });
  }
  location.replace(`${target}${location.pathname}${location.search}${location.hash}`);
  return true;
}
