import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/extract-original-android.ps1')],{cwd:root,stdio:'pipe',windowsHide:true});
const reference=path.join(root,'output/android-original-ui/reference'),output=path.join(root,'dist/android-original-ui');
fs.mkdirSync(output,{recursive:true});fs.cpSync(reference,output,{recursive:true});
const releaseVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const releaseConfig=fs.readFileSync(path.join(root,'src/client/public/release-config.js'),'utf8');
const buildCode=Number(process.env.HEALTH_OS_ANDROID_BUILD||/androidVersionCode:\s*(\d+)/.exec(releaseConfig)?.[1]);
if(!Number.isSafeInteger(buildCode)||buildCode<=2026101304)throw new Error('Use a newer Android build code');
fs.writeFileSync(path.join(output,'index.html'),fs.readFileSync(path.join(reference,'index.html'),'utf8').replace('window.__HEALTH_OS_ANDROID_BUILD__=2026101304;','window.__HEALTH_OS_ANDROID_BUILD__='+buildCode+';').replace('window.__HEALTH_OS_ANDROID_VERSION__="1.4";','window.__HEALTH_OS_ANDROID_VERSION__='+JSON.stringify(releaseVersion)+';'));
fs.writeFileSync(path.join(output,'release-config.js'),releaseConfig.replace(/androidVersionCode:\s*\d+/,'androidVersionCode:'+buildCode));
const helper=await build({entryPoints:[path.join(root,'src/android-retained/compat.tsx')],bundle:true,write:false,format:'iife',globalName:'HealthOSRetained',platform:'browser',target:'es2022',minify:true,jsxFactory:'React.createElement',jsxFragment:'React.Fragment',define:{'process.env.NODE_ENV':'"production"'}});
const bundleName='assets/ux-system-BimZHOq_.js',original=fs.readFileSync(path.join(reference,bundleName),'utf8');
const ast=ts.createSourceFile(bundleName,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[],changes=[];
function fn(name){const found=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(found.length!==1)throw new Error(`Expected one original ${name} function`);return found[0];}
function replaceFn(name,code){const node=fn(name);edits.push([node.getStart(ast),node.end,code]);changes.push(`function:${name}`);}
function replaceVar(name,code){const found=ast.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).filter(n=>n.name.getText(ast)===name);if(found.length!==1||!found[0].initializer)throw new Error(`Expected one original ${name} value`);edits.push([found[0].initializer.getStart(ast),found[0].initializer.end,code]);changes.push(`value:${name}`);}
function exact(text,before,after){if(text.split(before).length!==2)throw new Error(`Original patch anchor changed: ${before}`);return text.replace(before,after);}
replaceVar('Wa','HealthOSRetained.sections');replaceVar('Qt','HealthOSRetained.navigation');
replaceVar('kh','HealthOSRetained.sections.map(s=>({label:s.name,page:s.home,icon:s.name}))');
replaceVar('st','HealthOSRetained.actionDefinitions');replaceVar('ls','HealthOSRetained.mcpVersion');
// The old bundle appended retired Health/Pods destinations after its base registry.
for(const node of ast.statements.filter(ts.isExpressionStatement)){if(/^Qt\.[A-Za-z]+\.push\(/.test(node.getText(ast))){edits.push([node.getStart(ast),node.end,'']);changes.push('remove-retired-route-extension');}}
for(const [name,exported]of Object.entries({Ua:'canonicalRoute',ns:'locationFor',Ui:'routeHref',yu:'readRoute',Ei:'nutrition',va:'daySeries',sm:'describeMcpCapabilities',vi:'executeHealthAction'}))replaceFn(name,`function ${name}(...args){return HealthOSRetained.${exported}(...args)}`);
let snapshot=fn('Su').getText(ast);
snapshot=exact(snapshot,'const e=ut(),t=Ga(),','const e=ut(),t=Ga(),__hosCloud=Qe(),__hosDateKey="health-os-date:"+__hosCloud.savedConfig?.url+":"+__hosCloud.user?.id,');
snapshot=exact(snapshot,'[a,n]=y.useState(()=>Z(new Date().toISOString()))','[a,__hosSelect]=y.useState(()=>HealthOSRetained.savedDate(__hosDateKey,Z(new Date().toISOString()))),n=value=>{sessionStorage.setItem(__hosDateKey,value);__hosSelect(value)}');
replaceFn('Su',snapshot);
let bottom=fn('Sh').getText(ast);
bottom=exact(bottom,'l=t==="Pods"&&e==="Today"?"Pods":e==="Reports"?"Reports":e==="Research"?"Research":["Targets","Habits","Nudges"].includes(e)?"Organization":o','l=o');replaceFn('Sh',bottom);
let modules=fn('jh').getText(ast);modules=exact(modules,'["Today","Intelligence","Settings","Search"]','["Search"]');replaceFn('jh',modules);
replaceFn('hh','function hh(){return i.jsx(HealthOSRetained.QuickLog,{})}');
replaceFn('eh','function eh(){return i.jsx(HealthOSRetained.CommandCenter,{})}');
// Keep the original Today cards, replacing only links to removed pages.
let today=fn('rf').getText(ast);
today=exact(today,'a.setPage("Health","Heart")','a.setPage("Insights","Trends")');
today=exact(today,'a.setPage("Health","Connected Sources")','a.setPage("Settings","Connections")');
today=today.replaceAll('a.setPage("Timeline")','a.setPage("Recover","Readiness History")');
const todayNode=fn('rf'),pods=[];
function findPods(node){if(ts.isCallExpression(node)&&node.arguments[0]?.getText(ast)==='af')pods.push(node);ts.forEachChild(node,findPods);}findPods(todayNode);
if(pods.length!==1)throw new Error('Original Today Pods attachment changed');
today=exact(today,pods[0].getText(ast),'null');
replaceFn('rf',today);
let shell=fn('Xf').getText(ast);
shell=exact(shell,'Recover:R==="Cardio"?','Recover:R==="Nutrition Totals"?i.jsx(HealthOSRetained.NutritionTotals,{}):R==="Cardio"?');
shell=exact(shell,'children:[i.jsx("a",{className:"stitch-skip-link"','children:[i.jsx(HealthOSRetained.ReportGates,{}),i.jsx("a",{className:"stitch-skip-link"');
shell=exact(shell,'Reports:R==="Workout Reports"?i.jsx(Rf,{}):i.jsx(kf,{})','Reports:i.jsx(HealthOSRetained.Reports,{})');
replaceFn('Xf',shell);
let reportRoute=fn('lu').getText(ast);
reportRoute=exact(reportRoute,'$==="activate"?(await l.save("workspaceState",{activeWeekId:N.id},"workspace-state"),oe({ok:!0}))','$==="activate"?(HealthOSRetained.weekNeedsGoals(N)?(await l.save("week",{...N,activateAfterGoals:true},N.id),oe({ok:true,goalsRequired:true})):(await l.save("workspaceState",{activeWeekId:N.id},"workspace-state"),oe({ok:true})))');
reportRoute=exact(reportRoute,'await l.save("workspaceState",{activeWeekId:A.id},"workspace-state"),oe({week:A})','!HealthOSRetained.weekNeedsGoals(A)&&await l.save("workspaceState",{activeWeekId:A.id},"workspace-state"),oe({week:A})');
replaceFn('lu',reportRoute);
replaceVar('Z','stamp=>HealthOSRetained.istDate(new Date(stamp))');
replaceFn('Ct','function Ct(date=new Date()){return HealthOSRetained.istDate(date)}');
let bridge=fn('ch').getText(ast);
bridge=exact(bridge,'f.current.foundation.registry.executeMcp(V.action,V.input,V.receiptId,{userId:j,idempotencyKey:V.receiptId,explicitlyRequested:!0,approved:!0})','HealthOSRetained.executeMcp(f.current.state,j,V)');
bridge=exact(bridge,'capabilities:Object.keys(st)','capabilities:HealthOSRetained.retainedActionIds()');replaceFn('ch',bridge);
let code=original;
for(const [start,end,replacement]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,start)+replacement+code.slice(end);
// Metadata and on-device tool lists use the same public catalog as the server.
code=code.replaceAll('Object.entries(st)','Object.entries(st).filter(([id])=>HealthOSRetained.isRetainedMcpAction(id))');
code=code.replaceAll('Object.keys(st)','HealthOSRetained.retainedActionIds()');
code=exact(code,'filter(j=>rh(j))','filter(j=>HealthOSRetained.cloudSupports(j))');
code=exact(code,'filter(j=>lc(j)==="DEVICE_REQUIRED")','filter(j=>HealthOSRetained.executionClass(j)==="DEVICE_REQUIRED")');
code=exact(code,' capabilities for nutrition, training, sleep, recovery, body, goals, habits, care and reports.',' capabilities for daily nutrition totals, training, sleep, recovery, body, goals, habits and reports.');
code=exact(code,'Online · 3.1','Online · 3.3');
const imports=ast.statements.filter(ts.isImportDeclaration),insertion=imports.at(-1).end;
code=code.slice(0,insertion)+'\n'+helper.outputFiles[0].text+'\n'+code.slice(insertion);
code+='\nHealthOSRetained.bindRuntime({react:y,jsx:i,useData:Ze,useQuick:Sa,Modal:xa,Icon:Me,useCloud:Qe,views:gu,invoke:ot});\n';
const check=ts.createSourceFile(bundleName,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(check.parseDiagnostics.length)throw new Error('Patched Android module has a syntax error');
fs.writeFileSync(path.join(output,bundleName),code);

// Remove only the retired settings destination. The original settings components and CSS remain.
const settingsName='assets/WebSettings-UgCqU6QM.js',settings=fs.readFileSync(path.join(reference,settingsName),'utf8'),settingsAst=ts.createSourceFile(settingsName,settings,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const settingsList=settingsAst.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(settingsAst)==='q'&&ts.isArrayLiteralExpression(n.initializer));
if(!settingsList)throw new Error('Original settings navigation was not found');
const retained=settingsList.initializer.elements.filter(n=>!n.getText(settingsAst).startsWith('{id:"Intelligence"'));
if(retained.length!==settingsList.initializer.elements.length-1)throw new Error('Retired settings destination changed');
const privacy='{id:"Privacy",label:"Privacy & Account",icon:$,group:"Workspace",description:"Account access and permissions.",keywords:"privacy permissions sign out"}';
let settingsCode=settings.slice(0,settingsList.initializer.getStart(settingsAst))+'['+retained.map(n=>n.getText(settingsAst).replace('label:"Data & account"','label:"Data & Backup"')).join(',')+','+privacy+']'+settings.slice(settingsList.initializer.end);
settingsCode=exact(settingsCode,'c==="Connections"&&e.jsxs(e.Fragment,{children:[','c==="Connections"&&e.jsxs(e.Fragment,{children:[e.jsx(__hosNativeHealthConnect,{}),');
settingsCode=exact(settingsCode,'c==="Data & account"&&','["Data & account","Privacy"].includes(c)&&');
settingsCode='import{HealthConnectPanel as __hosNativeHealthConnect}from"./BiologicalOS-B9bCo3dJ.js";\n'+settingsCode;
fs.writeFileSync(path.join(output,settingsName),settingsCode);
const biologicalName='assets/BiologicalOS-B9bCo3dJ.js';
fs.writeFileSync(path.join(output,biologicalName),fs.readFileSync(path.join(reference,biologicalName),'utf8')+'\nexport{ms as HealthConnectPanel};\n');
const workerName='assets/mcp-local-worker-CyIbGvQR.js';
const worker=await build({entryPoints:[path.join(root,'src/client/lib/mcp-local-worker.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
fs.writeFileSync(path.join(output,workerName),worker.outputFiles[0].text);

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const preserved=files(reference).filter(file=>!['index.html','release-config.js',bundleName,settingsName,biologicalName,workerName].includes(path.relative(reference,file).replaceAll('\\','/')));
for(const file of preserved){const relative=path.relative(reference,file);if(hash(file)!==hash(path.join(output,relative)))throw new Error(`An original asset changed: ${relative}`);}
const css=preserved.filter(file=>file.endsWith('.css')).map(file=>({file:path.relative(reference,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(path.join(root,'output/android-original-ui/preparation.json'),JSON.stringify({baseline:'outputs/android-hotfix/Health-OS-v1.4-fix.apk',baselineSha256:'6825d94790f92d9c429a9484425707fa86dc840bf7adec2e4b52c78c7b4f379f',buildCode,changedModules:[bundleName,settingsName,biologicalName,workerName],changedMetadata:['index.html','release-config.js'],changes,unchangedAssets:preserved.length,unchangedStylesheets:css,webFrontendChanged:false},null,2));
console.log(`Prepared original Android design: ${preserved.length} assets, including all ${css.length} stylesheets, preserved byte-for-byte.`);

