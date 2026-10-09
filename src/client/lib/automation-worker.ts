import { drainAutomationJobs, reconcileAutomations } from '../../shared/automation-engine';
import type { Dataset, AutomationState } from '../../shared/automation-model';

// Heavy deterministic work stays local and keeps the capture UI responsive.
self.onmessage=(event:MessageEvent<{data:Dataset;state:AutomationState;reconcile?:{rebuild:boolean}}>)=>{
  try{
    const {data,state,reconcile}=event.data;
    if(reconcile)reconcileAutomations(data,state,new Date(),reconcile.rebuild);
    drainAutomationJobs(data,state);
    self.postMessage({state});
  }
  catch(error){self.postMessage({error:(error as Error).message});}
};
