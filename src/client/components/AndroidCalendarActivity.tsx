import { useBiologicalData } from '../lib/use-biological-data';
import { buildTimeline, shiftDay } from '../../shared/biological-intelligence';
import { OSIcon } from './OSIcon';
export function AndroidCalendarActivity(){
  const {app,records,selectedDate:date,setSelectedDate}=useBiologicalData();
  const start=shiftDay(date,-((new Date(`${date}T12:00:00`).getDay()+6)%7));
  const week=Array.from({length:7},(_,i)=>{const day=shiftDay(start,i);return {date:day,events:buildTimeline(records,app.db!,app.skin,day)};});
  const events=week.find(day=>day.date===date)?.events||[];
  return <section className="health-panel android-calendar-activity"><div className="health-panel-heading"><h2>This Week Activity</h2><div className="row"><button aria-label="Previous week" onClick={()=>setSelectedDate(shiftDay(date,-7))}><OSIcon name="Back"/></button><button aria-label="Next week" onClick={()=>setSelectedDate(shiftDay(date,7))}><OSIcon name="Forward"/></button></div></div><div className="android-week-days">{week.map(day=><button key={day.date} aria-pressed={day.date===date} onClick={()=>setSelectedDate(day.date)}><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</small><strong>{Number(day.date.slice(-2))}</strong><small>{day.events.filter(event=>['done','logged'].includes(event.status)).length} done</small></button>)}</div><h3>{date}</h3>{events.length?events.map(event=><button className="android-recent-row" key={event.id} onClick={()=>app.setPage(event.page)}><OSIcon name={event.domain}/><span><strong>{event.title}</strong><small>{event.status} · {new Date(event.timestamp).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</small></span><OSIcon name="Forward" size={16}/></button>):<p className="subtle">No recorded or scheduled activities.</p>}</section>;
}
