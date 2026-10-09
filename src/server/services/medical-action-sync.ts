import {z} from 'zod';
import {evidenceRefSchema,followupInputSchema,type DoctorQuestion,type MedicalFollowUp} from '../../shared/medical-actions.js';
import {sameContent,type CloudRecord} from '../../shared/cloud.js';
import {syncKey,type SyncRecord} from '../../shared/sync.js';
import {readMedicalActions,changeMedicalActions} from './medical-actions.js';

const followup=followupInputSchema.extend({
  id:z.string().min(1).max(150),createdAt:z.string().datetime({offset:true}),
  status:z.enum(['pending','scheduled','completed','snoozed','cancelled','overdue']),
  provenance:z.enum(['user','report','clinical_rule','doctor_instruction','system_suggestion']),
  completedAt:z.string().datetime({offset:true}).optional(),snoozedUntil:z.string().datetime({offset:true}).optional(),
  completionSourceRefs:z.array(evidenceRefSchema).max(10).optional(),
}).passthrough();
const question=z.object({id:z.string().min(1).max(150),text:z.string().trim().min(1).max(2000),
  createdAt:z.string().datetime({offset:true}),source:z.enum(['user','template']),
  sourceRefs:z.array(evidenceRefSchema).max(300),answered:z.boolean(),notes:z.string().max(4000).optional(),note:z.string().max(4000).optional(),
}).passthrough();

export function medicalActionRecords(base:Map<string,CloudRecord>,deviceId:string):SyncRecord[] {
  const state=readMedicalActions();
  const records:SyncRecord[]=[];
  for(const [entityType,rows] of [['medicalFollowUp',state.followups],['doctorQuestion',state.questions]] as const)for(const row of rows) {
    const payload=Object.fromEntries(Object.entries(row).filter(([key])=>!['candidates','sourceInvalid'].includes(key)));
    const candidate:SyncRecord={id:row.id,entityType,payload,createdAt:row.createdAt,
      updatedAt:state.updatedAt||row.createdAt,revision:1,deviceId,workspace:'medical'};
    const previous=base.get(syncKey(candidate));
    candidate.revision=previous&&sameContent(candidate,previous)?previous.revision:(previous?.revision||0)+1;
    if(previous&&sameContent(candidate,previous))candidate.updatedAt=previous.updatedAt;
    records.push(candidate);
  }
  return records;
}

/** Only persisted actions sync; derived inboxes/candidates and study consent stay local. */
export function applyMedicalActionRecord(record:CloudRecord):void {
  const type=record.entityType;
  if(type!=='medicalFollowUp'&&type!=='doctorQuestion')throw new Error('Unexpected medical action type.');
  const value=record.deletedAt?undefined:{...record.payload as object,id:record.id};
  if(value)(type==='medicalFollowUp'?followup:question).parse(value);
  changeMedicalActions(state=>{
    if(type==='medicalFollowUp') {
      state.followups=state.followups.filter(row=>row.id!==record.id);
      if(value)state.followups.push(value as MedicalFollowUp);
    }else {
      state.questions=state.questions.filter(row=>row.id!==record.id);
      if(value)state.questions.push(value as DoctorQuestion);
    }
    state.updatedAt=record.updatedAt;
  });
}
