/** Public labels and search synonyms. Stored route IDs remain backwards compatible. */
export const terminology = {
  Today:{label:'Today',aliases:['home','daily overview']},
  Train:{label:'Train',aliases:['training','workout','exercise']},
  Eat:{label:'Eat',aliases:['nutrition','food','meals','fuel']},
  Recover:{label:'Recover',aliases:['recovery','readiness','rest']},
  Sleep:{label:'Sleep',aliases:['bedtime','wake','sleep history']},
  Health:{label:'Health',aliases:['medical','labs','vitals','medication','CBC']},
  Body:{label:'Body',aliases:['weight','measurements','composition']},
  Care:{label:'Care',aliases:['skin','hair','dental','routine']},
  Insights:{label:'Insights',aliases:['analytics','trends','baselines','correlations']},
  Pods:{label:'Pods',aliases:['friends','accountability','shared goals']},
  Reports:{label:'Reports',aliases:['report studio','export','doctor summary','weekly report']},
  Log:{label:'Log',aliases:['quick capture','universal log','record','add']},
} as const;
export function searchTerms(text:string) {
  return text.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
}
export function matchesSearch(query:string,text:string) {
  const expanded=[text,...Object.values(terminology).filter(term=>searchTerms(text).includes(term.label.toLowerCase())).flatMap(term=>[...term.aliases])].join(' ');
  const words=searchTerms(expanded);
  return searchTerms(query).filter(word=>!['open','show','find','last','latest','recent','my','the'].includes(word)).every(word=>words.some(candidate=>candidate.startsWith(word)));
}
