import { Suspense, useState, type ReactNode } from 'react';

/** Keep the summary immediate; load optional tools only when requested. */
export function DeferredDetails({summary,children,className}:{summary:ReactNode;children:ReactNode;className?:string}) {
  const [revealed,setRevealed]=useState(false);
  return <details className={className} onToggle={event=>{if(event.currentTarget.open)setRevealed(true);}}>
    <summary>{summary}</summary>
    {revealed&&<Suspense fallback={<p role="status">Loading tools…</p>}>{children}</Suspense>}
  </details>;
}
