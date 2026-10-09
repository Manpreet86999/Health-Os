import type { SupabaseAccountSession } from '../../shared/supabase-auth';

const bucket = 'health-os-private';
export type PhotoAsset = { mime: string; name: string; size: number; sha256: string };
const headers = (session: SupabaseAccountSession) => ({ apikey: session.config.publishableKey, Authorization: `Bearer ${session.accessToken}` });
export async function uploadPhoto(session: SupabaseAccountSession, dataUrl: string): Promise<PhotoAsset> {
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 3000000) throw new Error('Choose a JPEG, PNG, or WebP photo smaller than 2 MB.');
  const blob = await (await fetch(dataUrl)).blob();
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  const response = await fetch(`${session.config.url}/storage/v1/object/${bucket}/${session.uid}/${sha256}`, { method: 'POST', headers: { ...headers(session), 'Content-Type': blob.type, 'x-upsert': 'false' }, body: blob, signal: AbortSignal.timeout(30000) });
  if (!response.ok && response.status !== 409) throw new Error('Private photo upload failed. Your existing photos are unchanged.');
  return { mime: blob.type, name: `photo.${blob.type.split('/')[1]}`, size: blob.size, sha256 };
}
export async function photoUrls(session: SupabaseAccountSession, photos: Record<string, any>[]) {
  const paths = [...new Set(photos.map(photo => photo.preview?.sha256).filter(hash => /^[a-f0-9]{64}$/.test(hash)).map(hash => `${session.uid}/${hash}`))];
  const signed = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const response = await fetch(`${session.config.url}/storage/v1/object/sign/${bucket}`, { method: 'POST', headers: { ...headers(session), 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: paths.slice(i, i + 100), expiresIn: 900 }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not open your private photos. Refresh and try again.');
    for (const item of await response.json()) {
      const value = item.signedURL || item.signedUrl;
      if (value && paths.includes(item.path)) signed.set(item.path, new URL(value.startsWith('/object/') ? `/storage/v1${value}` : value, session.config.url).href);
    }
  }
  return photos.map(photo => ({ ...photo, dataUrl: photo.dataUrl || signed.get(`${session.uid}/${photo.preview?.sha256}`) || '', unavailable: !photo.dataUrl && !signed.has(`${session.uid}/${photo.preview?.sha256}`) }));
}
