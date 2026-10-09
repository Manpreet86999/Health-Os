/** Closed operation list: a cloud job can never choose a command, module or file path. */
export const WORKER_OPERATIONS = ['research.status','research.statistics','research.workbench','research.notebook','medical.extract','medical.units','medical.fhir','medical.cql','analytics.rebuild','voice.transcribe','report.pdf'] as const;
export type WorkerOperation = typeof WORKER_OPERATIONS[number];
export interface WorkerJob {
  id: string; user_id: string; operation: WorkerOperation; input: Record<string, any>;
  status: 'queued'|'running'|'completed'|'failed'|'cancelled'; result: any;
  error: string|null; attempts: number; created_at: string; lease_token?: string;
}
export function workerOperation(value: string): WorkerOperation {
  if (!(WORKER_OPERATIONS as readonly string[]).includes(value)) throw new Error('Unsupported worker operation.');
  return value as WorkerOperation;
}
