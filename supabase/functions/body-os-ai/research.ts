export type Source = { title:string; url:string; excerpt:string };
export function publicUrl(value: unknown): string | null {
  try { const url=new URL(String(value)); const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:' || url.username || url.password || (url.port&&url.port!=='443') || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) || /(?:^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
export async function research(query:string, prefs:Record<string,any>): Promise<Source[]> {
  query=query.trim(); if(!query||query.length>1500) throw new Error('Enter a search question of 1–1500 characters.');
  const exact=/^https?:\/\//i.test(query);
  if(exact&&!publicUrl(query)) throw new Error('Use a public HTTPS product page.');
  let candidates:any[]=[];
  if(prefs.tavilyApiKey) {
    const response=await fetch(exact?'https://api.tavily.com/extract':'https://api.tavily.com/search',{method:'POST',headers:{Authorization:`Bearer ${prefs.tavilyApiKey}`,'Content-Type':'application/json'},body:JSON.stringify(exact?{urls:[query],extract_depth:'basic',format:'text'}:{query,max_results:5,search_depth:'basic',include_answer:false,include_raw_content:false}),signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw new Error(`Web search provider failed (${response.status}). Check your key and quota.`);
    candidates=(await response.json()).results||[];
  } else if(prefs.braveSearchApiKey&&!exact) {
    const response=await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({q:query,count:'5',safesearch:'strict'})}`,{headers:{'X-Subscription-Token':prefs.braveSearchApiKey,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error(`Web search provider failed (${response.status}). Check your key and quota.`);
    candidates=(await response.json()).web?.results||[];
  } else throw new Error(exact?'Add a Tavily key to read a public product page.':'Add a Tavily or Brave Search key in Settings → Connections.');
  return candidates.slice(0,5).map(s=>({title:String(s.title||s.url).slice(0,300),url:publicUrl(s.url)||'',excerpt:String(s.raw_content||s.content||s.description||'').slice(0,6000)})).filter(s=>s.url);
}
