import test from 'node:test';
import assert from 'node:assert/strict';
process.env.HEALTH_OS_INSTALLED = '1';
const { desktopRoute } = await import('./desktop-updater.mjs');
const port=10999;
const {releaseConfig}=await import('../src/client/public/release-config.js');
const parts=releaseConfig.version.split('.').map(Number),nextTag='v'+[parts[0],parts[1],parts[2]+1].join('.');
async function request(url, method='GET', headers={}, body='') {
  const req={url,method,headers:{host:`127.0.0.1:${port}`,...headers},async *[Symbol.asyncIterator](){yield Buffer.from(body)}};
  const res={status:0,value:null,writeHead(status){this.status=status;return this},end(value){this.value=JSON.parse(value);return this}};
  await desktopRoute(req,res,port);return res;
}
test('updater accepts only the local host, matching origin and session token',async()=>{
  assert.equal((await request('/health-os-desktop','GET',{host:'evil.example'})).status,403);
  const info=await request('/health-os-desktop');assert.equal(info.value.canInstall,true);
  for(const headers of [{origin:'https://evil.example'},{origin:`http://127.0.0.1:${port}`,'x-health-os-token':'invalid'}])assert.equal((await request('/health-os-desktop/install','POST',headers,'{}')).status,403);
});
test('corrupt installer bytes and stale versions cannot start an installer',async(t)=>{
  const info=await request('/health-os-desktop'),tag=nextTag,name=`Health-OS-Setup-${tag}.exe`,prefix=`https://github.com/Manpreet86999/Health-Os/releases/download/${tag}/`;
  let remoteTag=tag;
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).endsWith('/releases/latest'))return Response.json({tag_name:remoteTag,assets:[{name,size:20,browser_download_url:prefix+name},{name:'SHA256SUMS.txt',browser_download_url:prefix+'SHA256SUMS.txt'}]});
    if(String(url).endsWith('SHA256SUMS.txt'))return new Response('0'.repeat(64)+'  '+name+'\n');
    if(String(url).endsWith('.exe'))return new Response(Buffer.alloc(20,1));
    throw new Error('Unexpected host');
  });
  const headers={origin:`http://127.0.0.1:${port}`,'x-health-os-token':info.value.token};
  const corrupt=await request('/health-os-desktop/install','POST',headers,JSON.stringify({tag}));assert.equal(corrupt.status,400);assert.match(corrupt.value.error,/checksum verification failed/);
  remoteTag='v'+releaseConfig.version;const stale=await request('/health-os-desktop/install','POST',headers,JSON.stringify({tag:remoteTag}));assert.equal(stale.status,400);assert.match(stale.value.error,/not a newer/);
});
