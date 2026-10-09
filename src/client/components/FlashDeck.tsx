import { Children, useRef, useState, type ReactNode } from 'react';

/** Mounted panels preserve form values; gestures never submit a form. */
export function FlashDeck({children,label,index:controlled,onIndexChange,showNavigation=true}: {children:ReactNode;label:string;index?:number;onIndexChange?:(index:number)=>void;showNavigation?:boolean}) {
  const cards=Children.toArray(children), [local,setLocal]=useState(0), [direction,setDirection]=useState(1);
  const index=Math.min(controlled??local,Math.max(0,cards.length-1));
  const root=useRef<HTMLDivElement>(null), start=useRef<{x:number;y:number}|null>(null);
  function move(next:number) {
    if(next<0||next>=cards.length)return;
    if(next>index) {
      const panel=root.current?.querySelector('[data-active="true"]');
      const invalid=panel?.querySelector<HTMLInputElement>('input:invalid, select:invalid, textarea:invalid');
      if(invalid){invalid.reportValidity();return;}
    }
    setDirection(next>index?1:-1);setLocal(next);onIndexChange?.(next);
  }
  if(!cards.length)return <p role="status">Loading set cards…</p>;
  return <div ref={root} className="flash-deck" role="region" aria-label={label} tabIndex={0}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowLeft'){e.preventDefault();move(index-1);}if(e.key==='ArrowRight'){e.preventDefault();move(index+1);}}}
    onPointerDown={e=>{if((e.target as HTMLElement).closest('input,select,textarea,button,a'))return;start.current={x:e.clientX,y:e.clientY};if(e.pointerType==='mouse'){e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}}
    onPointerMove={e=>{const p=start.current;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){start.current=null;e.currentTarget.style.setProperty('--drag-x','0px');return;}if(Math.abs(dx)>Math.abs(dy)*1.5)e.currentTarget.style.setProperty('--drag-x',`${Math.max(-70,Math.min(70,dx))}px`);}}
    onPointerCancel={e=>{start.current=null;e.currentTarget.style.setProperty('--drag-x','0px');}}
    onPointerUp={e=>{e.currentTarget.style.setProperty('--drag-x','0px');const p=start.current;start.current=null;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)move(index+(dx<0?1:-1));}}>
    <div className="flash-meta"><span>{label}</span><span aria-live="polite">{index+1} / {cards.length}</span></div>
    <div className="flash-progress" aria-hidden="true">{cards.map((_,i)=><span key={i} className={i<=index?'filled':''}/>)}</div>
    <div className="flash-stack" style={{'--slide-direction':direction} as React.CSSProperties}>
      {cards.map((card,i)=><div key={i} hidden={i!==index} data-active={i===index} className="flash-panel">{card}</div>)}
    </div>
    {showNavigation&&<div className="flash-navigation"><button type="button" className="btn btn-soft" disabled={index===0} onClick={()=>move(index-1)}>← Back</button><span className="subtle">Swipe left to continue</span><button type="button" className="btn btn-hot" disabled={index===cards.length-1} onClick={()=>move(index+1)}>Next →</button></div>}
  </div>;
}
