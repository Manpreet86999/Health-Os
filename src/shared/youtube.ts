/** Accept only actual YouTube URLs; never embed user-supplied HTML or arbitrary hosts. */
export function youtubeVideoId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    const host = url.hostname.toLowerCase();
    let id: string | null | undefined;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}
