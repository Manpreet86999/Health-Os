import type { CloudConfig } from '../../shared/cloud';

/** Live notifications wake durable sync; acknowledgements and stored cursors remain authoritative. */
export function subscribeToCloudChanges(
  config: CloudConfig, accessToken: string, userId: string, onChange: () => void,
  tables: string[] = ['body_os_records'], freshToken?: () => Promise<string>,
) {
  let socket: WebSocket | null = null, closed = false, connecting = false, ref = 0, attempts = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatRef: string | undefined;
  const clearConnectionTimers = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (joinTimer) clearTimeout(joinTimer);
    heartbeat = undefined; joinTimer = undefined; heartbeatRef = undefined;
  };
  const disconnect = () => {
    const previous = socket; socket = null;
    clearConnectionTimers(); previous?.close();
  };
  const wake = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = undefined; if (!closed) onChange(); }, 400);
  };
  const schedule = () => {
    if (closed || retry) return;
    retry = setTimeout(() => { retry = undefined; void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
  };
  const connect = async () => {
    if (closed || connecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    connecting = true;
    try {
      const token = freshToken ? await freshToken() : accessToken;
      if (closed) return;
      const base = config.url.replace(/^http/i, 'ws').replace(/\/+$/, '');
      const current = new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(config.publishableKey)}&vsn=1.0.0`);
      socket = current;
      const joinRef = String(++ref);
      // A socket can stay CONNECTING or OPEN forever after a radio change.
      joinTimer = setTimeout(() => { if (socket === current) { disconnect(); schedule(); } }, 15_000);
      current.onopen = () => {
        if (closed || socket !== current) return current.close();
        current.send(JSON.stringify({ topic: 'realtime:health-os-records', event: 'phx_join', ref: joinRef, join_ref: joinRef,
          payload: { access_token: token, config: { broadcast: { ack: false, self: false }, presence: { key: '' },
            postgres_changes: tables.map(table => ({ event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` })),
          } },
        }));
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (socket !== current || closed) return;
          if (heartbeatRef) { disconnect(); schedule(); return; }
          if (current.readyState === WebSocket.OPEN) {
            heartbeatRef = String(++ref);
            current.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: heartbeatRef }));
          }
        }, 25_000);
      };
      current.onmessage = event => {
        if (closed || socket !== current) return;
        try {
          const message = JSON.parse(String(event.data));
          if (message.event === 'phx_reply' && message.ref === heartbeatRef) heartbeatRef = undefined;
          if (message.event === 'postgres_changes') wake();
          if (message.event === 'phx_reply' && message.ref === joinRef) {
            if (message.payload?.status === 'ok') {
              if (joinTimer) clearTimeout(joinTimer);
              joinTimer = undefined; attempts = 0; wake();
            }
            else current.close();
          }
          if (message.event === 'phx_error' || message.event === 'phx_close') current.close();
        } catch { /* Malformed live messages never change records or cursors. */ }
      };
      current.onclose = () => {
        if (socket !== current) return;
        socket = null;
        clearConnectionTimers();
        schedule();
      };
      current.onerror = () => current.close();
    } catch { schedule(); }
    finally { connecting = false; }
  };
  const resume = () => {
    if (closed || document.visibilityState !== 'visible') return;
    // Rejoin with a fresh session rather than trusting a suspended connection.
    if (retry) clearTimeout(retry);
    retry = undefined; disconnect(); void connect(); wake();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') resume(); };
  const onOnline = resume;
  // Durable reads repair missed messages. They do not acknowledge any writes.
  const fallback = setInterval(() => {
    if (!closed && document.visibilityState === 'visible' && navigator.onLine !== false) { void connect(); wake(); }
  }, 30_000);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', resume);
  window.addEventListener('health-os-resume', resume);
  document.addEventListener('visibilitychange', onVisible);
  void connect();
  return () => {
    closed = true;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', resume);
    window.removeEventListener('health-os-resume', resume);
    document.removeEventListener('visibilitychange', onVisible);
    if (retry) clearTimeout(retry);
    clearInterval(fallback);
    clearConnectionTimers();
    if (debounceTimer) clearTimeout(debounceTimer);
    disconnect();
  };
}
