/** Equivalent JSON Schema forms accepted by providers with restricted schema compilers. */
export function providerJsonSchema(input:unknown):any{
 if(Array.isArray(input))return input.map(providerJsonSchema);
 if(!input||typeof input!=='object')return input;
 const output=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,providerJsonSchema(value)])) as any;
 if(output.type==='object'&&output.additionalProperties===false&&output.properties){
  for(const [key,value] of Object.entries(output.properties))if(impossible(value)&&!(output.required||[]).includes(key))delete output.properties[key];
 }
 // A false item schema permits only an empty array. maxItems=0 with a simple
 // item type has the same accepted instances, without an unsupported boolean schema.
 if(output.type==='array'&&(impossible(output.items)||output.maxItems===0)){output.items={type:'string'};output.maxItems=0;}
 return output;
}
const impossible=(value:any)=>value===false||value&&typeof value==='object'&&Object.keys(value).length===1&&value.not&&typeof value.not==='object'&&!Array.isArray(value.not)&&Object.keys(value.not).length===0;
