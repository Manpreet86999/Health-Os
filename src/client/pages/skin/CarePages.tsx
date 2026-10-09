import { TextAreaField } from '../../components/TextAreaField';
import { useDraftState, useDraftFields } from '../../lib/use-draft';
import { DraftFeedback } from '../../components/DraftFeedback';
import { HealthOsImage } from '../../components/HealthOsImage';
import { MiniSparkline } from '../../components/VisualMetrics';
import { Calendar, StatePanel } from '../../components/DesignSystem';
import { AnalysisJobs } from '../../components/AutomaticReview';
import { useAutomations } from '../../state/AutomationContext';
import { effectiveCare } from '../../../shared/automation-care';
import { useBiology } from '../../state/BiologyContext';
import { DomainHero } from '../../components/DomainHero';
import { useEffect, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import { today } from '../../lib/utils';
import { cloudFetch } from '../../lib/cloud-api';
import { careTasksForDate, type CareArea, type CareData, type CareTask, type CareGoal, type CarePhoto } from '../../../shared/skin';

const areas: CareArea[] = ['face', 'body', 'hair', 'scalp'];
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nice = (s: string) => s[0].toUpperCase() + s.slice(1);

function useCare() {
  const originalApp = useApp();
  const bio = useBiology();
  const app = {...originalApp,skin:effectiveCare(originalApp.skin,bio.records)};
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<CareData | null>(null);
  async function save(next: CareData): Promise<CareData | null> {
    setBusy(true);
    try {
      const saved = await app.api.saveCareData({...next,events:next.events.filter(e=>!bio.records.some(r=>r.id===e.id)),checkIns:next.checkIns.filter(e=>!bio.records.some(r=>r.id===e.id))});
      const removed=bio.records.filter(r=>(r.type==='automationEvent'&&r.metadata.subtype==='careAction'&&app.skin.care.events.some(e=>e.id===r.id)&&!next.events.some(e=>e.id===r.id))||(r.type==='journal'&&r.metadata.subtype==='careObservation'&&app.skin.care.checkIns.some(e=>e.id===r.id)&&!next.checkIns.some(e=>e.id===r.id)));
      for(const record of removed) await bio.remove(record);
      setConflict(null);
      await app.refreshSkin();
      toast.push('Care saved', 'ok');
      return saved;
    } catch (error) {
      if ((error as Error & {status?:number}).status === 409) {
        try {
          const latest = await app.api.getSkin();
          setConflict(latest.care);
          await app.refreshSkin();
          toast.push('Care changed while this page was open. Your edits are still here; review or try saving again.', 'info');
        } catch (refreshError) { toast.push((refreshError as Error).message, 'err'); }
      } else {
        toast.push((error as Error).message, 'err');
      }
      return null;
    } finally { setBusy(false); }
  }
  return { ...app, care: app.skin.care, save, busy, conflict, clearConflict: () => setConflict(null) };
}

export function CareToday() {
  const { care, skin, save, busy, setPage } = useCare();
  const date = today();
  const tasks = careTasksForDate(care, date, skin.products);
  const eventFor = (id: string) => care.events.find(event => event.taskId === id && event.date === date);
  const done = tasks.filter(task => eventFor(task.id)?.status === 'done').length;
  const total = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : null;
  const sections = [
    { key: 'morning', title: 'AM routine', caption: 'Start your day', icon: '☀', tasks: tasks.filter(task => task.time === 'morning') },
    { key: 'evening', title: 'PM routine', caption: 'Wind down', icon: '☾', tasks: tasks.filter(task => task.time === 'evening') },
  ] as const;
  const flexible = tasks.filter(task => task.time === 'anytime' || task.time === 'wash');

  async function mark(taskId: string, status: 'done' | 'skipped') {
    const current = eventFor(taskId);
    const remaining = care.events.filter(event => !(event.taskId === taskId && event.date === date));
    const events = current?.status === status
      ? remaining
      : [...remaining, { id: `${taskId}:${date}`, taskId, date, status, note: '', createdAt: new Date().toISOString() }];
    await save({ ...care, events });
  }

  function stepCard(task: CareTask, index: number) {
    const event = eventFor(task.id);
    const product = skin.products.find(item => item.id === task.productId);
    return <article className={`care-step ${event?.status || ''}`} key={task.id}>
      <HealthOsImage context={{entityType:product?'product':'routine',entityId:product?.id,name:product?.name||task.label,category:task.time}}/><span className="care-step-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className="care-step-main">
        <div className="care-step-head"><h3>{task.label}</h3><span className="care-step-time">{task.minutes} min</span></div>
        <p className="care-step-context">{nice(task.area)}{product ? ' · Your product' : ' · No product needed'}</p>
        {product && <p className="care-step-product" title={product.name}>{product.name}</p>}
        {task.notes && <details className="care-step-details"><summary>How to use <span aria-hidden="true">⌄</span></summary><p>{task.notes}</p></details>}
      </div>
      <div className="care-step-actions">
        <button type="button" disabled={busy} aria-pressed={event?.status === 'done'} className={`care-action-done ${event?.status === 'done' ? 'selected' : ''}`} onClick={() => void mark(task.id, 'done')}>{event?.status === 'done' ? '✓ Done' : '✓ Mark done'}</button>
        <button type="button" disabled={busy} aria-pressed={event?.status === 'skipped'} className={`care-action-skip ${event?.status === 'skipped' ? 'selected' : ''}`} onClick={() => void mark(task.id, 'skipped')}>{event?.status === 'skipped' ? '↶ Undo skip' : 'Skip'}</button>
      </div>
    </article>;
  }

  return <div className="fade page-shell skin-os care-page care-today">
    <DomainHero section="Care" kicker="A LITTLE CARE, EVERY DAY" title="Today, at your pace." description="Your morning and evening care, clearly laid out. Open a step when you need its instructions." primary={{label:'Edit your care plan',action:()=>setPage('SkinRoutine')}} secondary={{label:'Record how it feels',action:()=>setPage('SkinCheckIn')}} metric={{value:tasks.length?done:'—',label:tasks.length?`of ${tasks.length} actions`:'No plan configured',note:'Your progress today',progress}} stats={[{label:'Planned time',value:`${total} min`},{label:'Morning actions',value:sections[0].tasks.length},{label:'Evening actions',value:sections[1].tasks.length}]}/>
    {!care.onboardingComplete && <section className="card care-callout"><h2>Make this yours</h2><p>Start with your concerns, products, time, and goals. Your plan will follow your real life.</p><button className="btn btn-hot" onClick={() => setPage('SkinGoals')}>Set up Care</button></section>}
    {care.tasks.some(task => task.productId && !skin.products.some(product => product.id === task.productId && product.status === 'active')) && <section className="card care-callout"><p>Some planned actions use paused, finished, or missing products. Update them in your Care Plan.</p></section>}
    <div className="care-routine-grid">
      {sections.map(section => {
        const sectionDone = section.tasks.filter(task => eventFor(task.id)?.status === 'done').length;
        return <section className={`care-routine-panel ${section.key}`} key={section.key} aria-labelledby={`care-${section.key}-title`}>
          <div className="care-routine-head"><span className="care-routine-icon" aria-hidden="true">{section.icon}</span><div><span className="page-eyebrow">{section.caption}</span><h2 id={`care-${section.key}-title`}>{section.title}</h2></div><span className="care-routine-count">{section.tasks.length?`${sectionDone}/${section.tasks.length} done`:'No actions planned'}</span></div>
          <div className="care-routine-body">{section.tasks.length ? section.tasks.map(stepCard) : <div className="care-routine-empty"><p>No {section.key === 'morning' ? 'AM' : 'PM'} actions scheduled today.</p><button className="btn btn-soft btn-sm" onClick={() => setPage('SkinRoutine')}>Add an action</button></div>}</div>
        </section>;
      })}
    </div>
    {flexible.length > 0 && <section className="care-routine-panel flexible"><div className="care-routine-head"><span className="care-routine-icon" aria-hidden="true">✦</span><div><span className="page-eyebrow">When it fits</span><h2>Flexible & wash day</h2></div></div><div className="care-routine-body">{flexible.map(stepCard)}</div></section>}
    <div className="care-today-footer"><button className="btn btn-soft" onClick={() => setPage('SkinCheckIn')}>Record how it feels</button><button className="btn btn-soft" onClick={() => setPage('SkinProducts')}>My products</button><button className="btn btn-soft" onClick={() => setPage('SkinReviews')}>Review progress</button></div>
  </div>;
}

export function CareGoals() {
  const { care, save, busy, setPage, conflict, clearConflict } = useCare();
  const goalsDraft=useDraftState<CareData>('care-goals',()=>structuredClone(care));
  const {value:draft,setValue:setDraft}=goalsDraft;
  const goalDraft=useDraftState('care-goal-composer',{ area: 'face' as CareArea, concern: '', desiredChange: '', baseline: '', reviewDate: '' });
  const {value:goal,setValue:setGoal}=goalDraft;
  function addGoal() { if (!goal.concern.trim()) return; setDraft(d => ({...d, goals:[...d.goals,{...goal,id:crypto.randomUUID(),status:'active'}]})); setGoal({area:'face',concern:'',desiredChange:'',baseline:'',reviewDate:''}); }
  async function saveGoals(openProducts = false, base: CareData = draft) {
    const saved = await save({ ...base, onboardingComplete: true });
    if (saved) { setDraft(structuredClone(saved)); await goalsDraft.clear(); if (openProducts) setPage('SkinProducts'); }
  }
  return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">Your starting point</span><h1 className="page-title">Goals & commitment</h1><p className="page-sub">Tell Care what matters and how much you can realistically do. You can change this later.</p></div></header>
    <DraftFeedback draft={goalsDraft}/><DraftFeedback draft={goalDraft}/><div className="grid-2"><section className="card stack"><h2>My commitment</h2><label>Minutes available each day<input className="input" type="number" min="1" max="120" value={draft.commitment.minutesPerDay} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,minutesPerDay:Number(e.target.value)}}))}/></label><label>Maximum actions per day<input className="input" type="number" min="1" max="20" value={draft.commitment.maxSteps} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,maxSteps:Number(e.target.value)}}))}/></label><label>Days available per week<input className="input" type="number" min="1" max="7" value={draft.commitment.weeklyDays} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,weeklyDays:Number(e.target.value)}}))}/></label><label>Monthly product budget<input className="input" type="number" min="0" placeholder="Optional" value={draft.commitment.budget ?? ''} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,budget:e.target.value ? Number(e.target.value) : null}}))}/></label><label>Currency<input className="input" value={draft.commitment.currency} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,currency:e.target.value.toUpperCase().slice(0,3)}}))}/></label><label className="row"><input type="checkbox" checked={draft.commitment.useOwnedFirst} onChange={e => setDraft(d => ({...d, commitment:{...d.commitment,useOwnedFirst:e.target.checked}}))}/> Use what I already own first</label><p className="subtle">Wash days</p><div className="row">{[1,2,3,4,5,6,0].map(i=>({day:days[i],i})).map(({day,i}) => <button type="button" key={day} className={`chip ${draft.commitment.washDays.includes(i) ? 'ready-ok' : ''}`} onClick={() => setDraft(d => ({...d,commitment:{...d.commitment,washDays:d.commitment.washDays.includes(i)?d.commitment.washDays.filter(x=>x!==i):[...d.commitment.washDays,i]}}))}>{day}</button>)}</div></section>
    <section className="card stack"><h2>What I want to improve</h2><label>Area<select className="input" value={goal.area} onChange={e => setGoal(g => ({...g,area:e.target.value as CareArea}))}>{areas.map(a => <option key={a} value={a}>{nice(a)}</option>)}</select></label><label>Concern<input className="input" value={goal.concern} placeholder="e.g. itchy scalp" onChange={e => setGoal(g => ({...g,concern:e.target.value}))}/></label><label>What would improvement look like?<input className="input" value={goal.desiredChange} onChange={e => setGoal(g => ({...g,desiredChange:e.target.value}))}/></label><TextAreaField label="Starting point" className="input" value={goal.baseline} onChange={e => setGoal(g => ({...g,baseline:e.target.value}))}/><label>Review date<input className="input" type="date" value={goal.reviewDate} onChange={e => setGoal(g => ({...g,reviewDate:e.target.value}))}/></label><button className="btn btn-soft" type="button" onClick={addGoal}>Add goal</button>{draft.goals.map(g => <div className="care-item" key={g.id}><div><strong>{nice(g.area)} · {g.concern}</strong><p className="subtle">{g.desiredChange || 'Track change'} · review {g.reviewDate || 'when ready'}</p></div><button className="icon-btn" aria-label={`Remove ${g.concern}`} onClick={() => setDraft(d=>({...d,goals:d.goals.filter(x=>x.id!==g.id)}))}>×</button></div>)}</section></div>
    {conflict && <section className="card care-callout" role="alert"><h2>Care changed while you were editing</h2><p>Your unsaved goals and commitment are still in this form. Choose whether to apply them over the latest Care record or load the latest saved values.</p><div className="row"><button className="btn btn-hot" disabled={busy} onClick={() => void saveGoals(false, { ...conflict, goals: draft.goals, commitment: draft.commitment })}>Save my edits over latest</button><button className="btn btn-soft" onClick={() => {setDraft(structuredClone(conflict));clearConflict();}}>Load latest values</button></div></section>}
    <div className="row"><button className="btn btn-hot" disabled={busy || !goalsDraft.ready || !goalDraft.ready || Boolean(conflict)} onClick={() => void saveGoals(true)}>Save & add my products</button><button className="btn btn-soft" disabled={busy || !goalsDraft.ready || !goalDraft.ready || Boolean(conflict)} onClick={() => void saveGoals()}>Save goals</button></div>
  </div>;
}

export function CarePlan() {
  const { care, skin, save, busy, setPage, conflict, clearConflict } = useCare();
  const planDraft=useDraftFields('care-plan',()=>({tasks:structuredClone(care.tasks),base:structuredClone(care)}));
  const [draft,setDraft]=planDraft.field('tasks');
  const [previewDay, setPreviewDay] = useState<number | null>(null);
  const editingDraft=useDraftState<string|null>('care-plan-editing-id',null);const {value:editingId,setValue:setEditingId}=editingDraft;
  const itemDraft=useDraftState('care-plan-item',{label:'',area:'face' as CareArea,productId:'',days:[] as number[],time:'morning' as CareTask['time'],minutes:2,notes:''});
  const {value:item,setValue:setItem}=itemDraft;
  const activeOn = (task: CareTask, day: number) => !task.paused && (task.days.length === 0 || task.days.includes(day)) && (task.time !== 'wash' || care.commitment.washDays.includes(day));
  const daily = days.map((_, day) => draft.filter(task => activeOn(task, day)));
  const busiest = Math.max(0, ...daily.map(tasks => tasks.reduce((sum, task) => sum + task.minutes, 0)));
  const mostActions = Math.max(0, ...daily.map(tasks => tasks.length));
  const scheduledDays = daily.filter(tasks => tasks.length > 0).length;
  const overLimit = busiest > care.commitment.minutesPerDay || mostActions > care.commitment.maxSteps || scheduledDays > care.commitment.weeklyDays;
  const shown = previewDay === null ? draft : draft.filter(task => activeOn(task, previewDay));
  const sections = [
    { key:'morning', title:'AM routine', subtitle:'Morning sequence', icon:'☀', tasks:shown.filter(task => task.time === 'morning') },
    { key:'evening', title:'PM routine', subtitle:'Evening sequence', icon:'☾', tasks:shown.filter(task => task.time === 'evening') },
    { key:'flexible', title:'Flexible & wash day', subtitle:'As needed', icon:'✦', tasks:shown.filter(task => task.time === 'anytime' || task.time === 'wash') },
  ] as const;

  function resetEditor(time: CareTask['time'] = item.time) {
    setItem({label:'',area:'face',productId:'',days:[],time,minutes:2,notes:''});
    setEditingId(null);void editingDraft.clear();
  }
  function addOrUpdate() {
    if (!item.label.trim()) return;
    if (editingId) setDraft(current => current.map(task => task.id === editingId ? {...task,...item,label:item.label.trim()} : task));
    else setDraft(current => [...current,{...item,label:item.label.trim(),id:crypto.randomUUID(),paused:false}]);
    resetEditor();
  }
  function editTask(task: CareTask) {
    setEditingId(task.id);
    setItem({label:task.label,area:task.area,productId:task.productId,days:[...task.days],time:task.time,minutes:task.minutes,notes:task.notes});
    document.getElementById('care-action-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function moveTask(id: string, direction: -1 | 1) {
    setDraft(current => {
      const index = current.findIndex(task => task.id === id);
      if (index < 0) return current;
      const peers = current.map((task, position) => ({task,position})).filter(entry => entry.task.time === current[index].time);
      const peerIndex = peers.findIndex(entry => entry.task.id === id);
      const target = peers[peerIndex + direction]?.position;
      if (target === undefined) return current;
      const next = [...current];
      [next[index],next[target]] = [next[target],next[index]];
      return next;
    });
  }
  function importLegacy() {
    const imported=skin.routines.flatMap(routine=>routine.steps.map(step=>({id:crypto.randomUUID(),label:step.label,area:'face' as CareArea,productId:step.productId,days:[] as number[],time:routine.slot==='am'?'morning' as const:'evening' as const,minutes:2,notes:step.notes||'Imported from an older AM/PM routine; check timing and instructions.',paused:Boolean(step.paused)})));
    setDraft(current=>[...current,...imported]);
  }
  async function savePlan(base: CareData = planDraft.value.base) {
    const next: CareData = {...base,tasks:draft,planHistory:[...base.planHistory,{id:crypto.randomUUID(),createdAt:new Date().toISOString(),reason:'Edited in Care Plan',tasks:draft}]};
    if (await save(next)) {await planDraft.clear();setPage('SkinOverview');}
  }
  function planCard(task: CareTask) {
    const product = skin.products.find(value => value.id === task.productId);
    return <article className={`care-plan-action ${task.paused ? 'paused' : ''}`} key={task.id}>
      <div className="care-plan-action-main"><div className="care-plan-action-title"><strong>{task.label}</strong><span>{task.minutes} min</span></div><p>{nice(task.area)} · {task.days.length ? task.days.map(day => days[day]).join(', ') : 'Every day'}{task.time === 'wash' ? ' · wash days only' : ''}</p>{product && <small title={product.name}>{product.name}</small>}{task.notes && <details><summary>Instructions</summary><p>{task.notes}</p></details>}</div>
      <div className="care-plan-action-tools"><button type="button" className="btn btn-soft btn-sm" onClick={() => editTask(task)}>Edit</button><button type="button" className="btn btn-soft btn-sm" onClick={() => setDraft(current => current.map(value => value.id === task.id ? {...value,paused:!value.paused} : value))}>{task.paused ? 'Resume' : 'Pause'}</button>{previewDay === null && <><button type="button" className="care-order-button" aria-label={`Move ${task.label} earlier`} onClick={() => moveTask(task.id,-1)}>↑</button><button type="button" className="care-order-button" aria-label={`Move ${task.label} later`} onClick={() => moveTask(task.id,1)}>↓</button></>}<button type="button" className="care-order-button danger" aria-label={`Remove ${task.label}`} onClick={() => {setDraft(current => current.filter(value => value.id !== task.id));if(editingId===task.id)resetEditor();}}>×</button></div>
    </article>;
  }

  return <div className="fade page-shell skin-os care-page care-plan-page"><DraftFeedback draft={planDraft}/><DraftFeedback draft={itemDraft}/>
    <header className="page-hero"><div><span className="page-eyebrow">Your weekly rhythm</span><h1 className="page-title">AM + PM Care Plan</h1><p className="page-sub">Build morning and evening routines separately. Preview each day before you save.</p></div><div className="care-plan-hero-actions"><button className="btn btn-hot" onClick={() => setPage('SkinAi')}>Ask Coach to build AM + PM</button><button className="btn btn-soft" onClick={() => setPage('SkinGoals')}>Edit commitment</button></div></header>
    <section className="care-plan-week"><div><span className="page-eyebrow">WEEKLY PREVIEW</span><p>See which actions will appear on a given day.</p></div><div className="care-plan-days"><button type="button" className={`care-day-chip ${previewDay === null ? 'selected' : ''}`} aria-pressed={previewDay === null} onClick={() => setPreviewDay(null)}>All week</button>{days.map((day,index)=><button type="button" key={day} className={`care-day-chip ${previewDay === index ? 'selected' : ''}`} aria-pressed={previewDay === index} onClick={() => setPreviewDay(index)}><strong>{day}</strong><small>{daily[index].length} steps</small></button>)}</div></section>
    {overLimit && <section className="card care-callout" role="alert"><strong>This plan exceeds your commitment.</strong><p>Busiest day: {busiest} minutes and {mostActions} actions. Your limits are {care.commitment.minutesPerDay} minutes, {care.commitment.maxSteps} actions, and {care.commitment.weeklyDays} days per week. This draft uses {scheduledDays} days.</p></section>}
    <div className="care-plan-layout">
      <section className="care-plan-editor" id="care-action-editor"><div className="care-plan-editor-head"><span className="page-eyebrow">{editingId ? 'EDIT ACTION' : 'BUILD YOUR ROUTINE'}</span><h2>{editingId ? 'Update this action' : 'Add an action'}</h2><p>Choose when it belongs, then add the product and days.</p></div>
        <div className="care-slot-selector" role="group" aria-label="Routine time">{([{time:'morning',label:'AM',icon:'☀'},{time:'evening',label:'PM',icon:'☾'},{time:'anytime',label:'Anytime',icon:'✦'},{time:'wash',label:'Wash day',icon:'◌'}] as const).map(slot=><button type="button" key={slot.time} aria-pressed={item.time===slot.time} className={item.time===slot.time?'selected':''} onClick={()=>setItem(current=>({...current,time:slot.time}))}><span aria-hidden="true">{slot.icon}</span>{slot.label}</button>)}</div>
        <div className="care-plan-fields"><label>Action<input className="input" placeholder="e.g. Apply sunscreen" value={item.label} onChange={event=>setItem(current=>({...current,label:event.target.value}))}/></label><div className="care-plan-field-row"><label>Area<select className="input" value={item.area} onChange={event=>setItem(current=>({...current,area:event.target.value as CareArea}))}>{areas.map(area=><option key={area} value={area}>{nice(area)}</option>)}</select></label><label>Minutes<input className="input" type="number" min="1" max="120" value={item.minutes} onChange={event=>setItem(current=>({...current,minutes:Number(event.target.value)}))}/></label></div><label>Product<select className="input" value={item.productId} onChange={event=>setItem(current=>({...current,productId:event.target.value}))}><option value="">No product / general action</option>{skin.products.filter(product=>product.status==='active').map(product=><option key={product.id} value={product.id}>{product.brand} {product.name}</option>)}</select></label><div><strong className="care-field-label">Days</strong><p className="care-field-help">Leave all unselected for every day.</p><div className="care-plan-day-picker">{days.map((day,index)=><button type="button" key={day} aria-pressed={item.days.includes(index)} className={item.days.includes(index)?'selected':''} onClick={()=>setItem(current=>({...current,days:current.days.includes(index)?current.days.filter(value=>value!==index):[...current.days,index]}))}>{day}</button>)}</div></div><TextAreaField label="How to use" className="input" rows={3} placeholder="Short, practical instructions" value={item.notes} onChange={event=>setItem(current=>({...current,notes:event.target.value}))}/><div className="care-plan-editor-actions"><button type="button" className="btn btn-hot" disabled={!item.label.trim()} onClick={addOrUpdate}>{editingId ? 'Update action' : 'Add to plan'}</button>{editingId && <button type="button" className="btn btn-soft" onClick={()=>resetEditor()}>Cancel edit</button>}</div></div>
      </section>
      <div className="care-plan-sections"><div className="care-plan-sections-intro"><span className="page-eyebrow">{previewDay === null ? 'ALL PLANNED ACTIONS' : `${days[previewDay].toUpperCase()} PREVIEW`}</span><p>{previewDay === null ? 'Use the arrows to put steps in the order you will do them.' : 'Switch to All week to edit the order or see every scheduled action.'}</p></div>{skin.routines.some(routine=>routine.steps.length>0) && <div className="care-plan-legacy"><span>Older AM/PM steps are available.</span><button className="btn btn-soft btn-sm" onClick={importLegacy}>Import older routine</button></div>}{sections.map(section=><section className={`care-plan-group ${section.key}`} key={section.key}><div className="care-plan-group-head"><span className="care-routine-icon" aria-hidden="true">{section.icon}</span><div><span className="page-eyebrow">{section.subtitle}</span><h2>{section.title}</h2></div><span className="care-routine-count">{section.tasks.length} actions</span></div><div className="care-plan-group-body">{section.tasks.length ? section.tasks.map(planCard) : <p className="care-plan-empty">Nothing scheduled {previewDay === null ? 'yet' : 'on this day'}.</p>}</div></section>)}</div>
    </div>
    {conflict && <section className="card care-callout" role="alert"><h2>The plan changed elsewhere</h2><p>Your draft is still here. Review it above, then choose which plan to keep.</p><div className="row"><button className="btn btn-hot" disabled={busy} onClick={() => void savePlan(conflict)}>Save my draft over latest</button><button className="btn btn-soft" onClick={() => {setDraft(structuredClone(conflict.tasks));clearConflict();}}>Load latest plan</button></div></section>}
    <div className="care-plan-savebar"><div><strong>{draft.length} planned actions</strong><span> · busiest day {busiest}/{care.commitment.minutesPerDay} min</span></div><div className="row"><button className="btn btn-soft" onClick={() => setPage('SkinProducts')}>My products</button><button className="btn btn-hot" disabled={busy || Boolean(conflict) || overLimit} onClick={() => void savePlan()}>Save AM + PM plan</button></div></div>
  </div>;
}

export function CareCheckInPage() {
  const { care, save, busy, setPage } = useCare();
  const checkInDraft=useDraftState('care-observation:'+today(),()=>({id:crypto.randomUUID(),date:today(),area:'face' as CareArea,concern:'',severity:'',note:''}));const {value:form,setValue:setForm}=checkInDraft;
  return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">Your observations</span><h1 className="page-title">Check-in</h1><p className="page-sub">Record only what you noticed. You can leave a rating blank.</p></div></header><section className="card stack care-form"><DraftFeedback draft={checkInDraft}/><label>Date<input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></label><label>Area<select className="input" value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value as CareArea}))}>{areas.map(a=><option key={a}>{a}</option>)}</select></label><label>What did you notice?<input className="input" placeholder="e.g. tightness, itch, fewer breakouts" value={form.concern} onChange={e=>setForm(f=>({...f,concern:e.target.value}))}/></label><label>Intensity, if useful<select className="input" value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value}))}><option value="">Not rated</option>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}/10</option>)}</select></label><TextAreaField label="Context" className="input" placeholder="What changed? Products used, weather, wash day..." value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/><button className="btn btn-hot" disabled={busy || !checkInDraft.ready || (!form.concern.trim() && !form.note.trim())} onClick={async()=>{const ok=await save({...care,checkIns:[...care.checkIns,{id:form.id,date:form.date,area:form.area,concern:form.concern.trim(),severity:form.severity?Number(form.severity):null,note:form.note.trim(),createdAt:new Date().toISOString()}]});if(ok){await checkInDraft.clear();setPage('SkinProgress');}}}>Save check-in</button></section><section className="card stack"><h2>Recent observations</h2>{[...care.checkIns].reverse().slice(0,8).map(entry=><div className="care-item" key={entry.id}><div><strong>{entry.date} · {nice(entry.area)} · {entry.concern || 'Note'}</strong><p>{entry.note}</p><p className="subtle">{entry.severity === null ? 'Not rated' : `${entry.severity}/10`}</p></div><button className="icon-btn" aria-label="Delete observation" onClick={()=>void save({...care,checkIns:care.checkIns.filter(x=>x.id!==entry.id)})}>×</button></div>)}</section></div>;
}

export function CareCalendar() {
  const { care, skin, setPage } = useCare();
  const [cursor, setCursor] = useState(() => new Date());
  const y=cursor.getFullYear(), m=cursor.getMonth();
  const [selected,setSelected]=useState(today());
  const planned=careTasksForDate(care,selected,skin.products), events=care.events.filter(e=>e.date===selected), notes=care.checkIns.filter(e=>e.date===selected);
  return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">Schedule & history</span><h1 className="page-title">Care calendar</h1><p className="page-sub">Planned care and recorded actions, with Monday as the first day.</p></div></header><div className="card stack"><Calendar cursor={cursor} selected={selected} onSelect={setSelected} onMonth={setCursor} renderDay={date=>({scheduled:careTasksForDate(care,date,skin.products).length,recorded:care.events.filter(e=>e.date===date&&e.status==='done').length})}/></div><section className="card stack"><h2>{selected} · Your day</h2>{planned.map(t=><div key={t.id} className="care-item"><strong>{t.label}</strong><span>{t.time} · {events.find(e=>e.taskId===t.id)?.status||'Planned'}</span></div>)}{!planned.length&&<StatePanel state="not-configured" title="No care planned for this day" body="Add actions to your care plan to see them here." action={<button className="btn btn-soft" onClick={()=>setPage('SkinRoutine')}>Edit plan</button>}/>} {notes.map(n=><p key={n.id}>{n.concern} · {n.note}</p>)}</section><div className="row"><button className="btn btn-soft" onClick={()=>setPage('SkinRoutine')}>Edit plan</button><button className="btn btn-soft" onClick={()=>setPage('SkinCheckIn')}>Add observation</button></div></div>;
}

export function CareProgressPage({photosOnly=false}:{photosOnly?:boolean}) {
  const { care, skin, setPage } = useCare();
  if(photosOnly)return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">Care / Photos</span><h1 className="page-title">Progress photos</h1><p className="page-sub">Your dated, local photo library and comparisons.</p></div></header><CarePhotos/></div>;
  const grouped = care.goals.map(goal=>({goal,observations:care.checkIns.filter(c=>c.area===goal.area&&(c.concern.toLowerCase().includes(goal.concern.toLowerCase())||goal.concern.toLowerCase().includes(c.concern.toLowerCase()))).sort((a,b)=>a.date.localeCompare(b.date))}));
  return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">What is changing</span><h1 className="page-title">Progress</h1><p className="page-sub">Your own observations, dates, and plan changes. Ratings are self-reported.</p></div><button className="btn btn-hot" onClick={()=>setPage('SkinCheckIn')}>New check-in</button></header><CarePhotos/>{grouped.length===0&&<section className="card care-callout"><h2>Start with a goal</h2><p>Name a concern so the timeline can show what matters to you.</p><button className="btn btn-soft" onClick={()=>setPage('SkinGoals')}>Set goals</button></section>}{grouped.map(({goal,observations})=><section className="card stack" key={goal.id}><h2>{nice(goal.area)} · {goal.concern}</h2><MiniSparkline table label={`${goal.concern} self-reported observations`} unit="/10" tone="var(--care)" points={observations.map(o=>({date:o.date,value:o.severity}))}/><p className="subtle">Starting point: {goal.baseline||'not recorded'} · Review: {goal.reviewDate||'not set'}</p>{observations.length===0?<p>No matching observations yet. Record one when you notice a change.</p>:observations.map(o=><div className="care-item" key={o.id}><strong>{o.date}</strong><div>{o.concern} {o.severity!==null&&`· ${o.severity}/10`}<p className="subtle">{o.note}</p></div></div>)}</section>)}<section className="card stack"><h2>Photo comparisons</h2><p className="subtle">Review dated photos in your private library.</p><button className="btn btn-soft" onClick={()=>setPage('SkinProgress','Photos')}>Open progress photos</button></section>{skin.logs.length>0&&<section className="card stack"><h2>Earlier skin logs</h2><p className="subtle">These ratings were self-reported in the previous skincare beta. They remain available for reference.</p>{skin.logs.slice(0,20).map(log=><div className="care-item" key={log.id}><strong>{log.date}</strong><div>{log.notes||log.concerns.join(', ')||'Routine completion'}<p className="subtle">Barrier {log.barrier??'—'} · Hydration {log.hydration??'—'} · Oiliness {log.oiliness??'—'} · Irritation {log.irritation??'—'}</p></div></div>)}</section>}<section className="card stack"><h2>Plan changes</h2>{care.planHistory.slice(-8).reverse().map(v=><p key={v.id}>{v.createdAt.slice(0,10)} · {v.reason} · {v.tasks.length} actions</p>)}{care.planHistory.length===0&&<p className="subtle">No plan changes recorded yet.</p>}</section></div>;
}

export function CareReviews() {
  const { care, skin, save, busy, setPage } = useCare();
  const reviewDraft=useDraftFields('care-review:'+today(),()=>({id:crypto.randomUUID(),decision:'continue' as 'continue'|'simplify'|'investigate'|'change',note:'',goalId:''}));
  const [decision,setDecision]=reviewDraft.field('decision'),[note,setNote]=reviewDraft.field('note'),[goalId,setGoalId]=reviewDraft.field('goalId');
  const active=care.goals.filter(g=>g.status==='active');
  const recent=care.checkIns.filter(c=>c.date>=new Date(Date.now()-28*86400000).toISOString().slice(0,10));
  const due=active.filter(g=>g.reviewDate&&g.reviewDate<=today());
  function exportSummary(){const lines=['Health OS Care summary',`Created ${new Date().toISOString()}`,'','Goals',...care.goals.map(g=>`${g.area}: ${g.concern} | baseline: ${g.baseline} | desired: ${g.desiredChange} | review: ${g.reviewDate}`),'','Products',...skin.products.filter(p=>p.status==='active').map(p=>`${p.brand} ${p.name}`),'','Recent observations',...recent.map(c=>`${c.date} ${c.area} ${c.concern} ${c.severity===null?'unrated':c.severity+'/10'} ${c.note}`),'','Reviews',...care.reviews.map(r=>`${r.date} ${r.decision}: ${r.note}`)];const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='body-os-care-summary.txt';a.click();URL.revokeObjectURL(url)}
  return <div className="fade page-shell skin-os care-page"><header className="page-hero"><div><span className="page-eyebrow">Reflect & decide</span><h1 className="page-title">Reviews</h1><p className="page-sub">Look at actual observations before changing the plan.</p></div><button className="btn btn-soft" onClick={exportSummary}>Export summary</button></header><div className="grid-3"><section className="card"><h2>{active.length}</h2><p>Active goals</p></section><section className="card"><h2>{recent.length}</h2><p>Observations in 28 days</p></section><section className="card"><h2>{due.length}</h2><p>Reviews due</p></section></div>{active.map(g=>{const observations=recent.filter(c=>c.area===g.area);return <section className="card stack" key={g.id}><h2>{nice(g.area)} · {g.concern}</h2><p>Goal: {g.desiredChange||'Observe the trend'}</p><p className="subtle">Baseline: {g.baseline||'not recorded'} · Review date: {g.reviewDate||'not set'}</p><p>{observations.length<2?'More observations are needed to judge change.':`${observations.length} observations available. Compare notes and dates before deciding whether to continue or edit your plan.`}</p><div className="row"><button className="btn btn-soft btn-sm" onClick={()=>setPage('SkinProgress')}>See observations</button><button className="btn btn-soft btn-sm" onClick={()=>setPage('SkinRoutine')}>Edit plan</button><button className="btn btn-soft btn-sm" onClick={()=>setPage('SkinAi')}>Discuss with Coach</button></div></section>})}
    <section className="card stack care-form"><h2>Record a review</h2><DraftFeedback draft={reviewDraft}/><label>Goal<select className="input" value={goalId} onChange={e=>setGoalId(e.target.value)}><option value="">General review</option>{care.goals.map(g=><option key={g.id} value={g.id}>{nice(g.area)} · {g.concern}</option>)}</select></label><label>Decision<select className="input" value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="continue">Continue plan</option><option value="simplify">Simplify plan</option><option value="investigate">Investigate further</option><option value="change">Change plan</option></select></label><div className="form-field"><label htmlFor="care-review-reason">Why?</label><textarea id="care-review-reason" className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="What do the records show? What is uncertain?"/></div><button className="btn btn-hot" disabled={busy||!reviewDraft.ready} onClick={async()=>{if(await save({...care,reviews:[...care.reviews,{id:reviewDraft.value.id,goalId,date:today(),decision,note:note.trim()}]})){reviewDraft.setValue({id:crypto.randomUUID(),decision:'continue',note:'',goalId:''});await reviewDraft.clear();}}}>Save review</button></section><section className="card stack"><h2>Review history</h2>{care.reviews.length===0&&<p className="subtle">No reviews saved yet.</p>}{[...care.reviews].reverse().map(r=><div className="care-item" key={r.id}><strong>{r.date} · {nice(r.decision)}</strong><p>{r.note||'No note'}</p></div>)}</section></div>;
}

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve,reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(image.width, image.height));
      canvas.width = Math.max(1,Math.round(image.width * scale)); canvas.height = Math.max(1,Math.round(image.height * scale));
      const context=canvas.getContext('2d'); if(!context){URL.revokeObjectURL(url);reject(new Error('Image processing is unavailable.'));return;}
      context.drawImage(image,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(url);
      for(const quality of [.7,.55,.4,.25]) {const data=canvas.toDataURL('image/jpeg',quality);if(data.length<245000){resolve(data);return;}}
      reject(new Error('Photo is too large after compression. Try a smaller image.'));
    };
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read the image.'));};
    image.src=url;
  });
}

function CarePhotos() {
  const automation=useAutomations();
  const app=useApp(); const toast=useToast();
  const [photos,setPhotos]=useState<CarePhoto[]>([]);
  const photoDraft=useDraftFields('care-photo-metadata',()=>({id:crypto.randomUUID(),area:'face' as CareArea,note:''}));
  const [area,setArea]=photoDraft.field('area'),[note,setNote]=photoDraft.field('note');
  const [busy,setBusy]=useState(false);
  const [consent,setConsent]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [observation,setObservation]=useState<{id:string;text:string}|null>(null);
  const [failedImages,setFailedImages]=useState<string[]>([]);
  async function refreshPhotos() {try{setPhotos(await app.api.listCarePhotos());setFailedImages([]);}catch(error){toast.push((error as Error).message,'err');}}
  useEffect(()=>{void refreshPhotos();},[app.api]);
  async function migratePhotos() {setBusy(true);try{const response=await cloudFetch('/api/skin/photos/migrate',{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Photo migration failed.');await refreshPhotos();toast.push(`${result.migrated} inline photos moved to private Storage`,'ok');}catch(error){toast.push((error as Error).message,'err');}finally{setBusy(false);}}
  async function upload(file:File) {
    if(busy||!photoDraft.ready)return;setBusy(true);
    try {const dataUrl=await compressPhoto(file);await app.api.saveCarePhoto({id:photoDraft.value.id,date:today(),area,dataUrl,note,createdAt:new Date().toISOString()});photoDraft.setValue({id:crypto.randomUUID(),area,note:''});await photoDraft.clear();toast.push('Photo saved to your cloud account','ok');setPhotos(await app.api.listCarePhotos());}
    catch(error){toast.push((error as Error).message,'err');}
    finally{setBusy(false);}
  }
  async function remove(id:string) {if(!confirm('Permanently delete this progress photo?'))return;try{await app.api.deleteCarePhoto(id);setPhotos(p=>p.filter(x=>x.id!==id));setSelected(ids=>ids.filter(x=>x!==id));toast.push('Photo removed','ok');}catch(error){toast.push((error as Error).message,'err');}}
  async function observe(id:string) {if(!consent)return;setBusy(true);try{const result=await app.api.observeCarePhoto(id,true);setObservation({id,text:result.observation});}catch(error){toast.push((error as Error).message,'err');}finally{setBusy(false);}}
  async function saveObservation() {if(!observation)return;const photo=photos.find(p=>p.id===observation.id);if(!photo)return;try{await app.api.saveCarePhoto({...photo,aiObservation:observation.text});setPhotos(await app.api.listCarePhotos());setObservation(null);toast.push('Observation saved','ok');}catch(error){toast.push((error as Error).message,'err');}}
  return <section className="card stack"><h2>Progress photos</h2><DraftFeedback draft={photoDraft}/><p className="subtle">Notes are protected separately. Select the photo again after reopening or a failed upload.</p><div className="row"><button className="btn btn-soft btn-sm" disabled={busy} onClick={()=>void refreshPhotos()}>Refresh photos</button><button className="btn btn-soft btn-sm" disabled={busy} onClick={()=>void migratePhotos()}>Move older inline photos to Storage</button></div><p className="subtle">Optional. Photos are saved to your private Supabase account. Keep lighting, distance, and angle consistent for useful comparisons.</p><div className="row"><select className="input" aria-label="Photo area" value={area} onChange={e=>setArea(e.target.value as CareArea)}>{areas.map(a=><option key={a}>{a}</option>)}</select><label>Photo context<input className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Lighting, angle, or context"/></label><label className="btn btn-soft">{busy?'Working…':'Add photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} style={{display:'none'}} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/></label></div><div className="care-photo-grid">{photos.map(photo=><article key={photo.id} className="care-photo">{photo.dataUrl&&!failedImages.includes(photo.id)?<img src={photo.dataUrl} alt={`${photo.area} progress on ${photo.date}`} onError={()=>setFailedImages(ids=>[...ids,photo.id])}/>:<p role="status">Preview unavailable. Refresh photos to renew access; missing originals need to be uploaded again.</p>}<strong>{photo.date} · {nice(photo.area)}</strong><p className="subtle">{photo.note||'No note'}</p>{photo.aiObservation&&<p>AI observation: {photo.aiObservation}</p>}<div className="row"><button className="btn btn-soft btn-sm" onClick={()=>setSelected(ids=>ids.includes(photo.id)?ids.filter(x=>x!==photo.id):[...ids.slice(-1),photo.id])}>{selected.includes(photo.id)?'Selected ✓':'Compare'}</button><button className="btn btn-soft btn-sm" disabled={!consent||busy} onClick={()=>void observe(photo.id)}>AI describe</button><button className="btn btn-soft btn-sm" onClick={()=>void remove(photo.id)}>Delete</button></div></article>)}</div>{selected.length===2&&<div className="care-compare">{selected.map(id=>{const photo=photos.find(p=>p.id===id);return photo?<figure key={id}><img src={photo.dataUrl} alt={`${photo.area} on ${photo.date}`}/><figcaption>{photo.date}</figcaption></figure>:null})}</div>}<label className="row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I allow the selected photo to be sent to my configured AI provider for a visual description.</label>{observation&&<div className="care-callout"><strong>Review AI observation</strong><p>{observation.text}</p><div className="row"><button className="btn btn-hot btn-sm" onClick={()=>void saveObservation()}>Save observation</button><button className="btn btn-soft btn-sm" onClick={()=>setObservation(null)}>Discard</button></div></div>}</section>;
}
