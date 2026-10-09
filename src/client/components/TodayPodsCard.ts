import * as React from 'react';
import type { FriendPod, FriendPodGoal, FriendPodMember, FriendPodCompletion } from '../lib/pods-service';
type Service={list:()=>Promise<FriendPod[]>;goals:(id:string)=>Promise<FriendPodGoal[]>;members:(id:string)=>Promise<FriendPodMember[]>;weeklyCompletions:(id:string,from:string,to:string)=>Promise<FriendPodCompletion[]>;create:(name:string)=>Promise<any>;accept:(code:string)=>Promise<any>;invite:(id:string)=>Promise<any>;addGoal:(id:string,name:string,frequency:number)=>Promise<any>;complete:(id:string,goal:string,day:string,completed:boolean)=>Promise<any>};
type Snapshot={scope:string;pods:FriendPod[];pod?:FriendPod;goals:FriendPodGoal[];members:FriendPodMember[];completions:FriendPodCompletion[]};
/** Shared, explicit Pod progress only; private health records never enter this component. */
export function TodayPodsCard({userId,project='',service,onSignIn}:{userId?:string;project?:string;service:Service;onSignIn:()=>void}){
 const scope=`${project}:${userId||'guest'}`,current=React.useRef(scope);current.current=scope;
 const [snapshot,setSnapshot]=React.useState<Snapshot>(),[selected,setSelected]=React.useState(''),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const [action,setAction]=React.useState<'join'|'create'|null>(null),[name,setName]=React.useState(''),[code,setCode]=React.useState(''),[review,setReview]=React.useState(false),[invite,setInvite]=React.useState<{scope:string;pod:string;code:string;expiresAt:string}>(),[copy,setCopy]=React.useState('');
 const [goal,setGoal]=React.useState(''),[frequency,setFrequency]=React.useState(3);
 const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const request=React.useRef(0),mounted=React.useRef(true);
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;};},[]);
 const data=snapshot?.scope===scope?snapshot:undefined;
 const refresh=async(preferred=selected)=>{
  if(!userId)return;const ticket=++request.current;setLoading(true);
  const valid=()=>mounted.current&&current.current===scope&&request.current===ticket;
  try{
   const pods=await service.list();if(!valid())return;
   const pod=pods.find(item=>item.id===preferred)||pods[0];
   const today=new Date(),start=new Date(today);start.setDate(today.getDate()-((today.getDay()+6)%7));
   const date=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
   const end=new Date(start);end.setDate(start.getDate()+6);
   const [goals,members,completions]=pod?await Promise.all([service.goals(pod.id),service.members(pod.id),service.weeklyCompletions(pod.id,date(start),date(end))]):[[],[],[]];
   if(valid()){setSnapshot({scope,pods,pod,goals,members,completions});setError('');}
  }catch(e){if(valid()){setSnapshot(undefined);setError((e as Error).message||'Pods could not connect.');}}
  finally{if(valid())setLoading(false);}
 };
 React.useEffect(()=>{
  setSnapshot(undefined);setInvite(undefined);setReview(false);setError('');setCode('');setName('');setAction(null);setBusy(false);setCopy('');
  void refresh();const wake=()=>{if(document.visibilityState==='visible')void refresh();};
  const timer=setInterval(wake,30000);window.addEventListener('health-os-sync-request',wake);window.addEventListener('focus',wake);
  return()=>{request.current++;clearInterval(timer);window.removeEventListener('health-os-sync-request',wake);window.removeEventListener('focus',wake);};
 },[scope,selected]);
 const run=async(operation:()=>Promise<void>)=>{setBusy(true);setError('');try{await operation();}catch(e){if(current.current===scope&&mounted.current)setError((e as Error).message);}finally{if(current.current===scope&&mounted.current)setBusy(false);}};
 const h=React.createElement;
 const button=(label:string,click:()=>void,disabled=false)=>h('button',{type:'button',className:'btn btn-soft',onClick:click,disabled:disabled||busy},label);
 const pod=data?.pod,owner=pod?.owner_id===userId;
 const content=!userId?h('div',null,h('p',null,'Sign in to connect with your people.'),button('Sign in for Pods',onSignIn)):
 h(React.Fragment,null,
  loading&&h('p',{role:'status',className:'subtle'},data?'Refreshing shared progress…':'Connecting to your Pods…'),
  error&&h('div',{role:'alert'},h('p',null,error),button('Retry Pods',()=>void refresh())),
  data&&h(React.Fragment,null,
   data.pods.length>1&&h('div',{className:'row wrap','aria-label':'Choose a Pod'},...data.pods.map(item=>h('button',{key:item.id,type:'button',className:'btn btn-soft','aria-pressed':pod?.id===item.id,onClick:()=>setSelected(item.id)},item.name))),
   pod?h(React.Fragment,null,
    h('div',{className:'row',style:{justifyContent:'space-between',flexWrap:'wrap'}},h('h3',null,pod.name),h('span',{className:'chip'},`${data.members.length} / 2 connected`)),
    h('p',{className:'subtle'},'This week · shared goals'),
    !data.goals.length&&h('p',null,'Add your first shared goal below.'),
    ...data.goals.map(goal=>h('article',{key:goal.id,style:{padding:'12px 0'}},h('strong',null,goal.name),...data.members.map((member,index)=>{
     const count=new Set(data.completions.filter(row=>row.goal_id===goal.id&&row.user_id===member.user_id&&row.completed).map(row=>row.day)).size;
     const label=member.user_id===userId?'You':`Member ${index+1}`;
     return h('div',{key:member.user_id,style:{marginTop:10}},h('div',{className:'row',style:{justifyContent:'space-between'}},h('span',null,label),h('strong',null,`${count} / ${goal.target_per_week} days`)),h('progress',{'aria-label':`${goal.name} · ${label}`,max:goal.target_per_week,value:Math.min(count,goal.target_per_week),style:{width:'100%',accentColor:'var(--accent,#baff32)'}}));
    }),button(data.completions.some(row=>row.goal_id===goal.id&&row.user_id===userId&&row.day===localToday()&&row.completed)?'Undo today · '+goal.name:'Mark today · '+goal.name,()=>void run(async()=>{await service.complete(pod.id,goal.id,localToday(),!data.completions.some(row=>row.goal_id===goal.id&&row.user_id===userId&&row.day===localToday()&&row.completed));await refresh();})))),
    h('details',null,h('summary',null,'Add a shared goal'),h('form',{className:'stack',onSubmit:(e:React.FormEvent)=>{e.preventDefault();void run(async()=>{await service.addGoal(pod.id,goal.trim(),frequency);if(current.current!==scope)return;setGoal('');await refresh();});}},h('label',null,'Shared goal',h('input',{className:'input',value:goal,required:true,maxLength:120,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setGoal(e.target.value)})),h('label',null,'Days per week',h('input',{type:'number',className:'input',min:1,max:7,value:frequency,required:true,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setFrequency(Number(e.target.value))})),h('button',{type:'submit',className:'btn btn-hot',disabled:busy||!goal.trim()},'Add shared goal'))),
    owner&&button(data.members.length>=2?'Pod is full':'Invite to Pod',()=>void run(async()=>{const result=await service.invite(pod.id);if(current.current===scope&&mounted.current)setInvite({...result,scope,pod:pod.id});}),data.members.length>=2),
   ):h('p',null,'No connections yet. Create a Pod or join with an invitation.'),
  ),
  h('div',{className:'row wrap',style:{gap:8,marginTop:16}},button('Join a Pod',()=>{setAction('join');setReview(false);}),button('Create a Pod',()=>setAction('create'))),
  action==='create'&&h('form',{className:'stack',onSubmit:(e:React.FormEvent)=>{e.preventDefault();void run(async()=>{const result=await service.create(name.trim());if(current.current!==scope)return;setAction(null);setName('');setSelected(result.id);await refresh(result.id);});}},h('label',null,'Pod name',h('input',{className:'input',value:name,required:true,maxLength:80,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setName(e.target.value)})),h('button',{type:'submit',className:'btn btn-hot',disabled:busy||!name.trim()},'Create connection')),
  action==='join'&&h('form',{className:'stack',onSubmit:(e:React.FormEvent)=>{e.preventDefault();if(!review){setReview(true);return;}void run(async()=>{const result=await service.accept(code);if(current.current!==scope)return;setAction(null);setCode('');setReview(false);setSelected(result.id);await refresh(result.id);});}},h('label',null,'Pod invitation code',h('input',{className:'input',value:code,maxLength:32,required:true,autoComplete:'off',onChange:(e:React.ChangeEvent<HTMLInputElement>)=>{setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,''));setReview(false);}})),review&&h('p',null,'Joining shares goal names and completion history with Pod members. Your private health records remain private.'),h('button',{type:'submit',className:'btn btn-hot',disabled:busy||code.length!==32},review?'Accept & join Pod':'Review invitation')),
  invite?.scope===scope&&invite.pod===pod?.id&&h('div',{className:'stack',style:{marginTop:16}},h('strong',null,'Your invitation'),h('code',{style:{overflowWrap:'anywhere',userSelect:'all'}},invite.code),h('small',null,`Expires ${new Date(invite.expiresAt).toLocaleString()}`),button('Copy invitation',()=>void run(async()=>{try{await navigator.clipboard.writeText(invite.code);setCopy('Invitation copied.');}catch{setCopy('Select the code above to copy it.');}})),copy&&h('p',{role:'status'},copy)),
  h('p',{className:'subtle',style:{fontSize:12,marginTop:16}},'Only shared goals and confirmed completions appear here.'),
 );
 return h('section',{className:'health-panel glass card today-pods-card','aria-label':'Your Pods',style:{padding:24,marginTop:24,border:'1px solid var(--line,var(--border-subtle,#29352c))',borderRadius:24}},h('div',{className:'row',style:{justifyContent:'space-between',alignItems:'center'}},h('h2',null,'◉ Your Pods'),h('span',{className:'chip',role:'status'},!userId?'Signed out':error?'Connection unavailable':loading?'Connecting':data?.pod?'Connected':'Ready to connect')),content);
}
