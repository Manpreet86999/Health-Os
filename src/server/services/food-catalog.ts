import { getDb } from '../db/connection.js';
export interface CatalogFood {code:string;name:string;brand:string;serving:string;ingredients:string;allergens:string;image?:string;nutrition:Record<string,number>;source:string;url:string;retrievedAt:string;}
const nutrients:Record<string,[string,string]>={protein:['proteins','g'],carbs:['carbohydrates','g'],fat:['fat','g'],fibre:['fiber','g'],saturatedFat:['saturated-fat','g'],sugars:['sugars','g'],sodium:['sodium','mg'],iron:['iron','mg'],calcium:['calcium','mg'],potassium:['potassium','mg'],magnesium:['magnesium','mg'],zinc:['zinc','mg'],folate:['folates','µg'],vitaminB12:['vitamin-b12','µg'],vitaminC:['vitamin-c','mg'],vitaminD:['vitamin-d','µg']};
export function normalizeFood(product:Record<string,any>):CatalogFood|null{
  const name=String(product.product_name||product.generic_name||'').trim(),code=String(product.code||'');if(!name||!/^\d{4,24}$/.test(code))return null;
  const n=product.nutriments||{},nutrition:Record<string,number>={};
  const knownNumber=(value:unknown)=>typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null:null;
  const calories=knownNumber(n['energy-kcal_100g']),energy=knownNumber(n.energy_100g);if(calories!==null)nutrition.calories=calories;else if(energy!==null)nutrition.calories=Math.round(energy/4.184);
  for(const [key,[offKey,targetUnit]]of Object.entries(nutrients)){
    const raw=knownNumber(n[`${offKey}_100g`]);if(raw===null)continue;
    // Open Food Facts normalized _100g mass values are grams; units label the original input.
    const factor=targetUnit==='mg'?1000:targetUnit==='µg'?1000000:1;nutrition[key]=Math.round(Number(raw)*factor*1000)/1000;
  }
  const image=String(product.image_small_url||'');
  return {code,name:name.slice(0,250),brand:String(product.brands||'').slice(0,250),serving:String(product.serving_size||'100 g'),ingredients:String(product.ingredients_text||'').slice(0,10000),allergens:Array.isArray(product.allergens_tags)?product.allergens_tags.map((t:string)=>t.replace(/^\w+:/,'')).join(', '):String(product.allergens||''),...(image.startsWith('https://images.openfoodfacts.org/')?{image}:{}),nutrition,source:'Open Food Facts',url:`https://world.openfoodfacts.org/product/${code}`,retrievedAt:new Date().toISOString()};
}
const fields='code,product_name,generic_name,brands,nutriments,serving_size,ingredients_text,allergens_tags,image_small_url';
const windows=new Map<string,number[]>();
export async function findFoods(query:string,barcode=false):Promise<{foods:CatalogFood[];cached:boolean;stale:boolean}>{
  const db=getDb();db.exec('CREATE TABLE IF NOT EXISTS health_os_food_cache (cache_key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
  const key=`off-v2:${barcode?'barcode':'search'}:${query.toLowerCase()}`,cached=db.prepare('SELECT data,updated_at FROM health_os_food_cache WHERE cache_key=?').get(key) as {data:string;updated_at:string}|undefined;
  if(cached&&Date.now()-Date.parse(cached.updated_at)<7*86400000)return {foods:JSON.parse(cached.data),cached:true,stale:false};
  const bucket=barcode?'product':'search',now=Date.now(),hits=(windows.get(bucket)||[]).filter(t=>now-t<60000),limit=barcode?15:10;
  if(hits.length>=limit){if(cached)return {foods:JSON.parse(cached.data),cached:true,stale:true};throw new Error('Food catalogue is taking a breather. Try again in a minute, or use your saved foods.');}
  windows.set(bucket,[...hits,now]);
  try{
    const url=barcode?`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(query)}?fields=${fields}`:`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`;
    const response=await fetch(url,{headers:{'User-Agent':'HealthOS/5.1.0'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Food catalogue is temporarily unavailable (${response.status}).`);
    const result=await response.json() as {product?:Record<string,any>;products?:Record<string,any>[]};
    const foods=(barcode?(result.product?[result.product]:[]):result.products||[]).map(normalizeFood).filter((p):p is CatalogFood=>p!==null);
    db.prepare('INSERT INTO health_os_food_cache(cache_key,data,updated_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(key,JSON.stringify(foods),new Date().toISOString());
    return {foods,cached:false,stale:false};
  }catch(e){if(cached)return {foods:JSON.parse(cached.data),cached:true,stale:true};throw e;}
}
