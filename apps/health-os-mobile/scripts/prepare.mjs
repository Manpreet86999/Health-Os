import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reference = path.join(root, 'reference');
const releaseVersion = JSON.parse(fs.readFileSync(path.join(root, '../../package.json'), 'utf8')).version;
const expected = '8856365bbdbd2bbd295f0cfe136fc51bfe2265e68764bfee9842dd95b7e91fb3';
const apk = path.join(reference, 'Health-OS-5.2.0-2026100802.apk');
if (crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex') !== expected) throw new Error('Reference APK changed. Refusing to patch an unknown version.');
const www = path.join(root, 'www');
fs.mkdirSync(www, { recursive: true });
fs.cpSync(path.join(reference, 'public'), www, { recursive: true });
const gestures = ts.transpileModule(fs.readFileSync(path.join(root,'../../src/client/lib/mobile-interactions.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export function initializeMobileInteractions','function initializeMobileInteractions');
fs.writeFileSync(path.join(www,'health-os-native.js'),fs.readFileSync(path.join(root,'runtime/health-os-native.js'),'utf8')+'\n'+gestures);
const bundlePath = path.join(www, 'assets/ux-system-zE_LYOjW.js');
let bundle = fs.readFileSync(bundlePath, 'utf8');
const file = ts.createSourceFile('bundle.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const replacements = [];
const functionNode = name => {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (nodes.length !== 1) throw new Error(`Expected exactly one ${name} function.`);
  return nodes[0];
};
const init = functionNode('yp');
const completedSource=fs.readFileSync(path.join(root,'../../src/client/lib/completed-workout.ts'),'utf8');
const completedCode=ts.transpileModule(completedSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export function','function');
const appProvider=functionNode('Fc');
let providerCode=appProvider.getText(file);
const providerChanges=[
 ['function Fc({children:e,apiClient:a}){','function Fc({children:e,apiClient:a}){const reconciledClear=v.useRef(false);'],
 ['if(!ce||!k.ready||!Se())return;','if(!ce||!k.ready||!Se()||isCompletedWorkout(C,c?.sessions||[]))return;if(!C&&reconciledClear.current){reconciledClear.current=false;A("empty");return;}'],
 ['[C,ce,k.ready])','[C,ce,k.ready,isCompletedWorkout(C,c?.sessions||[])])'],
 ['const _t=Z.currentDraft;J.current=_t||null','const _t=Z.currentDraft;J.current=isCompletedWorkout(_t,Z.db.sessions)?null:_t||null'],
 ['const We=v.useCallback','v.useEffect(()=>{if(k.ready&&isCompletedWorkout(C,c?.sessions||[])){reconciledClear.current=true;J.current=null;W.current=false;z(null);void k.clear();A("empty");}},[C,c,k.ready,z,k.clear]);const We=v.useCallback'],
];
for(const [before,after]of providerChanges){if(providerCode.split(before).length!==2)throw new Error('Workout completion provider patch mismatch: '+before);providerCode=providerCode.replace(before,after);}
replacements.push([appProvider.getStart(file),appProvider.end,completedCode+providerCode]);
const cloudApi=functionNode('Ic');
const draftEndpoint='if(i==="/workout-draft")return';
if(cloudApi.getText(file).split(draftEndpoint).length!==2)throw new Error('Workout draft endpoint changed.');
replacements.push([cloudApi.getStart(file),cloudApi.end,cloudApi.getText(file).replace(draftEndpoint,'if(i==="/workout-draft"&&isCompletedWorkout(s.draft,o.sessions))return ee({ok:true,completed:true});'+draftEndpoint)]);
const podsSource=fs.readFileSync(path.join(root,'../../src/client/components/TodayPodsCard.ts'),'utf8');
const podsCode=ts.transpileModule(podsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import[^\n]+\n/gm,'').replace('export function TodayPodsCard','function TodayPodsCard').replace(/\bReact\b/g,'v');
const podsService=ts.transpileModule(fs.readFileSync(path.join(root,'../../src/client/lib/pods-service.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import[^\n]+\n/gm,'').replace('export const friendPods','const healthOSFriendPods').replace(/\brequest\b/g,'requestFriendPods').replace(/\bactiveSession\b/g,'yt');
const today=functionNode('km');
let todayCode=today.getText(file);
if(!todayCode.endsWith(']})}'))throw new Error('Today footer layout changed.');
todayCode=todayCode.slice(0,-4)+',t.jsx(HealthOSTodayPods,{}),t.jsx("small",{className:"subtle",children:"Health OS v'+releaseVersion+'"})]})}';
replacements.push([today.getStart(file),today.end,podsCode+podsService+'function HealthOSTodayPods(){const cloud=at(),app=Je();return t.jsx(TodayPodsCard,{userId:cloud.user?.id,project:cloud.savedConfig?.url,service:healthOSFriendPods,onSignIn:()=>app.setPage("WebSettings")});}'+todayCode]);
const deck=functionNode('uu');
const capture='g.currentTarget.setPointerCapture(g.pointerId),g.pointerType==="mouse"&&g.preventDefault()';
if(deck.getText(file).split(capture).length!==2)throw new Error('Card gesture handler changed.');
replacements.push([deck.getStart(file),deck.end,deck.getText(file).replace(capture,'g.pointerType==="mouse"&&(g.currentTarget.setPointerCapture(g.pointerId),g.preventDefault())')]);
replacements.push([init.getStart(file), init.end, `function yp(){return initializeAndroid({isAndroid:za,app:ts,browser:Pn,keyboard:ss,statusBar:as,notifications:Tt,shareBlob:sl});}`]);
const reminders = functionNode('im');
// Reuse the editable web transport in the recovered APK without rebuilding its UI.
const realtimeSource = fs.readFileSync(path.join(root, '../../src/client/lib/supabase-realtime.ts'), 'utf8');
const realtimeCode = ts.transpileModule(realtimeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace('export function subscribeToCloudChanges(', 'function Gi(').replace(/export \{\};?\s*$/, '');
if (!realtimeCode.includes('function Gi(')) throw new Error('Realtime transport export changed.');
const realtime = functionNode('Gi');
replacements.push([realtime.getStart(file), realtime.end, realtimeCode]);
const biologySource = fs.readFileSync(path.join(root, '../../src/client/lib/biology-cloud.ts'), 'utf8');
const biologyAst = ts.createSourceFile('biology.ts', biologySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const recentNode = biologyAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readRecentBiologicalCloud');
if (!recentNode) throw new Error('Recent biological loader missing.');
const recentCode = ts.transpileModule(recentNode.getText(biologyAst), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace('export async function', 'async function').replace(/\bbioSchema\b/g, 'ot').replace(/\bresponseJson\b/g, 'un').replace(/\bheaders\b(?=\()/g, 'dn');
const biology = functionNode('zc');
const firstPull = '??0;try{for(;;){const x=await tc(K,N);';
if (biology.getText(file).split(firstPull).length !== 2) throw new Error('Initial biological sync does not match reference.');
let biologyCode=biology.getText(file)
  .replace('function zc({children:e}){','function zc({children:e}){const recentScope=v.useRef(null),historyDirty=v.useRef(false),continuation=v.useRef();')
  .replace(firstPull, '??0;if(recentScope.current!==n){if(!await X(await readRecentBiologicalCloud(K)))return;await $();recentScope.current=n;if(i.current===n)u("Loading older records from Supabase…");}let moreHistory=false;try{for(let batch=0;batch<4;batch++){const x=await tc(K,N);');
const biologyChanges=[
 ['for(const S of x)await I.objectStore("outbox").get(S.record_id)||(await I.objectStore("records").put(S.payload),await I.objectStore("bases").put({id:S.record_id,revision:S.revision}));','const pendingIds=new Set(await I.objectStore("outbox").getAllKeys());await Promise.all(x.filter(S=>!pendingIds.has(S.record_id)).flatMap(S=>[I.objectStore("records").put(S.payload),I.objectStore("bases").put({id:S.record_id,revision:S.revision})]));'],
 ['const I=H.transaction(["records","outbox","bases","cursors"],"readwrite");','x.length&&(historyDirty.current=true);const I=H.transaction(["records","outbox","bases","cursors"],"readwrite");'],
 ['if(N=x.cursor,!x.hasMore)break','if(N=x.cursor,moreHistory=x.hasMore,!x.hasMore)break'],
 ['await $(),i.current===n&&u(await H.count("conflicts")?', 'if(A.length||(!moreHistory&&historyDirty.current)){await $();historyDirty.current=false;}if(moreHistory){clearTimeout(continuation.current);continuation.current=setTimeout(()=>{if(i.current===n)void L();},2000);}i.current===n&&u(await H.count("conflicts")?'],
 ['"Changes queued for Supabase":"Synced with Supabase"','"Changes queued for Supabase":moreHistory?"Loading older records…":"Synced with Supabase"'],
 ['const V=()=>void L(),H=setInterval(V,3e4);','const requested=()=>{recentScope.current=null;void L();};window.addEventListener("health-os-sync-request",requested);const V=()=>void L(),H=setInterval(V,3e4);'],
 ['clearInterval(H)}},[n,s.unlocked,P])','clearInterval(H),clearTimeout(continuation.current),window.removeEventListener("health-os-sync-request",requested)}},[n,s.unlocked,P])'],
];
for(const [before,after] of biologyChanges){if(biologyCode.split(before).length!==2)throw new Error('Biology performance patch mismatch: '+before);biologyCode=biologyCode.replace(before,after);}
replacements.push([biology.getStart(file),biology.end,recentCode+biologyCode]);
replacements.push([reminders.getStart(file), reminders.end, `function im(){
 const {app:e,bio:a,records:s,stored:n}=Ze(),i=v.useRef(new Set);
 v.useEffect(()=>{if(!e.db||!a.ready)return;let stopped=false;
 const run=async()=>{const preference=Nn(n);if(preference?.metadata.browserNotifications!==true)return;
 const day=G(new Date().toISOString()),shown=n.filter(row=>row.type==='automationEvent'&&row.metadata.status==='notified'&&G(row.timestamp)===day);
 if(shown.length>=Number(preference.metadata.dailyLimit??3))return;
 const event=An(s,e.db,e.skin).find(row=>!i.current.has(row.id)&&!shown.some(item=>item.metadata.eventId===row.id));
 if(!event||stopped)return;i.current.add(event.id);
 try{const accepted=await deliverReminder(event.id,za(),()=>{window.focus();e.setPage('Timeline');});
 if(!accepted){i.current.delete(event.id);return;}
 await a.save({id:'notification-'+event.id,type:'automationEvent',domain:'Today',name:'Reminder shown',metadata:{eventId:event.id,status:'notified',category:event.kind}});
 }catch{i.current.delete(event.id);}};
 void run();const timer=setInterval(()=>void run(),60000);return()=>{stopped=true;clearInterval(timer);};
 },[e.db,e.skin,s,n,a.ready]);return null;
}`]);
// The settings component keeps the same consent flag and save path.
const permission = 'const O=await Notification.requestPermission();';
if (bundle.split(permission).length !== 2) throw new Error('Notification permission call does not match reference.');
for (const [start,end,value] of replacements.sort((a,b)=>b[0]-a[0])) bundle = bundle.slice(0,start)+value+bundle.slice(end);
bundle = bundle.replace(permission, 'const O=await requestNotificationPermission(za());');
const support = 'if(!("Notification"in window))';
if (bundle.split(support).length !== 2) throw new Error('Notification support check does not match reference.');
bundle = bundle.replace(support, 'if(!za()&&!("Notification"in window))');
const notificationLabel='children:"Browser notifications"';
if(bundle.split(notificationLabel).length!==2)throw new Error('Notification label does not match reference.');
bundle=bundle.replace(notificationLabel,'children:za()?"Android notifications":"Browser notifications"');
const accountSubscription='Gi(a.config,a.accessToken,a.uid,c)';
if(bundle.split(accountSubscription).length!==2)throw new Error('Account realtime subscription does not match reference.');
bundle=bundle.replace(accountSubscription,'Gi(a.config,a.accessToken,a.uid,c,["body_os_records"],async()=>{const current=await yt();if(current.uid!==a.uid||current.config.url!==a.config.url)throw new Error("Account changed.");return current.accessToken;})');
bundle = bundle.replaceAll('\"5.2.0\"', JSON.stringify(releaseVersion));
bundle = `import {initializeAndroid,requestNotificationPermission,deliverReminder} from '../health-os-native.js';\n` + bundle;
const validation = ts.createSourceFile('patched.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (validation.parseDiagnostics.length) throw new Error('Patched bundle has syntax errors.');
fs.writeFileSync(bundlePath, bundle);
const trackerPath=path.join(www,'assets/Tracker-DqfCL2CA.js');
let trackerBundle=fs.readFileSync(trackerPath,'utf8');
const trackerAst=ts.createSourceFile('tracker.js',trackerBundle,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const setCard=trackerAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='et');
if(!setCard)throw new Error('Android set card missing.');
let card=setCard.getText(trackerAst).replace('function et(', 'function HealthOSSetCard(');
const timerBox='e.jsxs("div",{className:"and-workout-timers",children:[e.jsx(Qs,{startedAt:n.startedAt}),e.jsx(Xs,{state:n.restTimer,defaultSeconds:Number(W.restSec)||90,onChange:O})]})';
if(card.split(timerBox).length!==2)throw new Error('Workout timer layout changed.');
card=card.replace(timerBox,'e.jsx(Qs,{startedAt:n.startedAt})')
  .replace('e.jsxs("label",{className:"flow-toggle",children:[e.jsx("input",{type:"checkbox",checked:k,onChange:m=>de(m.target.checked)}),"Auto rest after each completed set"]})','null')
  .replace('e.jsxs("section",{className:"and-recent-sets",children:[','e.jsxs("details",{className:"and-recent-sets",children:[e.jsx("summary",{children:"Review sets"}),')
  .replace('e.jsxs("section",{className:"and-up-next",children:[','e.jsxs("details",{className:"and-up-next",children:[e.jsx("summary",{children:"Workout queue & tools"}),');
const restSource=fs.readFileSync(path.join(root,'../../src/client/components/WorkoutRestCard.ts'),'utf8');
const restCode=ts.transpileModule(restSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace(/^import[^\n]+\n/gm,'').replace('export function WorkoutRestCard','function WorkoutRestCard').replace(/\bReact\b/g,'o');
const flow=`function et(props){const state=props.tracker.restTimer;if(!state?.card)return e.jsx(HealthOSSetCard,props);const done=props.entry.completedSets||[],next=props.entry.weights.findIndex((_,index)=>!done.includes(index));return e.jsxs('div',{className:'and-active-workout',children:[e.jsx(Qs,{startedAt:props.tracker.startedAt}),e.jsx(WorkoutRestCard,{state,onChange:props.rest,onSchedule:deadline=>{De(deadline).catch(()=>{});},onCancel:()=>{oe().catch(()=>{});},onFinish:()=>props.rest({...state,card:false,running:false,remaining:0,deadline:null}),nextLabel:next<0?(props.tracker.index===props.tracker.exercises.length-1?'Review workout':'Next exercise'):'Set '+(next+1)+' · '+props.tracker.exercises[props.tracker.index].name})]});}`;
trackerBundle=trackerBundle.slice(0,setCard.getStart(trackerAst))+restCode+flow+card+trackerBundle.slice(setCard.end);
const autoRest='ve&&T({restTimer:Ce(Number(x.restSec)||90)})';
if(trackerBundle.split(autoRest).length!==2)throw new Error('Completed-set rest handler changed.');
trackerBundle=trackerBundle.replace(autoRest,'!B.includes(s)&&T({restTimer:{...Ce(Number(x.restSec)||90),card:true}})');
const trackerValidation=ts.createSourceFile('tracker-patched.js',trackerBundle,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(trackerValidation.parseDiagnostics.length)throw new Error('Tracker patch has syntax errors.');
fs.writeFileSync(trackerPath,trackerBundle);

const releaseFiles = ['health-os-release.js', 'health-os-release.css', 'release-config.js'];
for (const name of releaseFiles) fs.copyFileSync(path.join(root, '../../src/client/public', name), path.join(www, name));
const nativeIndex = path.join(www, 'index.html');
fs.writeFileSync(nativeIndex, fs.readFileSync(nativeIndex, 'utf8').replace('</head>', '<link rel="stylesheet" href="/health-os-release.css"><script type="module" src="/health-os-release.js"></script></head>'));
const originals = fs.readdirSync(path.join(reference,'public/assets')).filter(name=>name.endsWith('.css'));
for (const name of originals) if (!fs.readFileSync(path.join(reference,'public/assets',name)).equals(fs.readFileSync(path.join(www,'assets',name)))) throw new Error('Reference styling changed.');
console.log('Prepared exact reference interface with isolated Android integration fixes. CSS and screen modules unchanged.');
