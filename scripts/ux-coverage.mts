import fs from 'node:fs';
import path from 'node:path';
import { viewManifest, readRoute, routeHref, viewIdentity } from '../src/client/lib/os-navigation.ts';
import { legacyViewIds } from '../src/client/lib/legacy-view-ids.ts';

const states=['first-use','populated','loading','empty','unavailable','validation-error','failed-save','draft-recovery','conflict'];
const automatedChecks = [
  {workflow:'Deferred Today tools, capture workout entry and training HTML export',states:['empty','populated'],tests:['tests/web/ux-acceptance-states.spec.ts'],limit:'On-demand tools, explained empty state, editable workout sets, focused logging navigation and self-contained HTML export.'},
  {workflow:'Appointment Details / Prepare / Visit notes / Follow-ups',states:['populated','failed-save','draft-recovery','conflict'],tests:['tests/web/ux-experience.spec.ts','tests/web/ux-recovery.spec.ts'],limit:'Named assertions and synthetic scenarios; no blanket stage/state certification.'},
  {workflow:'Quick Capture and shared draft store',states:['unavailable','draft-recovery'],tests:['tests/web/ux-experience.spec.ts','tests/web/ux-recovery.spec.ts'],limit:'Refresh, unavailable IndexedDB, account/project isolation and credential exclusion.'},
  {workflow:'Weekly review, Care composers/profile/coach/photo context, training goals, calendar and meal description',states:['draft-recovery'],tests:['tests/web/ux-domain-recovery.spec.ts'],limit:'Twelve named field-restoration scenarios; photo bytes and consent are excluded.'},
  {workflow:'Recipe, library import and habit form',states:['failed-save','draft-recovery'],tests:['tests/web/ux-domain-recovery.spec.ts'],limit:'Closed recipe recovery, partial import retry IDs, habit retry IDs and successful cleanup.'},
  {workflow:'Workout tracker',states:['failed-save','draft-recovery'],tests:['tests/web/ux-acceptance-states.spec.ts'],limit:'Failed cloud draft save, local restoration and workout retry without duplication.'},
  {workflow:'Medical actions and cardio',states:['populated'],tests:['tests/web/ux-acceptance-states.spec.ts'],limit:'Overlapping reconciliation/question saves and separate acknowledged cardio IDs.'},
  {workflow:'Shared shell, search and route gallery',states:[],tests:['tests/web/ux-experience.spec.ts','tests/web/ux-recovery.spec.ts','tests/web/stitch-redesign.spec.ts'],limit:'Reachability, focus, history and responsive layout; rendering is not nine-state coverage.'},
];
const views=viewManifest.map(view=>{
  const route=readRoute(routeHref(view.page,view.panel));
  if(!route||viewIdentity(route)!==view.identity)throw new Error(`Route does not round trip: ${view.identity}`);
  return {...view,legacyGalleryId:legacyViewIds[view.identity]||null,reachabilityAndLayout:'registered-view gallery; see browser run artifacts',states:Object.fromEntries(states.map(state=>[state,'individual verification required; route rendering is not state coverage']))};
});
if(new Set(views.map(view=>view.identity)).size!==views.length)throw new Error('Duplicate route identities');
const walk=(directory:string):string[]=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const interfaces=walk('src/client').filter(file=>file.endsWith('.tsx')).flatMap(file=>{
  const source=fs.readFileSync(file,'utf8');return [...source.matchAll(/<(Modal|DraftForm|form|dialog)\b/g)].map(match=>({file:file.replaceAll('\\','/'),line:source.slice(0,match.index).split('\n').length,kind:match[1],verification:'inventory only; inspect workflow and applicable states'}));
});
const workflows=walk('src/client').filter(file=>file.endsWith('.tsx')||file.endsWith('.ts')).flatMap(file=>{
  const source=fs.readFileSync(file,'utf8');return [...source.matchAll(/(?:useDraftState(?:<[^;]*?>)?|useDraftFields(?:<[^;]*?>)?)\(\s*(['"`])([^'"`\n]+)\1|<DraftForm\b[^>]*workflow=/g)].map(match=>({file:file.replaceAll('\\','/'),line:source.slice(0,match.index).split('\n').length,workflow:match[2]||'DraftForm expression; inspect source',verification:'draft integration inventory; recovery coverage is recorded separately'}));
});
const controls=walk('src/client').filter(file=>file.endsWith('.tsx')).flatMap(file=>{
  const source=fs.readFileSync(file,'utf8');return [...source.matchAll(/<(button|input|select|textarea|details|DeferredDetails)\b/g)].map(match=>({file:file.replaceAll('\\','/'),line:source.slice(0,match.index).split('\n').length,kind:match[1],verification:'source locator, not a permanent route identity or a runtime-state pass; reusable controls may render multiple instances'}));
});
const directory='outputs/ux-validation';fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'coverage.json'),JSON.stringify({version:2,generatedAt:new Date().toISOString(),automatedChecks,views,dynamicViews:[{identity:'Health:Appointment:{id}',stages:['Details','Prepare','Visit notes','Follow-ups'],tests:['tests/web/ux-experience.spec.ts','tests/web/ux-recovery.spec.ts']}],interfaces,workflows,controls,notes:['Static form/dialog inventory includes conditionally rendered interfaces; button-only editors appear in the separate draft-workflow inventory.','Gallery checks validate reachability and layout, not all populated or recovery states.','Manual and representative-user acceptance remains required.']},null,2));
fs.writeFileSync('docs/UX-VIEW-COVERAGE.md',`# Health OS view and state coverage\n\nGenerated with \`node --import tsx scripts/ux-coverage.mts\`. Stable identities preserve the legacy 101-view gallery; new routes use explicit identities.\n\n${views.length} registered views, plus the appointment-detail template; ${interfaces.length} form/dialog source locations. Each view has the nine required states in the JSON inventory. A state marked manual verification required is not a passing result.\n\n| Identity | Domain | Destination | Gallery | URL |\n|---|---|---|---|---|\n${views.map(view=>`| ${view.identity} | ${view.section} | ${view.primary} / ${view.label} | ${view.legacyGalleryId||'New'} | ${view.href} |`).join('\n')}\n\nDynamic identity: \`Health:Appointment:{id}\`; stages Details, Prepare, Visit notes, Follow-ups. The account-owned UUID appears in the URL but never becomes a permanent gallery identifier.\n\nAutomated workflow assertions and their limits are recorded in the JSON automatedChecks section; use the handoff for actual run results. Unverified states remain open.\n\nSource form/dialog and action/disclosure locators, draft integrations and all state requirements: [coverage.json](../outputs/ux-validation/coverage.json). Browser screenshots: [UX validation](../outputs/ux-validation/) and [registered-view gallery](../outputs/stitch-implementation/).\n`);
console.log(`Inventoried ${views.length} registered views and ${interfaces.length} form/dialog locations.`);
