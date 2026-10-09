type WorkoutIdentity={id?:string;weekId?:string;dayKey?:string;date?:string;startedAt?:string;endedAt?:string;createdAt?:string;status?:string};
/** Saved identity wins; a planned day also supersedes older device copies with different IDs. */
export function isCompletedWorkout(draft:WorkoutIdentity|null|undefined,sessions:readonly WorkoutIdentity[]) {
 if(!draft)return false;
 return sessions.some(session=>{
  if(!['finished','completed','done'].includes(session.status||''))return false;
  if(draft.id&&session.id===draft.id)return true;
  const started=Date.parse(draft.startedAt||''),ended=Date.parse(session.endedAt||session.createdAt||'');
  return !!draft.weekId&&!!draft.dayKey&&!!draft.date&&session.weekId===draft.weekId&&session.dayKey===draft.dayKey&&session.date===draft.date&&Number.isFinite(started)&&Number.isFinite(ended)&&started<=ended;
 });
}
