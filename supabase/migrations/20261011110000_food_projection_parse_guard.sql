create or replace view public.health_os_nutrition_profiles with (security_invoker=true) as
select f.user_id,f.food_id,profile.value as profile
from public.health_os_foods f,
lateral jsonb_array_elements(case when pg_input_is_valid(f.payload->'metadata'->>'nutritionProfiles','jsonb')
then case when jsonb_typeof((f.payload->'metadata'->>'nutritionProfiles')::jsonb)='array'
then (f.payload->'metadata'->>'nutritionProfiles')::jsonb else '[]'::jsonb end
else '[]'::jsonb end) profile;
create or replace view public.health_os_meal_items with (security_invoker=true) as
select user_id,record_id as meal_id,payload->>'timestamp' as eaten_at,item.value as item
from public.health_os_biological_records,
lateral jsonb_array_elements(case when pg_input_is_valid(payload->'metadata'->>'foodItems','jsonb')
then case when jsonb_typeof((payload->'metadata'->>'foodItems')::jsonb)='array'
then (payload->'metadata'->>'foodItems')::jsonb else '[]'::jsonb end
else '[]'::jsonb end) item
where payload->>'type'='meal' and payload->>'deletedAt' is null;
