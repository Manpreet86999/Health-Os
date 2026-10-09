import type { Exercise, PlannedExercise } from './types.js';

export interface SessionConstraints {minutes?:number;equipment?:string[];soreRegions?:string[];recoveryReduced?:boolean;}
/** A reviewable session proposal. Never edits the program or creates performed sets. */
export function adaptTrainingSession(original:PlannedExercise[],library:Exercise[],constraints:SessionConstraints) {
  const warnings:string[]=[],changes:string[]=[];
  const normalized=(value:string)=>value.trim().toLowerCase();
  const available=constraints.equipment?.map(normalized).filter(Boolean);
  const sore=(constraints.soreRegions||[]).map(normalized).filter(Boolean);
  const fits=(exercise:Exercise)=>!available?.length||available.includes('all')||['bodyweight','none',''].includes(normalized(exercise.equipment))||available.includes(normalized(exercise.equipment));
  const exercises:PlannedExercise[]=[];
  for(const prescription of original){
    const entry=library.find(row=>row.id===prescription.exerciseId||normalized(row.name)===normalized(prescription.name));
    const muscles=entry?.muscles||[prescription.target];
    if(sore.some(region=>muscles.some(muscle=>normalized(muscle).includes(region)||region.includes(normalized(muscle))))){changes.push(`Omit ${prescription.name}: matches your selected sore region.`);continue;}
    let proposed={...prescription};
    if(entry&&!fits(entry)){
      const substitute=entry.substitutions.map(name=>library.find(row=>row.id===name||normalized(row.name)===normalized(name))).find((row):row is Exercise=>!!row&&fits(row)&&!sore.some(region=>row.muscles.some(muscle=>normalized(muscle).includes(region))));
      if(!substitute){changes.push(`Omit ${entry.name}: no verified substitution for your equipment.`);continue;}
      proposed={...proposed,name:substitute.name,exerciseId:substitute.id,target:substitute.muscles.join(', '),trackingMode:substitute.trackingMode||'weight_reps',percent1rm:undefined};
      changes.push(`Replace ${entry.name} with ${substitute.name}; choose a suitable starting load.`);
    }else if(!entry&&available?.length){warnings.push(`Equipment for ${prescription.name} is unknown. Verify it before starting.`);}
    if(constraints.recoveryReduced){proposed={...proposed,vol:proposed.vol.replace(/^(\d+)\s*[×x]/i,(_match,count)=>`${Math.max(1,Number(count)-1)} x`),rirTarget:Math.min(5,Number(proposed.rirTarget??2)+1)};}
    exercises.push(proposed);
  }
  const estimate=(rows:PlannedExercise[])=>Math.round(rows.reduce((total,row)=>{const sets=Number(/^(\d+)\s*[×x]/i.exec(row.vol)?.[1])||3;return total+sets*(45+Math.max(0,Number(row.restSec??90)))/60+2;},0));
  if(constraints.minutes!==undefined){if(!Number.isFinite(constraints.minutes)||constraints.minutes<5||constraints.minutes>240)throw new RangeError('Available time must be 5–240 minutes.');while(exercises.length&&estimate(exercises)>constraints.minutes){const removed=exercises.pop()!;changes.push(`Omit ${removed.name} to fit the selected time.`);}}
  if(constraints.recoveryReduced)changes.unshift('Reduce each exercise by one set (minimum one) and add one target RIR.');
  if(!exercises.length)warnings.push('No session fits these constraints. Choose rest or revise your constraints.');
  return {original:original.map(row=>({...row})),proposed:exercises,changes,warnings,estimatedMinutes:estimate(exercises),limitations:['Duration is an estimate from sets, rest and transitions.','This proposal is not treatment for pain or injury.','Your saved program stays unchanged.']};
}
