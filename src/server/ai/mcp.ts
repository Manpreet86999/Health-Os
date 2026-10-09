import * as repo from '../db/repository.js';
import { rebuildAnalyticsMirror } from '../services/duckdb-analytics.js';
import { searchKnowledge } from '../services/knowledge.js';

/**
 * Health OS MCP surface. These tools are intentionally read-only or draft-only:
 * no filesystem, browser, shell, credentials, email, or deletion capability is exposed to an AI.
 */
const tools: any[] = [
  { type:'function', function:{ name:'bodyos__get_training_summary', description:'Read the current Health OS training summary. Never changes records.', parameters:{ type:'object', properties:{}, additionalProperties:false } } },
  { type:'function', function:{ name:'bodyos__search_exercise_history', description:'Read prior finished sets for one named exercise.', parameters:{ type:'object', properties:{ exercise:{type:'string',minLength:1,maxLength:120} }, required:['exercise'], additionalProperties:false } } },
  { type:'function', function:{ name:'bodyos__get_analytics_lab', description:'Read calculated workload and readiness trends. Never changes records.', parameters:{ type:'object', properties:{}, additionalProperties:false } } },
  { type:'function', function:{ name:'bodyos__search_knowledge', description:'Search user-approved imported documents and return source citations. Never changes records.', parameters:{ type:'object', properties:{ query:{type:'string',minLength:2,maxLength:300} }, required:['query'], additionalProperties:false } } },
  { type:'function', function:{ name:'bodyos__create_plan_draft', description:'Prepare a plan draft for user review. It cannot save the plan.', parameters:{ type:'object', properties:{ title:{type:'string',maxLength:120}, days:{type:'array',maxItems:7,items:{type:'string',maxLength:80}} }, required:['title','days'], additionalProperties:false } } },
] as const;

export async function initMcp() { console.log('[MCP] Health OS restricted tools ready.'); }
export async function getMcpTools(): Promise<any[]> { return tools; }
export async function executeMcpTool(name: string, args: Record<string, unknown>) {
  if (name === 'bodyos__get_training_summary') { const db=repo.loadAppDb(); return { sessions:db.sessions.filter(s=>s.status==='finished'||s.status==='completed').length, readiness:db.readiness.slice(-7), activeWeekId:db.meta.activeWeekId }; }
  if (name === 'bodyos__search_exercise_history') { const exercise=String(args.exercise || '').trim().toLowerCase(); return repo.loadAppDb().sessions.filter(session=>session.status==='finished'||session.status==='completed').flatMap(session=>(session.logs||[]).filter(log=>String(log.name||'').toLowerCase()===exercise).map(log=>({date:session.date,exercise:log.name,sets:log.sets||[]}))).slice(-20); }
  if (name === 'bodyos__get_analytics_lab') return rebuildAnalyticsMirror(repo.loadAppDb());
  if (name === 'bodyos__search_knowledge') return searchKnowledge(String(args.query || ''));
  if (name === 'bodyos__create_plan_draft') return { status:'draft', title:String(args.title || ''), days:Array.isArray(args.days)?args.days.map(String):[], message:'Review this draft before saving it in Planner.' };
  throw new Error('That tool is not permitted by Health OS.');
}
