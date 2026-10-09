/** Opt-in, memory-only measurements; export contains no event targets, URLs or health data. */
type Samples={startedAt:string;lcpMs:number|null;cls:number|null;inpMs:number|null;viewportWidth:number;viewportHeight:number};
let sample:Samples|null=null,active=false,initialized=false;
const latest={lcpMs:null as number|null,cls:null as number|null,inpMs:null as number|null};
export async function startUxDiagnostics(){
  active=true;sample={startedAt:new Date().toISOString(),...latest,viewportWidth:innerWidth,viewportHeight:innerHeight};
  if(initialized)return;initialized=true;
  try{
    const {onLCP,onCLS,onINP}=await import('web-vitals');
    const record=(field:keyof typeof latest)=>(metric:{value:number})=>{latest[field]=metric.value;if(active&&sample)sample[field]=metric.value;};
    onLCP(record('lcpMs'),{reportAllChanges:true});onCLS(record('cls'),{reportAllChanges:true});onINP(record('inpMs'),{reportAllChanges:true});
  }catch{initialized=false;active=false;}
}
export function stopUxDiagnostics(){active=false;}
export function isUxDiagnosticsActive(){return active;}
export function clearUxDiagnostics(){active=false;sample=null;}
export function getUxDiagnostics(){return {version:2,sample:sample?{...sample}:null,notes:['Web Vitals measurements describe this page lifetime; buffered observations can precede opt-in.','INP may remain unavailable until a qualifying interaction. Unsupported metrics remain null.','A single page sample does not establish production percentiles. No health data, URLs, event targets or free text are exported.']};}
