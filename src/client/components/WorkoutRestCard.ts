import * as React from 'react';
export type WorkoutRestState = {deadline:number|null;remaining:number;total:number;running:boolean;card?:boolean};

/** The timer occupies its own step; the persisted deadline survives reload and backgrounding. */
export function WorkoutRestCard({state,onChange,onFinish,nextLabel,onSchedule,onCancel}:{state:WorkoutRestState;onChange:(state:WorkoutRestState)=>void;onFinish:()=>void;nextLabel:string;onSchedule?:(deadline:number)=>void;onCancel?:()=>void}) {
  const [clock,setClock]=React.useState(Date.now());
  const finished=React.useRef(false);
  const remaining=state.running&&state.deadline!==null?Math.max(0,Math.ceil((state.deadline-clock)/1000)):state.remaining;
  React.useEffect(()=>{
    const update=()=>setClock(Date.now()),timer=setInterval(update,250);update();
    window.addEventListener('health-os-resume',update);document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(timer);window.removeEventListener('health-os-resume',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  React.useEffect(()=>{if(state.running&&state.deadline!==null)onSchedule?.(state.deadline);},[state.running,state.deadline]);
  const finish=()=>{if(finished.current)return;finished.current=true;onCancel?.();onFinish();};
  React.useEffect(()=>{if(state.running&&remaining===0){navigator.vibrate?.(140);finish();}},[state.running,remaining]);
  const resume=(seconds:number)=>{const duration=Math.max(1,seconds);setClock(Date.now());onChange({...state,deadline:Date.now()+duration*1000,remaining:duration,total:Math.max(state.total,duration),running:true,card:true});};
  const button=(label:string,action:()=>void,primary=false)=>React.createElement('button',{type:'button',className:primary?'and-primary-action btn btn-hot':'and-secondary-action btn btn-soft',onClick:action},label);
  return React.createElement('section',{className:'workout-rest-card and-exercise-console',role:'region','aria-label':'Rest between sets',style:{padding:'24px',textAlign:'center',display:'grid',gap:'20px'}},
    React.createElement('p',{className:'and-eyebrow'},'SET COMPLETE'),
    React.createElement('h2',{style:{margin:0}},'Take a breath'),
    React.createElement('strong',{'aria-label':'Rest time remaining',style:{fontSize:'clamp(64px,18vw,112px)',fontVariantNumeric:'tabular-nums',lineHeight:1.15,color:'var(--accent, #c5ff3b)'}},`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`),
    React.createElement('p',{className:'subtle'},`Up next · ${nextLabel}`),
    React.createElement('div',{className:'row',style:{justifyContent:'center',gap:'12px',flexWrap:'wrap'}},
      button(state.running?'Pause rest':'Resume rest',()=>{if(state.running){onCancel?.();onChange({...state,remaining,deadline:null,running:false,card:true});}else resume(remaining);}),
      button('+15 sec',()=>{if(state.running)resume(remaining+15);else onChange({...state,remaining:remaining+15,total:Math.max(state.total,remaining+15)});})),
    button('Skip rest · continue',finish,true));
}
