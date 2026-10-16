import { Annotation, StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import type { IntelligenceReply, AgentProposal } from '../../shared/agentic-intelligence.js';
import { agentProposalSchema } from '../../shared/agentic-intelligence.js';
import { observe, startIntelligenceSpan, telemetryContext } from '../telemetry/instrumentation.js';

export interface CheckpointStore { load(): Promise<{storage: MemorySaver['storage']; writes: MemorySaver['writes']} | undefined>; save(value: {storage: MemorySaver['storage']; writes: MemorySaver['writes']}): Promise<void>; }
export class DurableSaver extends MemorySaver {
  constructor(private store: CheckpointStore) { super(); }
  async restore() { const saved = await this.store.load(); if (saved) { this.storage = saved.storage; this.writes = saved.writes; } }
  private persist() { return this.store.save(structuredClone({ storage: this.storage, writes: this.writes })); }
  override async put(...args: Parameters<MemorySaver['put']>) { const result = await super.put(...args); await this.persist(); return result; }
  override async putWrites(...args: Parameters<MemorySaver['putWrites']>) { await super.putWrites(...args); await this.persist(); }
}
const State = Annotation.Root({ reply: Annotation<IntelligenceReply>(), approved: Annotation<boolean>(), resultRevision: Annotation<number>() });
export interface WorkflowHooks { reason(): Promise<IntelligenceReply>; execute(proposal: AgentProposal): Promise<number>; }
export async function intelligenceWorkflow(store: CheckpointStore, hooks: WorkflowHooks) {
  const saver = new DurableSaver(store); await saver.restore();
  const root = startIntelligenceSpan(), parent = telemetryContext(root);
  const graph = new StateGraph(State)
    .addNode('reason', async () => ({ reply: await observe('state.build', {}, hooks.reason, parent) }))
    .addNode('approval', state => {agentProposalSchema.parse(state.reply.proposal);return {approved:false};})
    .addNode('execute', async state => {
      if (!state.approved) return {};
      return { resultRevision: await observe('action.execute', {operation: state.reply.proposal!.tool, approved: true}, () => hooks.execute(agentProposalSchema.parse(state.reply.proposal)), parent) };
    })
    .addEdge(START, 'reason')
    .addConditionalEdges('reason', state => state.reply.proposal ? 'approval' : END)
    // Static checkpoint boundaries work in browsers without Node AsyncLocalStorage.
    .addEdge('approval', 'execute').addEdge('execute', END).compile({checkpointer: saver,interruptBefore:['execute']});
  const options = (id: string) => ({ configurable: {thread_id: id}, recursionLimit: 12, signal: AbortSignal.timeout(600000) });
  return {
    async start(id: string) { try { return (await graph.invoke({}, options(id))).reply; } finally { root.end(); } },
    async resume(id: string, approved: boolean) {
      try {
        const state = await graph.getState(options(id));
        if (!state.values.reply?.proposal || state.values.reply.proposal.id !== id) throw new Error('Workflow checkpoint is unavailable.');
        if (!state.next.length) return state.values;
        if(typeof approved!=='boolean')throw new Error('Explicit approval is required.');
        await graph.updateState(options(id),{approved},'approval');
        return await graph.invoke(null, options(id));
      } finally { root.end(); }
    },
  };
}
