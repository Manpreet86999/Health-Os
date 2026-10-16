import assert from 'node:assert/strict';
export function assertNoInventedConsumption(answer:string){
 for(const match of answer.matchAll(/\byou\s+(?:actually\s+)?(?:ate|consumed|logged)\b/gi)){
  const prefix=answer.slice(0,match.index);
  assert.match(prefix,/(?:not\s+(?:claim(?:ed)?|assume)(?:\s+that)?|without\s+assuming|(?:cannot|can['’]t)\s+(?:say|confirm)(?:\s+that)?)\s+$/i,'A personal consumption claim requires recorded evidence.');
 }
}
