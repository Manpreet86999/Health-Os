import {useEffect,useRef} from 'react';
import {useBiologicalData} from '../lib/use-biological-data';
import {dateOf} from '../../shared/biology';
import {evaluateNudges,reminderPreference} from '../../shared/biological-automations';

export function WebReminderRuntime(){
  const {app,bio,records,stored}=useBiologicalData(),shown=useRef(new Set<string>());
  useEffect(()=>{
    if(!app.db||!bio.ready)return;
    const tick=()=>{
      const pref=reminderPreference(stored);
      if(pref?.metadata.browserNotifications!==true||!('Notification'in window)||Notification.permission!=='granted')return;
      const today=dateOf(new Date().toISOString()),notified=stored.filter(r=>r.type==='automationEvent'&&r.metadata.status==='notified'&&dateOf(r.timestamp)===today);
      if(notified.length>=Number(pref.metadata.dailyLimit??3))return;
      const nudge=evaluateNudges(records,app.db!,app.skin).find(n=>!shown.current.has(n.id)&&!notified.some(r=>r.metadata.eventId===n.id));if(!nudge)return;
      shown.current.add(nudge.id);const notification=new Notification('Health OS',{body:'A gentle reminder is ready in your timeline.',icon:'/body-os-app-192-v5.png',tag:nudge.id});notification.onclick=()=>{window.focus();app.setPage('Timeline');notification.close();};
      void bio.save({id:`notification-${nudge.id}`,type:'automationEvent',domain:'Today',name:'Reminder shown',metadata:{eventId:nudge.id,status:'notified',category:nudge.kind}}).catch(()=>shown.current.delete(nudge.id));
    };
    tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer);
  },[app.db,app.skin,records,bio.ready]);
  return null;
}
