import type { ReactNode } from 'react';
export function ChartDataTable({label,columns,rows}:{label:string;columns:string[];rows:(ReactNode|null|undefined)[][]}){
  return <details className="ux-chart-data"><summary>View {label.toLowerCase()} as a table</summary><p>{rows.length?`${rows.length} observations. Missing measurements are shown as not recorded.`:'No recorded observations.'}</p><table><caption>{label}</caption><thead><tr>{columns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((value,column)=>column===0?<th scope="row" key={column}>{value??'Not recorded'}</th>:<td key={column}>{typeof value==='number'&&!Number.isFinite(value)?'Not recorded':value??'Not recorded'}</td>)}</tr>)}</tbody></table></details>;
}
