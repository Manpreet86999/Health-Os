export function DraftFeedback({draft}:{draft:{status:string;persist:()=>Promise<unknown>}}){
  if(!draft.status)return null;
  const failed=/unavailable|could not|failed/.test(draft.status);
  return <div className="ux-draft-feedback"><p className="subtle" role={failed?'alert':'status'}>{draft.status}</p>{failed&&!draft.status.includes('cleanup')&&<button type="button" className="btn btn-soft" onClick={()=>void draft.persist()}>Retry draft protection</button>}</div>;
}
