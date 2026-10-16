import {useBiologicalData} from './use-biological-data';
import {useCloudAccount} from '../state/CloudAccountContext';
import {executeHealthAction} from '../../shared/health-action-registry';
import {actionDefinitions,isRetainedMcpAction,type ActionId} from '../../shared/mcp-contracts';
import {today} from './utils';
/** MCP uses canonical storage directly; no assistant, model, memory or prediction runtime. */
export function useHeosExecutor(){
 const state=useBiologicalData(),cloud=useCloudAccount();
 return {executeMcp:async(action:ActionId,input:unknown,receiptId:string,_context?:unknown)=>{
  const owner=cloud.user?.id;if(!owner||!state.app.db)throw new Error('Sign in and load Health OS first.');
  const definition=actionDefinitions[action];if(!definition||!isRetainedMcpAction(action))throw new Error('Unknown HEOS tool.');
  const approved=(_context as {approved?:boolean}|undefined)?.approved;
  if(['R2','R3'].includes(definition.risk)&&!approved)throw new Error('Review and approve this action in HEOS MCP first.');
  const data={db:state.app.db,skin:state.app.skin,records:state.stored,userId:owner};
  return executeHealthAction(action,input,{
    dataset:data,today:today(),readRecords:()=>state.bio.readRecords(),saveMany:rows=>state.bio.saveMany(rows),commit:state.bio.commit,
    readWorkout:state.app.readWorkout,saveWorkout:state.app.compareAndSetWorkout,weightUnit:state.app.db.profile.units,
    saveProgram:async program=>{await state.app.api.saveProgram({...program});await state.app.refresh();},
    finishWorkout:async draft=>{const {session}=await state.app.api.saveSession({...draft,endedAt:new Date().toISOString()});await state.app.refresh();return {id:session.id};},
  },receiptId);
 }};
}
