import { mutationLabels, type MutationStatus } from '../../shared/ux';
export function SaveStatus({ status, detail, retry }: { status: MutationStatus; detail?: string; retry?: () => void }) {
  if (status === 'idle' && !detail) return null;
  return <div className={`ux-save-status ux-save-${status}`} role={status === 'failed' || status === 'conflict' ? 'alert' : 'status'} aria-live="polite">
    <span>{detail || mutationLabels[status]}</span>{retry && status === 'failed' && <button type="button" className="btn btn-soft" onClick={retry}>Retry</button>}
  </div>;
}
