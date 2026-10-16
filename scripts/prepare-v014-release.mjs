import {readFile,writeFile,mkdir} from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.version='0.1.4';
pkg.scripts['build:apk']='powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-android-011.ps1 -VersionCode 2026101502 -VersionName 0.1.4 -SideBySide';
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(await readFile('package-lock.json','utf8'));lock.version='0.1.4';lock.packages[''].version='0.1.4';await writeFile('package-lock.json',JSON.stringify(lock,null,2)+'\n');
await writeFile('VERSION.txt','Health OS v0.1.4\nWeb and Android release — supplied directly; not published to GitHub.\n');
await mkdir('outputs/releases/health-os-v0.1.4/evidence',{recursive:true});
console.log('Release metadata prepared: 0.1.4 / 2026101502. No model or backend configuration changes.');
