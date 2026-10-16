import { normalizeFood } from '../../shared/food-normalize.js';
export const FOOD_SOURCE_VERSION='off-v2-normalizer-2';
export const foodCacheKey=(query:string,barcode:boolean)=>`${FOOD_SOURCE_VERSION}:${barcode?'barcode':'search'}:${query.toLowerCase()}`;
export function foodSourceUrl(query:string,barcode:boolean){
  const fields='code,product_name,generic_name,brands,nutriments,serving_size,ingredients_text,allergens_tags,image_small_url,last_modified_t,rev';
  return barcode?`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(query)}?fields=${fields}`:`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`;
}
export function normalizedFoodResponse(raw:Record<string,any>,barcode:boolean){
  return (barcode?(raw.product?[raw.product]:[]):Array.isArray(raw.products)?raw.products:[]).map(normalizeFood).filter(Boolean);
}
