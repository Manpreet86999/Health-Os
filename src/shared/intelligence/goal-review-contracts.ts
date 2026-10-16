import {z} from 'zod';
export const goalReviewDomains=['goals','training','nutrition','sleep','recovery','body','care','medical'] as const;
export const goalReviewScheduleSchema=z.object({enabled:z.boolean(),cadence:z.literal('weekly'),domains:z.array(z.enum(goalReviewDomains)).min(1).max(8),timeZone:z.string().min(1).max(100)}).strict().superRefine((schedule,ctx)=>{
 if(!schedule.domains.includes('goals')||new Set(schedule.domains).size!==schedule.domains.length)ctx.addIssue({code:'custom',path:['domains'],message:'Choose Goals and unique review domains.'});
 try{new Intl.DateTimeFormat('en',{timeZone:schedule.timeZone});}catch{ctx.addIssue({code:'custom',path:['timeZone'],message:'Choose a valid time zone.'});}
});
export type GoalReviewSchedule=z.infer<typeof goalReviewScheduleSchema>;
