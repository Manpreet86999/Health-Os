import {live,type BioRecord} from '../biology.js';
import {fingerprint} from '../automation-model.js';
import {predictionSchema,evaluatePrediction} from './prediction.js';
import {recordHash,type HealthData} from './contracts.js';
import type {HealthMemory} from './memory.js';
/** Recompute historical forecast outcomes from current evidence before adapting future strategy. */
export function deriveOutcomeStrategies(data:HealthData,date:string):HealthMemory[]{
 const rows=live(data.records).filter(r=>r.userId===data.userId),groups=new Map<string,{prediction:ReturnType<typeof predictionSchema.parse>;record:BioRecord;correct:boolean;evidence:BioRecord[]}[]>();
 for(const row of rows.filter(r=>r.metadata.intelligencePrediction===true)){
  try{const prediction=predictionSchema.parse(JSON.parse(String(row.metadata.prediction)));if(prediction.userId!==data.userId||Date.parse(prediction.generatedAt)>Date.parse(date+'T23:59:59Z'))continue;const result=evaluatePrediction(prediction,data,date);if(!result||typeof result.correct!=='boolean'||!result.evidenceIds.length)continue;const evidence=result.evidenceIds.flatMap(id=>rows.filter(r=>r.id===id));if(evidence.length!==new Set(result.evidenceIds).size)continue;groups.set(prediction.type,[...(groups.get(prediction.type)||[]),{prediction,record:row,correct:result.correct,evidence}]);}catch{/* Missing or invalid observations cannot justify adaptation. */}
 }
 const memories:HealthMemory[]=[];
 for(const [type,samples] of groups){const distinct=[...new Map(samples.sort((a,b)=>a.prediction.generatedAt.localeCompare(b.prediction.generatedAt)).map(s=>[String(s.prediction.expectedOutcome.date),s])).values()].slice(-20);if(distinct.length<3)continue;const accuracy=distinct.filter(s=>s.correct).length/distinct.length,sources=[...new Map(distinct.flatMap(s=>[s.record,...s.evidence]).map(r=>[r.id,r])).values()],latest=distinct.at(-1)!;
   memories.push({id:'outcome-strategy-'+fingerprint([data.userId,type]),userId:data.userId,category:'outcome_learning',layer:'stable',type:'outcome_adapted_strategy',domain:latest.prediction.domain,summary:'Recorded outcomes '+(accuracy<.5?'have frequently contradicted':accuracy<.8?'give mixed support for':'have often supported')+' earlier '+type+' forecasts. '+(accuracy<.8?'Revisit the forecast assumptions, reduce confidence and prefer reversible options before repeating that strategy.':'Keep considering that strategy alongside current evidence and constraints.')+' This is observational feedback, not proof that an intervention caused an outcome.',value:{forecastType:type,evaluatedDates:distinct.map(s=>String(s.prediction.expectedOutcome.date)),accuracy,failedForecasts:distinct.filter(s=>!s.correct).length,strategy:accuracy<.8?'revise_assumptions':'retain_with_current_verification',causal:false},provenance:'measured_observation',verified:true,confidence:Math.min(.9,.5+distinct.length*.06),evidenceCount:distinct.length,stability:Math.max(accuracy,1-accuracy),contradictions:0,firstObserved:distinct[0].prediction.generatedAt,lastObserved:latest.record.updatedAt,sourceIds:sources.map(r=>r.id),sourceFingerprint:fingerprint(sources.map(recordHash)),status:'active'});
 }
 return memories;
}
