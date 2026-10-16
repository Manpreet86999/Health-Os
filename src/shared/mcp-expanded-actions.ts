import {dailyNutrition,dailyNutritionRecord} from './biology.js';
import {nutritionTotalWrite} from './daily-nutrition.js';
import {actionDefinitions,describeMcpCapabilities,McpDomainError,type ActionId} from './mcp-contracts.js';
import {expandedActionDefinitions,reversibleMcpActions} from './mcp-expanded-contracts.js';
import {dateOf,readiness,sleepDurationHours,waterMillilitres,type BioRecord} from './biology.js';
import {shiftDay,summarizeRange,goalProgress} from './biological-intelligence.js';
import {recordHash} from './intelligence/contracts.js';
import {effectiveBiology} from './legacy-biology.js';
import {emptySkinState,careTasksForDate} from './skin.js';
import {isFinishedSession} from './training.js';
import {recordFood,recalculate,confidenceDecision,serializeItems,sumNutrition,parseLocalText,personalFoods,resolveCandidates} from './food-intelligence.js';
import {fingerprint} from './automation-model.js';
import {nutrientKeys} from './food-capture-schema.js';
import type {HealthActionServices,ActionRecord} from './health-action-registry.js';

const nutritionKeys=['calories','protein','carbs','fat','fibre','water'] as const;
const pick=(metadata:BioRecord['metadata'],keys:readonly string[])=>Object.fromEntries(keys.filter(k=>metadata[k]!==undefined).map(k=>[k,metadata[k]]));
const observation=(r:BioRecord)=>({id:r.id,revision:r.revision,date:dateOf(r.timestamp),timestamp:r.timestamp,name:r.name,value:r.value??null,unit:r.unit,source:r.source});
const prescribe=(e:any)=>({name:e.name,target:e.target,prescription:e.vol,trackingMode:e.trackingMode||'weight_reps',rirTarget:e.rirTarget,rpeTarget:e.rpeTarget,restSec:e.restSec});
const sets=(rows:any[])=>rows.map(s=>({setNumber:s.s,weight:s.w,reps:s.r,seconds:s.durationSec,rpe:s.rpe,rir:s.rir,type:s.type,side:s.side,trackingMode:s.trackingMode}));
function page<T>(rows:T[],input:any){const offset=input.offset||0,limit=input.limit||30;return {items:rows.slice(offset,offset+limit),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null};}
export function nonMedicalPeriod(services:HealthActionServices,records:BioRecord[],date:string,days:number){
 const safe=records.filter(r=>['sleep','vital','meal','water','checkIn','nutritionDay','nutritionTarget','bodyMeasurement'].includes(r.type)&&r.domain!=='Health');
 const {careAdherence,supplementAdherence,...report}=summarizeRange(safe,services.dataset.db,emptySkinState(),shiftDay(date,-days+1),date);
 return {...report,coverage:{sleepDays:report.series.filter(r=>r.Sleep!==null).length,weightDays:report.weight.points.filter(r=>r.date>=report.from&&r.date<=date).length,nutritionDays:report.nutritionDays,completeNutritionDays:report.completeNutritionDays},limitations:['Missing observations remain unknown. Logged nutrition is not necessarily a complete day. Observational patterns do not establish causes.']};
}

/** Bounded typed reads; no generic record export or raw medical/document access. */
export function readExpandedAction(id:ActionId,input:any,services:HealthActionServices,records:BioRecord[],date:string):unknown|undefined{
 if(!(id in expandedActionDefinitions)||actionDefinitions[id].risk!=='R0')return undefined;
 const data=services.dataset,to=input.to||date,from=input.from||shiftDay(to,-(input.days||28)+1);
 if(from>to||to>date||(Date.parse(to)-Date.parse(from))/86400000>365)throw new McpDomainError('INVALID_INPUT','Choose a past history window of at most 366 days.');
 const within=(r:BioRecord)=>dateOf(r.timestamp)>=from&&dateOf(r.timestamp)<=to;
 const sorted=(rows:BioRecord[])=>rows.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||b.id.localeCompare(a.id));
 let result:unknown;
 switch(id){
  case 'health.get_capabilities': result=describeMcpCapabilities();break;
  case 'recovery.get_readiness':result={date,...readiness(effectiveBiology(data.db,records),date)};break;
  case 'recovery.get_history':result=page(sorted(records.filter(r=>r.type==='recoveryNote'&&within(r))).map(r=>({...observation(r),...pick(r.metadata,['region','severity','notes','category'])})),input);break;
  case 'nutrition.get_history':{const dates=[...new Set(records.filter(r=>['meal','water','nutritionDay'].includes(r.type)&&within(r)).map(r=>dateOf(r.timestamp)))].sort().reverse();result=page(dates.map(date=>({date,...dailyNutrition(records,date)})),input);break;}
  case 'nutrition.get_meals':result=page(sorted(records.filter(r=>r.type==='meal'&&within(r)&&(!input.meal||r.metadata.meal===input.meal))).map(r=>({...observation(r),...pick(r.metadata,[...nutritionKeys,'meal','completeDay'])})),input);break;
  case 'nutrition.get_water':{const rows=records.filter(r=>r.type==='water'&&dateOf(r.timestamp)===date);result={date,totalMl:dailyNutrition(records,date).water,entryCount:rows.length,entries:rows.map(r=>({...observation(r),millilitres:waterMillilitres(r)}))};break;}
  case 'nutrition.search_foods':result=records.filter(r=>['food','recipe'].includes(r.type)&&r.name.toLowerCase().includes(input.query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,input.limit).map(r=>({...observation(r),type:r.type,nutrition:pick(r.metadata,nutritionKeys),basis:'Recorded saved profile; use Food Intelligence to calculate a portion.'}));break;
  case 'nutrition.get_meal_plans':result=sorted(records.filter(r=>r.type==='mealPlan'&&r.metadata.date===date)).map(r=>({...observation(r),...pick(r.metadata,['date','meal','recipeId','portions','time','confirmed','mealId'])}));break;
  case 'sleep.get_history':result=page(sorted(records.filter(r=>r.type==='sleep'&&within(r))).map(r=>({...observation(r),hours:sleepDurationHours(r),...pick(r.metadata,['quality','nap','bedtime','wake'])})),input);break;
  case 'body.get_measurements':result=page(sorted(records.filter(r=>r.type==='bodyMeasurement'&&r.domain==='Body'&&within(r))).map(r=>({...observation(r),...pick(r.metadata,['metric','waist','chest','hips','neck','upperArm','thigh','calf'])})),input);break;
  case 'body.get_history':result=page(sorted(records.filter(r=>r.type==='vital'&&r.metadata.metric===input.metric&&r.domain!=='Health'&&within(r))).map(observation),input);break;
  case 'goals.get_progress':{const goal=records.find(r=>r.type==='goal'&&r.id===input.goalId);if(!goal)throw new McpDomainError('NOT_FOUND','This goal is unavailable.');const windowDays=Math.max(1,Math.min(90,Math.floor(Number(goal.metadata.windowDays)||7)));result={goalId:goal.id,revision:goal.revision,name:goal.name,date,...pick(goal.metadata,['metric','target','direction','status']),windowDays,...goalProgress({...goal,metadata:{...goal.metadata,windowDays}},records,data.db,emptySkinState(),date)};break;}
  case 'habits.get_today':result=records.filter(r=>r.type==='habit'&&r.metadata.status!=='archived').map(r=>{const done=sorted(records.filter(d=>d.type==='habitDone'&&d.metadata.parentId===r.id&&dateOf(d.timestamp)===date))[0];return {id:r.id,revision:r.revision,name:r.name,date,completed:!!done&&done.metadata.completed!==false};});break;
  case 'training.get_history':result=page(data.db.sessions.filter(s=>isFinishedSession(s)&&s.date>=from&&s.date<=to).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).map(s=>({id:s.id,date:s.date,name:s.dayTitle,status:s.status,units:data.db.profile.units,exercises:s.logs.map(l=>({name:l.name,target:l.target,status:l.status,sets:sets(l.sets)}))})),input);break;
  case 'training.get_program':{const w=data.db.weeks.find(w=>w.id===data.db.meta.activeWeekId);result=w?{id:w.id,name:w.name,weekNumber:w.weekNumber,startDate:w.startDate,days:w.days.map(d=>({key:d.key,title:d.title,type:d.type,exercises:d.exercises.map(prescribe)}))}:null;break;}
  case 'care.get_today':result={date,tasks:careTasksForDate(data.skin.care,date,data.skin.products).map(task=>({id:task.id,name:task.label,area:task.area,time:task.time,minutes:task.minutes}))};break;
  case 'reports.get_period':result=nonMedicalPeriod(services,records,date,input.days);break;
  default:return undefined;
 }
 return {success:true,data:result};
}

/** Mutations and their receipts share the existing atomic record/outbox transaction. */
export async function writeExpandedAction(id:ActionId,input:any,services:HealthActionServices,records:BioRecord[],date:string,receiptId:string):Promise<unknown|undefined>{
 if(!(id in expandedActionDefinitions)||actionDefinitions[id].risk==='R0'||id.startsWith('training.'))return undefined;
 const recordId=`mcp-result-${receiptId}`,auditId=`mcp-receipt-${receiptId}`,timestamp=new Date(`${date}T12:00:00`).toISOString();
 const writes:ActionRecord[]=[],expectations:{id:string;revision:number|null;fingerprint?:string}[]=[];
 const source=(recordId:string,type:BioRecord['type'],revision?:number)=>{const row=records.find(r=>r.id===recordId&&r.type===type);if(!row)throw new McpDomainError('NOT_FOUND','The saved source is unavailable.');if(revision!==undefined&&row.revision!==revision)throw new McpDomainError('CONFLICT','This record changed. Read it again before proposing a correction.');expectations.push({id:row.id,revision:row.revision,fingerprint:recordHash(row)});return row;};
 const add=(type:BioRecord['type'],domain:BioRecord['domain'],name:string,metadata:BioRecord['metadata'],value?:number,unit?:string)=>writes.push({id:recordId,type,domain,name,timestamp,metadata,value,unit,source:'HEOS MCP'});
 const preserve=(row:BioRecord,patch:Partial<ActionRecord>)=>writes.push({...row,...patch});
 const resolveMeal=(text:string,meal:string)=>{const items=resolveCandidates(parseLocalText(text),personalFoods(records),records,meal).map(recalculate);if(!items.length||items.some(i=>i.error||confidenceDecision(i).blockingFields.length))throw new McpDomainError('DOMAIN_REJECTED','Review the food identity and portion in Eat before logging.');return items;};
 let noChange=false;
 switch(id){
  case 'nutrition.set_daily_totals':{const {date:ignored,idempotencyKey,...totals}=input;const row=nutritionTotalWrite(records,date,totals),old=dailyNutritionRecord(records,date);expectations.push({id:row.id,revision:old?.revision??null,...(old?{fingerprint:recordHash(old)}:{})});writes.push(row);break;}
  case 'nutrition.log_water':{const amount=waterMillilitres({value:input.amount,unit:input.unit});if(amount===null||amount<1||amount>20000)throw new McpDomainError('INVALID_INPUT','Water must be between 1 and 20000 mL after unit conversion.');add('water','Recover','Water',{},amount,'mL');break;}
  case 'sleep.log_session':add('sleep','Recover',input.nap?'Sleep nap':'Sleep session',pick(input,['quality','nap','bedtime','wake']),input.hours,'hours');break;
  case 'body.log_measurement':{const value=input.unit==='in'?input.value*2.54:input.value;if(value>400)throw new McpDomainError('INVALID_INPUT','Measurement exceeds 400 cm after conversion.');const metricKeys:Record<string,string>={Waist:'waist',Chest:'chest',Hips:'hips',Neck:'neck','Upper arm':'upperArm',Thigh:'thigh',Calf:'calf'};add('bodyMeasurement','Body',`${input.metric} measurement`,{metric:input.metric,[metricKeys[input.metric]]:value},value,'cm');break;}
  case 'body.log_steps':{const old=records.filter(r=>r.type==='vital'&&r.domain==='Body'&&r.metadata.metric==='Steps'&&r.metadata.mcpDailyTotal===true&&dateOf(r.timestamp)===date).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(old){source(old.id,'vital');preserve(old,{value:input.steps});}else add('vital','Body','Steps',{metric:'Steps',mcpDailyTotal:true},input.steps,'steps');break;}
  case 'recovery.log_check_in':add('checkIn','Recover','Daily check-in',pick(input,['energy','soreness','stress','motivation','mood','notes']));break;
  case 'recovery.add_note':add('recoveryNote','Recover','Recovery note',{date,notes:input.note,category:'note'});break;
  case 'nutrition.plan_recipe':{const recipe=source(input.recipeId,'recipe');add('mealPlan','Eat',recipe.name,{date,meal:input.meal,recipeId:recipe.id,portions:input.portions,time:input.time,confirmed:false});break;}
  case 'nutrition.confirm_planned_meal':{
   const plan=source(input.planId,'mealPlan',input.expectedRevision);if(plan.metadata.confirmed===true)throw new McpDomainError('CONFLICT','This planned meal was already logged.');
   const portions=Number(plan.metadata.portions),planDate=String(plan.metadata.date);if(!Number.isFinite(portions)||portions<=0||portions>20||!/^\d{4}-\d{2}-\d{2}$/.test(planDate)||!Number.isFinite(Date.parse(planDate))||new Date(planDate).toISOString().slice(0,10)!==planDate||!['Breakfast','Lunch','Dinner','Snacks'].includes(String(plan.metadata.meal)))throw new McpDomainError('DOMAIN_REJECTED','Review the saved plan’s date, meal and portion in Eat.');
   const recipe=source(String(plan.metadata.recipeId),'recipe'),food=recordFood(recipe),item=recalculate({id:recordId,name:recipe.name,foodId:food.id,food,amount:portions,unit:'serving',identityConfidence:1,portionConfidence:1,confirmed:true,alternatives:[],snapshot:{},profile:null});
   if(item.error||confidenceDecision(item).blockingFields.length)throw new McpDomainError('DOMAIN_REJECTED','Review this recipe’s saved food profile and portion in Eat.');
   add('meal','Eat',recipe.name,{...sumNutrition([item.snapshot]),meal:plan.metadata.meal,foodItems:serializeItems([item]),confirmedPlanId:plan.id,planId:plan.id,captureModality:'mcp',completeDay:false});writes[0].timestamp=new Date(`${planDate}T12:00:00`).toISOString();preserve(plan,{metadata:{...plan.metadata,confirmed:true,mealId:recordId}});break;
  }
  case 'nutrition.set_targets':{const target=records.filter(r=>r.type==='nutritionTarget').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(target){source(target.id,'nutritionTarget');preserve(target,{metadata:{...target.metadata,...pick(input,nutritionKeys)}});}else add('nutritionTarget','Eat','Daily nutrition targets',pick(input,nutritionKeys));break;}
  case 'nutrition.mark_day_complete':{const old=records.find(r=>r.type==='nutritionDay'&&dateOf(r.timestamp)===date);if(old){source(old.id,'nutritionDay');preserve(old,{metadata:{...old.metadata,complete:true}});}else add('nutritionDay','Eat','Nutrition day complete',{complete:true});break;}
  case 'nutrition.correct_meal':{const previous=source(input.recordId,'meal',input.expectedRevision),items=resolveMeal(input.text,input.meal),replace=new Set<string>([...nutrientKeys,'foodId','foodItems','nutritionProfiles','confirmedPlanId','planId','repeatedFrom']);const metadata=Object.fromEntries(Object.entries(previous.metadata).filter(([k])=>!replace.has(k)));preserve(previous,{name:items.map(i=>i.name).join(' · ').slice(0,250),source:'Health OS Food Intelligence',metadata:{...metadata,...sumNutrition(items.map(i=>i.snapshot)),meal:input.meal,foodItems:serializeItems(items),captureModality:'mcp'}});break;}
  case 'body.correct_weight':{const previous=source(input.recordId,'vital',input.expectedRevision);if(previous.metadata.metric!=='Weight'||previous.domain==='Health')throw new McpDomainError('DOMAIN_REJECTED','Only a non-medical weight record can be corrected with this tool.');preserve(previous,{value:input.weight,unit:input.unit});break;}
  case 'goals.create':add('goal','Today',input.name,{...pick(input,['metric','target','direction','windowDays','objective']),status:'active',startDate:date});break;
  case 'goals.update':{const goal=source(input.goalId,'goal',input.expectedRevision);preserve(goal,{name:input.name||goal.name,metadata:{...goal.metadata,...pick(input,['target','status'])}});break;}
  case 'goals.log_progress':{const goal=source(input.goalId,'goal');if(goal.metadata.metric!=='Custom'||['archived','completed'].includes(String(goal.metadata.status)))throw new McpDomainError('DOMAIN_REJECTED','Log progress only for an active Custom goal.');add('goalCheckIn','Today',`${goal.name} progress`.slice(0,250),{parentId:goal.id,notes:input.note||''},input.value,goal.unit);break;}
  case 'habits.create':add('habit','Today',input.name,{description:input.description||'',status:'active'});break;
  case 'habits.complete':{const habit=source(input.habitId,'habit');if(habit.metadata.status==='archived')throw new McpDomainError('DOMAIN_REJECTED','This habit is archived.');const done=records.filter(r=>r.type==='habitDone'&&r.metadata.parentId===habit.id&&dateOf(r.timestamp)===date).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(done&&done.metadata.completed!==false){noChange=true;break;}if(done){source(done.id,'habitDone');preserve(done,{metadata:{...done.metadata,completed:true}});}else add('habitDone','Today',`${habit.name} completed`.slice(0,250),{parentId:habit.id,completed:true});break;}
  default:return undefined;
 }
 const undoable=(reversibleMcpActions as readonly string[]).includes(id)&&writes.length===1&&writes[0].id===recordId;
 const result={success:true,actionReceiptId:receiptId,summary:noChange?'This habit was already completed.':`Saved ${writes[0].name}.`,changedRecords:writes.map(r=>({id:r.id,type:r.type})),warnings:[],requiresUserAttention:false,undoable};
 const first=writes[0],receipt:ActionRecord={id:auditId,type:'journal',domain:'Today',name:'MCP action receipt',metadata:{mcpReceipt:true,action:id,result:JSON.stringify(result),...(first?{recordFingerprint:fingerprint({type:first.type,name:first.name,value:first.value,unit:first.unit||'',metadata:first.metadata})}:{})}};
 if(services.commit){const checked=new Set(expectations.map(e=>e.id));for(const row of [...writes,receipt])if(!checked.has(row.id)){const old=records.find(r=>r.id===row.id);expectations.push(old?{id:old.id,revision:old.revision,fingerprint:recordHash(old)}:{id:row.id,revision:null});}await services.commit([...writes,receipt],[],expectations);}
 else{if(expectations.length)throw new McpDomainError('UPSTREAM_UNAVAILABLE','The transactional record service is unavailable.',true);await services.saveMany([...writes,receipt]);}
 return result;
}
