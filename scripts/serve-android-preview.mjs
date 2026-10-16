import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/android-011/',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
await stat(path.join(root,'index.html'));
http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
 const content=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
}catch{res.writeHead(404).end();}}).listen(10002,'127.0.0.1',()=>console.log('Isolated Android interface preview: http://127.0.0.1:10002'));
