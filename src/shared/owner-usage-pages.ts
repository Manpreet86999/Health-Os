export interface OwnerUsageRow {charged_usd:number|null;reserved_usd:number;model?:string;role?:string;}
const validAmount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0||typeof value==='string'&&/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)>=0;
/** The REST row limit must never turn a monthly budget precheck into a partial sum. */
export async function readOwnerUsagePages(fetchPage:(offset:number)=>Promise<unknown>):Promise<OwnerUsageRow[]>{
 const rows:OwnerUsageRow[]=[];
 for(let page=0;page<100;page++){
  const batch=await fetchPage(page*1000);
  if(!Array.isArray(batch)||batch.length>1000)throw new Error('Invalid owner usage page.');
  for(const row of batch){
   if(!row||row.charged_usd!==null&&!validAmount(row.charged_usd)||!validAmount(row.reserved_usd))throw new Error('Invalid usage amount; no partial budget is authorized.');
   rows.push({...row,charged_usd:row.charged_usd===null?null:Number(row.charged_usd),reserved_usd:Number(row.reserved_usd)});
  }
  if(batch.length<1000)return rows;
 }
 throw new Error('Owner usage exceeds the bounded pagination limit; no partial budget is authorized.');
}
export const committedOwnerUsage=(rows:OwnerUsageRow[])=>rows.reduce((total,row)=>total+(row.charged_usd??row.reserved_usd),0);
