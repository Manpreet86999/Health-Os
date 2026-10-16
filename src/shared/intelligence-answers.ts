import type {Dataset} from './automation-model.js';
import {careTasksForDate,type RoutineSlot} from './skin.js';
import {preparedWorkout} from './automation-rules.js';

export function workoutAnswer(data:Dataset,date:string,readiness:number|null){
 const plan=preparedWorkout(data,date,readiness);
 const week=data.db.weeks.find(w=>w.id===plan.weekId),day=week?.days.find(d=>d.key===plan.dayKey);
 if(!day)return {answer:`No workout is scheduled in the selected context for ${date}. Choose a training day in Plan or include Training in Context so I can show the prescription.`,evidence:[]};
 const exercises=day.exercises;
 const rows=exercises.map((exercise,i)=>{
  const details=[exercise.vol||'Sets and reps not recorded',exercise.rirTarget!==undefined?`RIR ${exercise.rirTarget}`:'',exercise.rpeTarget!==undefined?`RPE ${exercise.rpeTarget}`:'',exercise.restSec?`Rest ${exercise.restSec} sec`:'',exercise.tempo?`Tempo ${exercise.tempo}`:''].filter(Boolean);
  return `${i+1}. ${exercise.name} — ${details.join(' · ')}${exercise.notes?`\n   ${exercise.notes}`:''}`;
 });
 return {answer:[`${date} · ${day.title||day.type||'Your workout'}`,week?`${week.name}${week.weekNumber?` · Week ${week.weekNumber}`:''}`:'',day.subtitle||'',rows.length?rows.join('\n\n'):'This day has no prescribed exercises. It may be a rest day; no workout is added.',plan.reason,'This is your saved prescription. Start it in Workout when you’re ready.'].filter(Boolean).join('\n\n'),evidence:[`Saved program: ${week?.name||plan.weekId} · ${day.key}`,`${exercises.length} prescribed exercises; exercise order, sets and reps come from your saved plan.`]};
}

/** A preview from the owned shelf. Never invent product ingredients or treatment frequencies. */
export function careAnswer(data:Dataset,date:string,build:boolean){
 const skin=data.skin,products=skin.products.filter(p=>p.status==='active'&&(!p.expiresAt||p.expiresAt.slice(0,10)>=date));
 const tasks=careTasksForDate(skin.care,date,products).filter(t=>t.area==='face');
 const selected=new Set<string>();
 const section=(slot:RoutineSlot)=>{
  const saved=skin.routines.find(r=>r.slot===slot)?.steps.filter(step=>!step.paused&&products.some(p=>p.id===step.productId))||[];
  const scheduled=tasks.filter(t=>t.time===(slot==='am'?'morning':'evening')&&(!build||products.some(p=>p.id===t.productId))).sort((a,b)=>(a.order||0)-(b.order||0));
  let lines:string[]=[];
  if(saved.length){lines=saved.map(step=>{const p=products.find(p=>p.id===step.productId)!;selected.add(p.id);return `${p.name}${p.brand?` (${p.brand})`:''} — ${step.label}${step.notes?`. ${step.notes}`:''}${step.waitMin?` · Saved wait: ${step.waitMin} min`:''}`;});}
  else if(scheduled.length){lines=scheduled.map(task=>{const p=products.find(p=>p.id===task.productId);if(p)selected.add(p.id);return `${task.label}${p?` — ${p.name}${p.brand?` (${p.brand})`:''}`:''}${task.notes?`. ${task.notes}`:''}`;});}
  else if(build){
   for(const category of slot==='am'?['cleanser','moisturizer','sunscreen']:['cleanser','moisturizer']){
    const matching=products.filter(p=>p.category===category&&(p.usedIn.length===0||p.usedIn.includes(slot)));
    const p=matching[0];if(p){selected.add(p.id);lines.push(`${p.name}${p.brand?` (${p.brand})`:''} — ${category}${matching.length>1?` (alternative on your shelf: ${matching.slice(1).map(p=>p.name).join(', ')})`:''}`);}
    else lines.push(`${category[0].toUpperCase()+category.slice(1)} — no eligible product saved for ${slot.toUpperCase()}; product details needed.`);
   }
  }
  return `${slot==='am'?'AM · Morning':'PM · Evening'}\n${lines.length?lines.map((line,i)=>`${i+1}. ${line}`).join('\n\n'):'No product-linked routine is saved for this time.'}`;
 };
 const sections=[section('am'),section('pm')];
 const extra=products.filter(p=>!selected.has(p.id));
 const answer=[build?'Here is your AM/PM routine preview using your saved products. Existing product-linked steps take priority.':`Your product-linked skincare routine for ${date}.`,...sections,extra.length?`Other active products on your shelf: ${extra.map(p=>p.name).join(', ')}. I haven’t added unscheduled treatments or guessed their frequency; confirm their label directions and your current use first.`:'',products.length?'Review this preview before changing your saved Care routine. This message has not saved or completed any steps.':'Your active product shelf is empty in the selected context. Add your products in Care or include Care in Context, then ask again.'].filter(Boolean).join('\n\n');
 return {answer,evidence:[`Active, unexpired product shelf: ${products.length} products.`,...Array.from(selected).map(id=>`Saved product: ${products.find(p=>p.id===id)!.name}`)],sources:build&&products.length?[{title:'AAD: applying skin care products in order',url:'https://www.aad.org/public/everyday-care/skin-care-basics/care/apply-skin-care-certain-order',content:'General order reference; product-specific instructions come from your saved routine and product labels.'}]:[]};
}
