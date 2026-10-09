/** Health OS glass-inspired reports, with email-safe solid fallbacks and inline PNG assets. */
import { REPORT_EMAIL_ASSETS } from './report-email-assets.js';
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Row[] : [];
export const escapeEmailHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const e = escapeEmailHtml;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const logged = (value: unknown) => value !== undefined && value !== null && value !== '';
const display = (value: unknown, suffix = '') => logged(value) ? String(value) + suffix : '—';
const paragraph = (value: unknown) => e(value).replace(/\r?\n/g, '<br>');
const assets: Record<string, string> = REPORT_EMAIL_ASSETS;
const primary = '#202124', ink = '#202124', muted = '#686863';
const champagne = '#c4ac7a', champagneInk = '#806b40';
const cardStyle = 'background:#ffffff;border:1px solid #e3e0d9;border-radius:20px;box-shadow:0 5px 20px rgba(32,33,36,.04);';
const table = (content: string, style = '') => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;' + style + '">' + content + '</table>';
const block = (content: string, style = '', outer = '') => table('<tr><td class="report-card" style="padding:24px;border-radius:20px;' + style + '">' + content + '</td></tr>', cardStyle + 'margin-bottom:18px;' + outer);
const heading = (text: string) => '<h2 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:' + ink + '">' + text + '</h2>';
const tag = (text: string, color = champagneInk) => '<p style="margin:0 0 10px;color:' + color + ';font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">' + text + '</p>';
function image(name: string, size = 28, alt = '', style = '') {
  return '<img src="data:image/png;base64,' + assets[name] + '" alt="' + e(alt) + '" width="' + size + '" height="' + size + '" style="display:inline-block;vertical-align:middle;border:0;width:' + size + 'px;height:' + size + 'px;' + style + '">';
}

export type ReportEmailAttachment = { filename: string; content: string; encoding: 'base64'; cid: string; contentType: 'image/png'; contentDisposition: 'inline' };
/** PNGs become MIME inline attachments, not blocked base64 or remote image URLs. */
export function prepareReportEmailImages(html: string): { html: string; attachments: ReportEmailAttachment[] } {
  const attachments: ReportEmailAttachment[] = [];
  for (const [name, content] of Object.entries(assets)) {
    const uri = 'data:image/png;base64,' + content;
    if (!html.includes(uri)) continue;
    const cid = 'body-os-report-' + name;
    html = html.replaceAll(uri, 'cid:' + cid);
    attachments.push({ filename: name + '.png', content, encoding: 'base64', cid, contentType: 'image/png', contentDisposition: 'inline' });
  }
  return { html, attachments };
}

export function baseTemplate(title: string, content: string) {
  const mobile = '@media only screen and (max-width:360px){.report-stats-row{display:block!important}.report-stat-column{display:inline-block!important;width:50%!important;box-sizing:border-box;padding:0 5px 10px!important}.report-stat-value{font-size:24px!important}}.indicator-label{text-transform:uppercase}@media print{body{background:#fff!important}.report-card{break-inside:avoid}table{box-shadow:none!important}}@media only screen and (max-width:480px){.report-card{padding:16px!important}.report-title{font-size:27px!important}.indicator-row{display:block!important}.indicator-column{display:inline-block!important;width:50%!important;box-sizing:border-box}.indicator-icon{width:24px!important;height:24px!important}.indicator-label{font-size:9px!important;letter-spacing:0!important}.indicator-value{font-size:13px!important}.indicator-cell{padding:10px 8px!important}.indicator-gap{width:4px!important}.report-stat{padding:16px 10px!important}.report-stat-value{font-size:22px!important}}';
  // Keep the existing logo asset and wordmark color independent of the UI palette.
  const brand = image('brand', 36, 'Health OS') + ' <span style="vertical-align:middle;color:#6253d6;font-weight:bold;font-size:24px;letter-spacing:-1px">HEALTH OS</span>';
  const header = table('<tr><td style="padding:16px 36px;background:#f6f5f2;border-bottom:1px solid #c4ac7a">' + brand + '</td></tr>');
  const footer = table('<tr><td align="center" style="padding:48px 12px 72px">' + image('brand', 38, 'Health OS') + '<p style="margin:22px 0 0;color:#73736c;font-size:10px;font-weight:bold;letter-spacing:3px">YOUR HEALTH. YOUR PROGRESS.</p><p style="margin:8px 0 0;color:' + muted + ';font-size:10px">Health OS · Built from your saved records</p></td></tr>');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + e(title) + '</title><style>' + mobile + '</style></head><body style="margin:0;padding:0;background:#f6f5f2;background:linear-gradient(135deg,#eeece7,#f6f5f2 55%,#eee9de);color:' + ink + ';font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65">' + table('<tr><td align="center">' + table('<tr><td>' + header + '</td></tr><tr><td style="padding:30px 16px 0">' + content + '</td></tr><tr><td>' + footer + '</td></tr>', 'max-width:720px;width:100%;margin:0 auto;background:#f6f5f2;') + '</td></tr>', 'background:#f6f5f2;') + '</body></html>';
}

const timedSet = (set: Row, log: Row) => (set.trackingMode || log.trackingMode) === 'time' || (logged(set.durationSec) && (set.trackingMode || log.trackingMode) !== 'weight_reps');
function metrics(logs: Row[]) {
  const completed = logs.filter(log => log.status === 'completed' || log.status === 'finished');
  const sets = completed.flatMap(log => rows(log.sets));
  const tonnage = completed.reduce((total, log) => total + rows(log.sets).reduce((sum, set) => {
    const mode = set.trackingMode || log.trackingMode;
    return sum + (timedSet(set,log) || mode === 'reps' || mode === 'reps_only' ? 0 : number(set.w) * number(set.r));
  }, 0), 0);
  return { done: completed.length, skipped: logs.filter(log => log.status === 'skipped').length, sets: sets.length, tonnage };
}
function stats(logs: Row[], units = 'kg') {
  const m = metrics(logs);
  const volume = m.tonnage >= 1000 ? (m.tonnage / 1000).toFixed(1) + 'k ' + units : Math.round(m.tonnage) + ' ' + units;
  return table('<tr class="report-stats-row">' + [['Done', m.done, primary], ['Skipped', m.skipped, '#b94d72'], ['Sets', m.sets, ink], ['Volume', volume, ink]].map(([label, value, color], index) => '<td class="report-stat-column" width="25%" valign="top" style="padding:0 ' + (index === 3 ? '0' : '7px') + ' 22px ' + (index === 0 ? '0' : '7px') + '">' + table('<tr><td class="report-stat" style="padding:18px 20px"><p style="margin:0 0 5px;color:' + muted + ';font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">' + e(label) + '</p><strong class="report-stat-value" style="font-size:28px;line-height:1.15;white-space:nowrap;color:' + color + '">' + e(value) + '</strong></td></tr>', cardStyle) + '</td>').join('') + '</tr>');
}
type Indicator = { key: string; label: string; value: string; icon: string };
function indicatorGrid(indicators: Indicator[]) {
  return table(Array.from({ length: Math.ceil(indicators.length / 4) }, (_, index) => '<tr class="indicator-row">' + Array.from({ length: 4 }, (_, col) => {
    const item = indicators[index * 4 + col];
    if (!item) return '<td width="25%"></td>';
    return '<td class="indicator-column" width="25%" valign="top" style="padding:5px 5px"><table data-indicator="' + e(item.key) + '" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e0d9;border-radius:12px;background:#f7f6f3"><tr><td class="indicator-cell" style="padding:10px 8px">' + table('<tr><td width="28" valign="middle">' + image(item.icon, 28, '', 'display:block;') .replace('style="', 'class="indicator-icon" style="') + '</td><td class="indicator-gap" width="8"></td><td valign="middle"><span class="indicator-label" style="display:block;font-size:9px;color:' + muted + ';font-weight:bold;letter-spacing:.4px;text-transform:uppercase;line-height:1.3">' + e(item.label) + '</span><strong class="indicator-value" style="display:block;font-size:14px;line-height:1.3;color:' + ink + '">' + e(item.value) + '</strong></td></tr>', 'table-layout:fixed;') + '</td></tr></table></td>';
  }).join('') + '</tr>').join(''), 'table-layout:fixed;margin:6px -5px 0;');
}
function readinessCard(value: unknown) {
  const r = row(value);
  if (!Object.keys(r).length) return block(heading(image('readiness', 22) + ' Readiness') + '<p style="margin:0;color:' + muted + '">No readiness check-in was logged for this workout.</p>');
  const score = logged(r.score) && Number.isFinite(Number(r.score)) && Number(r.score) >= 0 && Number(r.score) <= 100 ? Math.round(Number(r.score)) : null;
  const band = score === null ? '' : score >= 80 ? 'Ready' : score >= 60 ? 'Controlled' : score >= 40 ? 'Reduced' : 'Recovery';
  const indicators: Indicator[] = [
    { key:'sleepHours', label:'Sleep', value:display(r.sleepHours,'h'), icon:'sleep' },
    { key:'soreness', label:'Soreness', value:display(r.soreness,'/10'), icon:'soreness' },
    { key:'energy', label:'Energy', value:display(r.energy,'/10'), icon:'energy' },
    { key:'stress', label:'Stress', value:display(r.stress,'/10'), icon:'stress' },
    { key:'motivation', label:'Motivation', value:display(r.motivation,'/10'), icon:'motivation' },
    { key:'mood', label:'Mood', value:display(r.mood,'/10'), icon:'mood' },
    { key:'hydration', label:'Hydration', value:display(r.hydration,' '+String(r.hydrationUnit||'L')), icon:'hydration' },
    { key:'mealProtein', label:'Protein', value:display(r.mealProtein,' g'), icon:'protein' },
  ];
  if (logged(r.sleepQuality)) indicators.push({key:'sleepQuality',label:'Sleep quality',value:display(r.sleepQuality,'/10'),icon:'quality'});
  if (logged(r.steps)) indicators.push({key:'steps',label:'Steps',value:display(r.steps),icon:'steps'});
  if (logged(r.restingHeartRate)) indicators.push({key:'restingHeartRate',label:'Resting HR',value:display(r.restingHeartRate,' bpm'),icon:'heart'});
  if (r.painFlag === true) indicators.push({key:'painFlag',label:'Pain flagged',value:'Yes',icon:'pain'});
  const gauge = table('<tr><td align="center" style="padding:18px;background:#f4eee1;border:1px solid #e3e0d9;border-radius:15px"><p style="margin:0 0 8px;font-size:9px;font-weight:bold;color:' + muted + ';letter-spacing:1px;text-transform:uppercase">Overall score</p>' + (score !== null ? image('score'+score, 96, 'Readiness score '+score+' of 100 — '+band, 'display:block;') : '<span style="display:inline-block;padding:18px 26px;border:6px solid #e3e0d9;border-radius:50%;font-size:30px">—</span>') + '</td></tr>');
  return block(heading(image('readiness', 22) + ' Readiness') + gauge + indicatorGrid(indicators) + (r.recommendation ? '<p style="margin:16px 0 0;color:'+muted+';font-size:14px">'+paragraph(r.recommendation)+'</p>' : '') + (r.notes ? '<p style="margin:14px 0 0;font-size:14px">' + paragraph(r.notes) + '</p>' : ''));
}
function setLabel(set: Row, log: Row, units = 'kg') {
  const mode = set.trackingMode || log.trackingMode;
  const value = (input: unknown) => logged(input) ? String(input) : 'Not logged';
  if (mode === 'time' || (set.durationSec !== undefined && mode !== 'weight_reps')) return value(set.durationSec ?? set.r) + ' sec';
  if (mode === 'reps' || mode === 'reps_only') return value(set.r) + ' reps';
  return value(set.w) + ' ' + units + ' × ' + value(set.r);
}
function exerciseCard(log: Row, index: number, units = 'kg') {
  const skipped = log.status === 'skipped', sets = rows(log.sets).slice(0,50);
  const status = skipped ? 'Skipped' : String(log.status||'Logged');
  const header = '<p style="margin:0 0 6px;font-size:11px;font-weight:bold;color:' + (skipped ? '#73736c' : primary) + ';text-transform:uppercase">' + image(skipped?'skipped':'completed', 13) + ' ' + e(status) + (log.target?' | '+e(log.target):'') + '</p><h3 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:' + (skipped?'#686863':ink) + '">' + (index+1) + '. ' + e(log.name||'Exercise') + '</h3>';
  const setTable = table(sets.map((set,i) => '<tr><td style="padding:13px 10px;border-bottom:1px solid #e8e5df;font-size:14px;color:' + muted + '">Set '+e(set.s||i+1)+(set.type?' · '+e(set.type):'')+'</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e8e5df"><span style="background:#f6f5f2;border:1px solid #e3e0d9;padding:4px 10px;border-radius:7px;font-size:14px;font-weight:bold">'+e(setLabel(set,log,units))+'</span>'+(logged(set.rpe)?'<br><span style="font-size:11px;color:'+muted+'">RPE '+e(set.rpe)+'</span>':'')+(logged(set.rir)?'<br><span style="font-size:11px;color:'+muted+'">RIR '+e(set.rir)+'</span>':'')+(logged(set.restSec)?'<br><span style="font-size:11px;color:'+muted+'">Rest '+e(set.restSec)+' sec</span>':'')+(set.tempo?'<br><span style="font-size:11px;color:'+muted+'">Tempo '+e(set.tempo)+'</span>':'')+'</td></tr>').join(''));
  const coach = log.aiCoachComment ? table('<tr><td width="24" valign="top" style="padding:16px 0 16px 16px">'+image('coach',22)+'</td><td style="padding:16px 16px 16px 10px"><p style="margin:0 0 5px;color:#7456b8;font-size:11px;font-weight:bold;text-transform:uppercase">AI Coach</p><p style="margin:0;font-size:14px;line-height:1.6;color:#58437f">'+paragraph(log.aiCoachComment)+'</p></td></tr>', 'margin-top:18px;background:#f3f0f8;border:1px solid #e2d9ee;border-radius:12px;') : '';
  return block(header + (skipped && !sets.length ? '<p style="margin:0;color:#686863;font-size:14px;font-style:italic">No sets recorded.</p>' : setTable) + (log.journal?'<p style="font-size:14px">'+paragraph(log.journal)+'</p>':'') + coach, skipped?'background:#f6f5f2;':'', 'border-left:8px solid '+(skipped?'#d6d2ca':primary)+';');
}
function sessionIndicators(record: Row, logs: Row[]) {
  const items: Indicator[] = [];
  if (logged(record.durationMinutes) && Number(record.durationMinutes) > 0) items.push({key:'durationMinutes',label:'Duration',value:display(record.durationMinutes,' min'),icon:'duration'});
  if (record.mode === 'planned' || record.mode === 'flexible') items.push({key:'mode',label:'Session',value:record.mode === 'planned' ? 'Planned' : 'Flexible',icon:'routine'});
  const completed = logs.filter(log => log.status === 'completed' || log.status === 'finished');
  const repSets = completed.flatMap(log => rows(log.sets).filter(set => !timedSet(set,log)));
  if (repSets.some(set => logged(set.r))) items.push({key:'repetitions',label:'Logged reps',value:String(repSets.reduce((sum,set) => sum + number(set.r),0)),icon:'reps'});
  const timedSets = completed.flatMap(log => rows(log.sets).filter(set => timedSet(set,log)));
  if (timedSets.length) items.push({key:'timedWork',label:'Timed work',value:String(timedSets.reduce((sum,set) => sum + number(set.durationSec ?? set.r),0))+' sec',icon:'duration'});
  return items.length ? block(tag('Session details') + indicatorGrid(items)) : '';
}
function workoutContent(record: Row) {
  const units = record.units === 'lb' ? 'lb' : 'kg';
  const logs = rows(record.logs).slice(0,100), summary = record.aiOverallSummary || record.summary;
  const context = [record.weekName || (record.weekNumber?'Week '+String(record.weekNumber):''), record.dayKey, record.date].filter(Boolean).map(e).join(' | ');
  const header = block(tag('Health OS Session Report',champagne)+'<h1 class="report-title" style="margin:0 0 10px;font-size:36px;letter-spacing:-1.2px;line-height:1.2;color:#f2f1ed">'+e(record.dayTitle||'Workout report')+'</h1><p style="margin:0;font-size:14px;color:#c2beb5">'+context+'</p>', 'padding:32px;background:#202124;background:linear-gradient(115deg,#202124,#30302e);border-top:3px solid #c4ac7a;', 'margin-bottom:24px;');
  const analysis = summary ? block(table('<tr><td width="40" valign="middle">'+image('analysis',40)+'</td><td style="padding-left:12px"><h2 style="margin:0;color:'+primary+';font-size:15px;letter-spacing:1.5px;text-transform:uppercase">AI Session Analysis</h2></td></tr>')+'<p style="margin:14px 0 0;font-size:16px;line-height:1.65;color:#686863">'+paragraph(summary)+'</p>', 'background:#f3f0f8;', 'border:2px solid #e2d9ee;box-shadow:0 5px 15px #eeece7;') : '';
  const divider = table('<tr><td align="center" style="padding:12px 0 30px"><div style="height:4px;width:96px;background:#c4ac7a;border-radius:3px"></div></td></tr>');
  return header + stats(logs,units) + sessionIndicators(record,logs) + readinessCard(record.readiness) + analysis + (logs.length?divider:'') + logs.map((log,index)=>exerciseCard(log,index,units)).join('') + (record.notes?block(heading('Workout notes')+'<p style="margin:0">'+paragraph(record.notes)+'</p>'):'');
}
function workoutText(record: Row) {
  const units = record.units === 'lb' ? 'lb' : 'kg';
  const logs=rows(record.logs),m=metrics(logs),r=row(record.readiness);
  const vitals=['sleepHours','sleepQuality','soreness','energy','stress','motivation','mood','hydration','mealProtein','steps','restingHeartRate'].filter(key=>logged(r[key])).map(key=>key+': '+String(r[key])).join(' · ');
  return [String(record.dayTitle||'Workout report'),String(record.date||''),logged(record.durationMinutes)?'Duration: '+String(record.durationMinutes)+' min':'',m.done+' done · '+m.skipped+' skipped · '+m.sets+' sets · '+Math.round(m.tonnage)+' '+units+' volume',Object.keys(r).length?'Readiness: '+String(r.score??'Not logged')+'\n'+vitals:'Readiness: not logged',String(record.aiOverallSummary||record.summary||''),...logs.map((log,i)=>[(i+1)+'. '+String(log.name)+' ('+String(log.status)+')',...rows(log.sets).map(set=>setLabel(set,log,units)+(logged(set.rpe)?' · RPE '+String(set.rpe):'')+(logged(set.rir)?' · RIR '+String(set.rir):'')+(logged(set.restSec)?' · Rest '+String(set.restSec)+' sec':'')+(set.tempo?' · Tempo '+String(set.tempo):'')),String(log.aiCoachComment||''),String(log.journal||'')].filter(Boolean).join('\n')),String(record.notes||'')].filter(Boolean).join('\n\n');
}
/** Resolve missing snapshots by date only: never attach a different day's check-in. */
export function attachReportReadiness(records: Row[],checkins: Row[]): Row[] {
  const byDate=new Map(checkins.filter(item=>typeof item.date==='string').map(item=>[item.date,item]));
  return records.map(record=>Object.keys(row(record.readiness)).length||!byDate.has(record.date)?record:{...record,readiness:byDate.get(record.date)});
}
export function reportTemplate(title: string, records: Row[]) {
  const workouts=records.filter(record=>Array.isArray(record.logs));
  const normalizedLogs=workouts.flatMap(record=>rows(record.logs).map(log=>({...log,sets:rows(log.sets).map(set=>({...set,w:record.units==='lb'&&logged(set.w)?Number(set.w)*0.45359237:set.w}))})));
  const header=records.length>1?block(heading(e(title))+'<p style="margin:0;color:'+muted+'">'+workouts.length+' saved workouts · combined volume in kg</p>')+stats(normalizedLogs):'';
  const otherKeys=['kind','value','unit','source','area','concern','irritation','dryness'];
  const content=records.map(record=>Array.isArray(record.logs)?workoutContent(record):block(heading(e(record.name||record.date||title))+'<p>'+e(record.date)+'</p>'+indicatorGrid(otherKeys.filter(key=>record[key]!==undefined).map(key=>({key,label:key,value:String(record[key]),icon:key==='dryness'?'hydration':'readiness'})))+'<p>'+paragraph(record.summary||record.notes)+'</p>')).join('');
  return {html:baseTemplate(title,header+content),text:'Health OS\n'+title+'\n\n'+records.map(record=>Array.isArray(record.logs)?workoutText(record):[record.name,record.date,record.summary||record.notes,...otherKeys.filter(key=>record[key]!==undefined).map(key=>key+': '+String(record[key]))].filter(Boolean).join('\n')).join('\n\n────────────\n\n')};
}

