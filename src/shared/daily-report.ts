import {baseTemplate,escapeEmailHtml as e,readinessCard,stats,sessionIndicators,exerciseCard} from './report-email.js';
import {REPORT_EMAIL_ASSETS} from './report-email-assets.js';
import {DAILY_REPORT_ASSETS} from './daily-report-assets.js';
import {DAILY_REPORT_CSS} from './daily-report-style.js';
import {istDate} from './daily-report-policy.js';
type Row=Record<string,any>;
export interface DailyReportData {date:string;cutoff:string;weekName:string;dayName:string;units:string;height?:number|string;readiness:Row|null;nutrition:Row;goals:Row;movement:Row;workouts:Row[];measurement:Row|null;previousMeasurement:Row|null;analysis:string;recommendations:Array<{title:string;body:string;basis:string}>;}
const value=(input:unknown,suffix='')=>input===null||input===undefined||input===''?'Not logged':e(input)+suffix;
const icons:Record<string,string>=REPORT_EMAIL_ASSETS;
const icon=(key:string,label='',size=30)=>`<img src="data:image/png;base64,${DAILY_REPORT_ASSETS[label]||icons[key]||icons.readiness}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;vertical-align:middle">`;
const note=(text:string)=>`<p class="v2-note">${text}</p>`;
const card=(kicker:string,title:string,key:string,content:string)=>`<section class="v2-card"><p class="v2-kicker">${e(kicker)}</p><h2 class="v2-heading">${icon(key)} <span>${e(title)}</span></h2>${content}</section>`;
type Tile=[string,string,unknown,string?];
const grid=(items:Tile[])=>`<div class="v2-grid v2-cols-4">${items.map(([key,label,val,sub])=>`<div class="v2-tile" data-daily-indicator="${e(label)}">${icon(key,label)}<span class="v2-label">${e(label)}</span><strong>${value(val)}</strong>${sub?`<small>${e(sub)}</small>`:''}</div>`).join('')}</div>`;
export function dailyReportTemplate(data:DailyReportData){
  const n=data.nutrition,g=data.goals;
  const bar=(key:string,label:string,unit:string,ico:string)=>{
    const total=n[key],goal=g[key],known=typeof total==='number',hasGoal=typeof goal==='number'&&goal>0;
    return `<div class="v2-nutrient" data-daily-indicator="${label}"><div>${icon(ico)}<strong>${label}</strong><span>${value(total,` ${unit}`)}</span></div>${known&&hasGoal?`<div class="v2-track"><i style="width:${Math.max(0,Math.min(100,total/goal*100))}%"></i></div>`:''}<small>${hasGoal?`${e(goal)} ${unit} target${known?' · '+Math.round(total/goal*100)+'% of saved goal':''}`:'No target set'}</small></div>`;
  };
  // Nutrition appears once, below readiness; steps stay in readiness at the top.
  const r={...(data.readiness||{})};delete r.hydration;delete r.mealProtein;
  const ready=readinessCard(Object.keys(r).length?r:null,['hydration','mealProtein']);
  const intake=card('NUTRITION · ALL MEALS & ADD-ONS','Full-day intake','protein',
    `<div class="v2-energy"><div>${icon('energy')}<span><small>DAILY ENERGY</small><strong>${value(n.calories)} <em>${typeof n.calories==='number'?'kcal':''}</em></strong></span></div><span class="v2-pill">${g.calories?`${e(g.calories)} kcal saved goal`:'No target set'}</span></div>${typeof n.calories==='number'&&g.calories>0?`<div class="v2-track v2-energy-track"><i style="width:${Math.min(100,n.calories/g.calories*100)}%"></i></div>`:''}`+
    `<div class="v2-grid v2-cols-2">${bar('protein','Protein','g','protein')}${bar('carbs','Carbs','g','energy')}${bar('fat','Fat','g','energy')}${bar('fibre','Fiber','g','protein')}</div>`+
    `<div class="v2-subhead">Other daily indicators</div>`+grid([['hydration','Water',typeof n.water==='number'?`${n.water/1000} L`:null,g.water?`Saved goal: ${g.water/1000} L`:'No target set'],['protein','Total sugar',typeof n.sugars==='number'?`${n.sugars} g`:null],['routine','Supplements',n.supplements||'None logged']])+
    note('Recorded intake through the report cutoff. Unlogged food remains unknown. Food values are estimates; macros may not exactly match reported energy.'));
  const movement=card('ACTIVITY · OUTSIDE YOUR WORKOUT','Daily movement & add-ons','steps',grid([['routine','Cardio',data.movement.cardioMinutes===null?null:`${data.movement.cardioMinutes} min`],['duration','Mobility',data.movement.mobilityMinutes===null?null:`${data.movement.mobilityMinutes} min`],['duration','Active minutes',data.movement.activeMinutes===null?null:`${data.movement.activeMinutes} min`]])+note('Steps appear in readiness above. Device totals and overlapping activities are not added together.'));
  const workoutStats=card('TRAINING · DAILY TOTALS','Workout statistics & session details','reps',stats(data.workouts.flatMap(w=>w.logs||[]),data.units)+data.workouts.map(w=>`<p class="v2-copy"><b>${e(w.dayTitle||'Workout')}</b></p>`+sessionIndicators(w,w.logs||[])).join('')+(!data.workouts.length?'<p class="v2-copy">No completed workout recorded for this day.</p>':''));
  const analysis=card('AI · SESSION REVIEW','AI Session Analysis','analysis',`<div class="v2-analysis"><p>${e(data.analysis).replace(/\n/g,'<br>')}</p></div>`);
  const exercises=data.workouts.map(w=>(data.workouts.length>1?`<h2 style="font-size:20px">${e(w.dayTitle||'Workout')}</h2>`:'')+(w.logs||[]).map((log:Row,index:number)=>exerciseCard(log,index,w.units||data.units)).join('')).join('');
  const coach=card('AI COACH · YOUR NEXT STEPS','Recommendations with context','coach',data.recommendations.map((r,i)=>`<div class="v2-recommendation"><span class="v2-number">${String(i+1).padStart(2,'0')}</span><div><h3>${e(r.title)}</h3><p>${e(r.body)}</p><small>${e(r.basis)}</small></div></div>`).join(''));
  const m=data.measurement,prior=data.previousMeasurement;
  const body=card('BODY · COMPOSITION & MEASUREMENTS','Your body, in perspective','readiness',m?
    `<div class="v2-body-feature"><div><span class="v2-label">BODY WEIGHT · ${e(m.date)}</span><strong>${value(m.weight)} <small>${e(data.units)}</small></strong><p>${prior?`Previous: ${value(prior.weight)} ${e(data.units)} · ${e(prior.date)}`:'No earlier measurement recorded'}</p></div></div>`+
    grid([['readiness','Body fat',m.bodyFat==null?null:`${m.bodyFat}%`,'Recorded estimate'],['reps','Muscle mass',m.muscleMass==null?null:`${m.muscleMass} ${data.units}`,'Recorded estimate'],['hydration','Body water',m.waterPercentage==null?null:`${m.waterPercentage}%`,'Recorded estimate'],['energy','BMR',m.bmr==null?null:`${m.bmr} kcal`,'Recorded estimate']])+
    `<div class="v2-subhead">Circumferences <span>Saved ${e(m.date)}</span></div>`+grid([...['waist','chest','hips','neck','arms','thigh','calf'].map(key=>['readiness',key==='arms'?'Upper arm':key[0].toUpperCase()+key.slice(1),m[key]==null?null:`${m[key]} ${data.units==='lb'?'in':'cm'}`,prior?.[key]!=null?`Previous: ${prior[key]} · ${prior.date}`:''] as Tile),['readiness','Height',data.height?`${data.height} cm`:null,'Saved profile']])+
    note('Latest saved measurements on or before this report date. Previous entries retain their dates. Composition and BMR are estimates; isolated changes do not establish a trend.'):'<p class="v2-copy">No body measurements were saved on or before this day.</p>');
  let html=baseTemplate(`Health OS · Daily report · ${data.date}`,ready+intake+movement+workoutStats+analysis+exercises+coach+body);
  const metadata=`<div style="margin-top:15px;font-size:12px;line-height:1.7"><strong>${e(data.weekName||'Daily review')} · ${e(data.dayName)} · ${e(data.date)}</strong><br><span style="font-size:10px;color:#686863">IST day: 00:00–23:59 · Data cutoff: ${e(data.cutoff)} IST</span></div>`;
  html=html.replace('</span></td></tr>','</span>'+metadata+'</td></tr>').replace('</head>',`<style>${DAILY_REPORT_CSS}</style></head>`);
  const text=[`Health OS · ${data.date}`,`Data cutoff: ${data.cutoff} IST`,data.analysis,'Full-day intake',...Object.entries(n).map(([key,val])=>`${key}: ${val??'Not logged'}`),'Recommendations',...data.recommendations.map(r=>`${r.title}\n${r.body}\n${r.basis}`),'Body measurements',m?JSON.stringify(m):'Not logged'].join('\n\n');
  return {html,text};
}
