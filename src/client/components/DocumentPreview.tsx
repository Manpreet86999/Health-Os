import type { MedicalReport } from '../../shared/medical';
import { OSIcon } from './OSIcon';

/** Compact preview of actual extracted content, without fetching every original. */
export function DocumentPreview({report}:{report:MedicalReport}) {
  return <div className="document-preview" role="img" aria-label={`${report.title}, extracted document preview, ${report.results.length} results, ${report.status}`}>
    <OSIcon name="Report" size={20}/><strong>{report.category.toUpperCase()}</strong>
    {report.results.length?report.results.slice(0,3).map(r=><div key={r.id}><small>{r.name}</small><strong>{r.comparator||''}{r.value??r.valueText??'—'} {r.unit}</strong></div>):<small>{report.narrative.slice(0,65)||'Original document'}</small>}
  </div>;
}
