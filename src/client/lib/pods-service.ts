import { activeSession } from './cloud-session';

export interface FriendPod {id:string;name:string;owner_id:string;}
export interface FriendPodGoal {id:string;pod_id:string;name:string;target_per_week:number;}
export interface FriendPodCompletion {pod_id:string;goal_id:string;user_id:string;day:string;completed:boolean;}
export interface FriendPodMember {pod_id:string;user_id:string;joined_at:string;}
/** Explicit goal metadata/completion only. Never accepts personal records or images. */
async function request(path:string,body?:unknown) {
  const session=await activeSession();
  const response=await fetch(`${session.config.url}/rest/v1/${path}`,{
    method:body===undefined?'GET':'POST',
    headers:{apikey:session.config.publishableKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),
  });
  if(!response.ok) {const error=await response.json().catch(()=>null);throw new Error(response.status===401?'Sign in again to open Pods.':response.status===403?'This Pod is unavailable.':error?.message||'Pods could not connect. Retry when online.');}
  return response.json();
}
export const friendPods={
  list:()=>request('health_os_pods?select=id,name,owner_id') as Promise<FriendPod[]>,
  goals:(pod:string)=>request(`health_os_pod_goals?select=id,pod_id,name,target_per_week&pod_id=eq.${encodeURIComponent(pod)}`) as Promise<FriendPodGoal[]>,
  members:(pod:string)=>request(`health_os_pod_members?select=pod_id,user_id,joined_at&pod_id=eq.${encodeURIComponent(pod)}`) as Promise<FriendPodMember[]>,
  weeklyCompletions:(pod:string,from:string,to:string)=>request(`health_os_pod_completions?select=pod_id,goal_id,user_id,day,completed&pod_id=eq.${encodeURIComponent(pod)}&day=gte.${encodeURIComponent(from)}&day=lte.${encodeURIComponent(to)}`) as Promise<FriendPodCompletion[]>,
  completions:(pod:string)=>request(`health_os_pod_completions?select=pod_id,goal_id,user_id,day,completed&pod_id=eq.${encodeURIComponent(pod)}`) as Promise<FriendPodCompletion[]>,
  create:(name:string)=>request('rpc/health_os_pod_action',{action:'create',args:{name}}),
  invite:(pod:string)=>request('rpc/health_os_pod_action',{action:'invite',pod}),
  accept:(code:string)=>request('rpc/health_os_pod_action',{action:'accept',args:{code}}),
  revoke:(pod:string)=>request('rpc/health_os_pod_action',{action:'revoke',pod}),
  addGoal:(pod:string,name:string,targetPerWeek:number)=>request('rpc/health_os_pod_action',{action:'goal',pod,args:{name,targetPerWeek}}),
  complete:(pod:string,goalId:string,day:string,completed:boolean)=>request('rpc/health_os_pod_action',{action:'complete',pod,args:{goalId,day,completed}}),
  leave:(pod:string)=>request('rpc/health_os_pod_action',{action:'leave',pod}),
  remove:(pod:string,memberId:string)=>request('rpc/health_os_pod_action',{action:'remove',pod,args:{memberId}}),
};
