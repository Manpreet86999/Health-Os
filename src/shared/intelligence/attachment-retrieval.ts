import {fingerprint} from '../automation-model.js';
export interface DocumentSource {id:string;title:string;excerpt:string;startLine:number;endLine:number;}
/** Retrieve bounded exact excerpts from explicitly supplied files; no account search. */
export function searchAttachments(files:{name:string;text:string}[],query:string){
 const stop=new Set(['the','and','for','with','from','this','that','what','does','about','please','summarize']);
 const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])].filter(t=>t.length>2&&!stop.has(t)).slice(0,30);
 const chunks:{source:DocumentSource;score:number}[]=[];let totalChunks=0;
 for(const file of files.slice(0,3))for(let start=0;start<file.text.length;start+=780){
  const excerpt=file.text.slice(start,start+900);if(!excerpt.trim())continue;totalChunks++;
  const lower=excerpt.toLowerCase(),score=terms.reduce((n,term)=>n+(lower.split(term).length-1),0);
  if(score>0||!terms.length)chunks.push({score,source:{id:'attachment:'+fingerprint([file.name,file.text])+':'+start,title:file.name,excerpt,startLine:file.text.slice(0,start).split('\n').length,endLine:file.text.slice(0,start+excerpt.length).split('\n').length}});
 }
 return {query,sources:chunks.sort((a,b)=>b.score-a.score||a.source.id.localeCompare(b.source.id)).slice(0,6).map(c=>c.source),totalChunks,returned:Math.min(6,chunks.length),omitted:Math.max(0,chunks.length-6),limitation:'Exact uploaded-text excerpts, not reviewed clinical records or independent medical authority.'};
}
