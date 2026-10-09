import { dateOf, waterMillilitres } from '../../shared/biology';
import { sleepStats } from '../../shared/biological-intelligence';
import { useBiologicalData } from '../lib/use-biological-data';
import { useAddFood } from './AddFood';
import { OSIcon, type OSIconName } from './OSIcon';
import { useQuickLog } from './QuickLog';

export function TodayLogGuide() {
  const {app,records,stored,selectedDate:date}=useBiologicalData(),quick=useQuickLog(),food=useAddFood();
  const day=records.filter(record=>dateOf(record.timestamp)===date);
  const steps:{id:string;title:string;detail:string;action:string;icon:OSIconName;domain:string;logged:boolean;open:()=>void}[]=[
    {id:'checkIn',title:'Check in with yourself',detail:'Record your energy, soreness and stress.',action:'Check in',icon:'Recover',domain:'Recover',logged:!!app.db?.readiness.some(row=>row.date===date),open:()=>quick.open('checkIn',stored.find(row=>row.type==='checkIn'&&dateOf(row.timestamp)===date),date)},
    {id:'sleep',title:'Log your sleep',detail:'Add the sleep that ended on this day.',action:'Log sleep',icon:'Sleep',domain:'Sleep',logged:!!sleepStats(records,date).latest,open:()=>quick.open('sleep',undefined,date)},
    {id:'meal',title:'Record a meal',detail:'Add a meal or snack you have eaten.',action:'Log meal',icon:'Eat',domain:'Eat',logged:day.some(row=>row.type==='meal'),open:()=>food.open({date})},
    {id:'water',title:'Add your water',detail:'Record water you have already had.',action:'Log water',icon:'Water',domain:'Hydration',logged:day.some(row=>row.type==='water'&&(waterMillilitres(row)??0)>0),open:()=>quick.open('water',undefined,date)},
  ];
  const pending=steps.filter(step=>!step.logged),next=pending[0];
  return <section className="health-panel web-next-log" aria-label="What to log next">
    <div className="web-next-log-heading"><h2>What to log next</h2><span>{steps.length-pending.length} / {steps.length} recorded</span></div>
    {next?<>
      <div className="web-next-log-primary" data-domain={next.domain}><span className="web-next-log-icon"><OSIcon name={next.icon} size={21}/></span><div><h3>{next.title}</h3><p>{next.detail}</p></div><button className="btn btn-hot" onClick={next.open}>{next.action}</button></div>
      <div className="web-next-log-list">{pending.slice(1).map(step=><button key={step.id} data-domain={step.domain} onClick={step.open}><OSIcon name={step.icon} size={17}/><span>{step.action}</span><OSIcon name="Arrow" size={15}/></button>)}</div>
    </>:<div className="web-next-log-complete"><OSIcon name="Done" size={22}/><div><h3>All four log types recorded</h3><p>You can keep adding meals and water, or capture a note about your day.</p><button className="btn btn-soft" onClick={()=>quick.open('journal',undefined,date)}>Add a note</button></div></div>}
    <p className="web-next-log-caption">{date===dateOf(new Date().toISOString())?'Today':new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · Suggested order. Log only what applies.</p>
  </section>;
}
