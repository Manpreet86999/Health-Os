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
