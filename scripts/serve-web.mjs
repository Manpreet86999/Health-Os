import http from 'node:http';
import { desktopRoute } from './desktop-updater.mjs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static files only. Supabase owns records and jobs; personal workers provide optional compute.
const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const port = Number(process.env.PORT || 10000);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.vrm': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp4':'video/mp4', '.webm':'video/webm' };
await stat(path.join(root, 'index.html')).catch(() => { throw new Error('Build the web app first: npm run build'); });
export const server = http.createServer(async (req, res) => {
  try {
    if (await desktopRoute(req, res, port)) return;
    if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) { res.writeHead(410, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Health OS uses Supabase cloud services. Refresh the web app.' })); return; }
    let filename = path.resolve(root, '.' + pathname);
    if (filename !== path.resolve(root) && !filename.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    try { if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html'); }
    catch { if (path.extname(pathname)) { res.writeHead(404).end(); return; } filename = path.join(root, 'index.html'); }
    const data = await readFile(filename);
    if(/\.(mp4|webm)$/.test(filename)&&req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start=match?.[1]?Number(match[1]):Math.max(0,data.length-Number(match?.[2]));
      const end=match?.[1]&&match[2]?Math.min(data.length-1,Number(match[2])):data.length-1;
      if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||start<0||start>=data.length||end<start){res.writeHead(416,{'Content-Range':`bytes */${data.length}`}).end();return;}
      res.writeHead(206,{'Content-Type':mime[path.extname(filename)],'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));return;
    }
    const hashed=pathname.startsWith('/assets/')&&/-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2)$/.test(pathname);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(400).end('Unable to load this file.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Health OS web: http://localhost:${port} · Supabase cloud services`));
