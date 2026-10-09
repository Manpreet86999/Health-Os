// Ephemeral handoff to a lazy search route. Never persisted or put in the URL.
let pending:string|undefined;
export function queueRecordSearch(query:string){pending=query;window.dispatchEvent(new CustomEvent('health-os-search-query',{detail:query}));}
export function takeRecordSearch(){const query=pending;pending=undefined;return query;}
