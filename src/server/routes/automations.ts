import { Router } from 'express';
import { z } from 'zod';
import { readAutomationState, writeAutomationState } from '../services/automation-store.js';
import { runServerAutomations } from '../services/automation-runtime.js';
import { resolveInbox } from '../../shared/automation-engine.js';

export const automationsRouter=Router();
automationsRouter.get('/',(_req,res)=>res.json(readAutomationState()));
automationsRouter.post('/rebuild',(_req,res,next)=>{try{res.json(runServerAutomations(true));}catch(e){next(e);}});
automationsRouter.post('/retry',(_req,res,next)=>{try{const state=readAutomationState();for(const job of Object.values(state.jobs))if(job.status==='failed'){job.status='pending';job.nextAttemptAt=new Date().toISOString();}writeAutomationState(state);res.json(runServerAutomations());}catch(e){next(e);}});
automationsRouter.post('/inbox/:id/resolve',(req,res,next)=>{try{const input=z.object({resolution:z.enum(['accepted','modified','ignored','skip']),snoozeMinutes:z.number().min(1).max(1440).optional()}).parse(req.body),state=readAutomationState();resolveInbox(state,req.params.id,input.resolution,new Date(),input.snoozeMinutes);writeAutomationState(state);res.json({ok:true});}catch(e){next(e);}});
