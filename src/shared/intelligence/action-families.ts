import {z} from 'zod';
import {calendarDay} from './read-contracts.js';
const key={idempotencyKey:z.string().min(8).max(128)},name=z.string().trim().min(1).max(250);
export const medicalKeywords=/\b(?:prescrib\w*|diagnos\w*|medicat\w*|dosage|dose\s+change|clinical\s+cure|treatment\s+plan)\b/i;

export const intelligenceActionDefinitions={
 'training.save_program':{scope:'training.write',risk:'R2',description:'Create a reviewed multi-week program from owned saved weeks, without changing workouts or activating it.',schema:z.object({...key,name,notes:z.string().max(4000).default(''),weeks:z.array(z.object({weekId:z.string().min(1).max(150),weekNumber:z.number().int().min(1).max(52),phase:z.enum(['accumulate','intensify','deload','peak','other'])}).strict()).min(1).max(52)}).strict()},
 'experiments.create':{
  scope:'goals.write',
  risk:'R2',
  description:'Create an observational non-medical health experiment. No treatment changes or causal promises.',
  schema:z.object({
   ...key,
   name,
   hypothesis:z.string().min(1).max(2000),
   intervention:z.string().max(1000).optional(),
   metric:z.enum(['Sleep','Weight','Protein','Readiness','Soreness','Steps']),
   baseline:z.string().max(1000).optional(),
   start:calendarDay,
   baselineDays:z.number().int().min(3).max(90),
   days:z.number().int().min(3).max(90),
   successCriteria:z.string().max(1000).optional(),
   confounders:z.string().max(2000).optional(),
   notes:z.string().max(2000).optional()
  }).strict().superRefine((val,ctx)=>{
   if(medicalKeywords.test(val.hypothesis)||medicalKeywords.test(val.intervention||'')||medicalKeywords.test(val.name)){
    ctx.addIssue({code:'custom',message:'Medical treatments, medications, and diagnoses are strictly prohibited in health experiments.'});
   }
  })
 },
 'reminders.create':{
  scope:'goals.write',
  risk:'R2',
  description:'Create an owner-reviewed in-app reminder with an explicit date, time and time zone. Does not email anyone.',
  schema:z.object({
   ...key,
   name,
   note:z.string().max(1000).default(''),
   date:calendarDay,
   time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
   timeZone:z.string().min(1).max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Use a valid time zone'),
   recurrence:z.enum(['none','daily','weekly']).default('none'),
   domain:z.enum(['training','nutrition','recovery','sleep','body','care','goals']).default('goals'),
   relatedGoalId:z.string().max(150).optional(),
   relatedRunId:z.string().max(150).optional(),
   relatedActionId:z.string().max(150).optional()
  }).strict()
 },
 'reminders.complete':{
  scope:'goals.write',
  risk:'R1',
  description:'Mark an owner-reviewed in-app reminder as completed.',
  schema:z.object({
   ...key,
   reminderId:z.string().min(1).max(150),
   date:calendarDay.optional()
  }).strict()
 },
 'reports.save_period':{
  scope:'goals.write',
  risk:'R2',
  description:'Archive a deterministic cross-domain report computed from canonical observations. No model-written personal health values.',
  schema:z.object({
   ...key,
   name,
   date:calendarDay,
   days:z.number().int().min(1).max(90),
   reportType:z.enum(['weekly_health','training_review','nutrition_review','recovery_review','monthly_goal','cross_domain']).default('cross_domain'),
   runId:z.string().max(150).optional()
  }).strict()
 },
 'medical.add_note':{
  scope:'medical.write',
  risk:'R1',
  description:'Save an explicitly requested personal health note. Does not diagnose, prescribe or change treatment.',
  schema:z.object({
   ...key,
   date:calendarDay,
   note:z.string().trim().min(1).max(2000),
   provenance:z.enum(['user_reported','device_derived','imported','clinician_provided','model_observation']).default('user_reported')
  }).strict().superRefine((val,ctx)=>{
   if(medicalKeywords.test(val.note)){
    ctx.addIssue({code:'custom',message:'Personal health notes cannot diagnose, prescribe, or change medications or treatment plans.'});
   }
  })
 },
 'medical.log_symptom':{
  scope:'medical.write',
  risk:'R1',
  description:'Record an explicitly supplied symptom and severity for organizing clinician review, without diagnosis.',
  schema:z.object({
   ...key,
   date:calendarDay,
   name,
   severity:z.number().min(0).max(10),
   note:z.string().max(2000).default(''),
   provenance:z.enum(['user_reported','device_derived','imported','clinician_provided','model_observation']).default('user_reported')
  }).strict().superRefine((val,ctx)=>{
   if(medicalKeywords.test(val.name)||medicalKeywords.test(val.note)){
    ctx.addIssue({code:'custom',message:'Symptoms must be non-diagnostic observations without treatment prescriptions.'});
   }
  })
 },
} as const;

