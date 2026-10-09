import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, releaseAsset } from '../src/client/public/health-os-release.js';
test('stable semver orders numeric components and rejects prereleases and malformed tags', () => {
  for(const remote of ['v0.1.1','v0.2.0','v1.0.0','v0.10.0'])assert.equal(isNewer(remote,'0.1.0'),true);
  for(const remote of ['v0.1.0','v0.0.9','v0.1.1-beta','v0.1.1garbage','bogus'])assert.equal(isNewer(remote,'0.1.0'),false);
});
test('only the exact trusted release asset for the chosen platform is accepted', () => {
  const tag_name='v0.1.1', repo='https://github.com/Manpreet86999/Health-Os/releases/download/'+tag_name;
  const windows={name:'Health-OS-Setup-v0.1.1.exe',size:10,browser_download_url:repo+'/Health-OS-Setup-v0.1.1.exe'};
  const android={name:'Health-OS-v0.1.1.apk',size:10,browser_download_url:repo+'/Health-OS-v0.1.1.apk'};
  const release={tag_name,assets:[windows,android]};
  assert.equal(releaseAsset(release),windows);assert.equal(releaseAsset(release,true),android);
  assert.equal(releaseAsset({...release,prerelease:true}),null);assert.equal(releaseAsset({...release,draft:true}),null);
  assert.equal(releaseAsset({...release,assets:[{...windows,browser_download_url:'https://example.com/a.exe'}]}),null);
});
