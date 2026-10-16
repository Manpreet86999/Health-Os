-- Existing biological records remain the authoritative offline-sync envelope.
-- Canonical food views reuse their owner RLS; no history is rewritten.
create table if not exists public.health_os_food_source_records (
  provider text not null,
  source_key text not null,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<2000000),
  checksum text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  license text not null,
  primary key(provider,source_key)
);
alter table public.health_os_food_source_records enable row level security;
revoke all on public.health_os_food_source_records from anon, authenticated;
grant select on public.health_os_food_source_records to authenticated;
grant all on public.health_os_food_source_records to service_role;
create policy food_source_read on public.health_os_food_source_records
  for select to authenticated using (true);
create index food_source_expiry on public.health_os_food_source_records(expires_at);

create or replace view public.health_os_foods with (security_invoker=true) as
select user_id,record_id as food_id,payload->>'name' as canonical_name,
  lower(trim(payload->>'name')) as normalized_name,
  case when payload->>'type'='recipe' then 'recipe'
    when payload->'metadata'->>'barcode' is not null then 'branded_product' else 'user_food' end as food_type,
  payload,revision,updated_at
from public.health_os_biological_records
where payload->>'type' in ('food','recipe') and payload->>'deletedAt' is null;

create or replace view public.health_os_nutrition_profiles with (security_invoker=true) as
select f.user_id,f.food_id,profile.value as profile
from public.health_os_foods f,
lateral jsonb_array_elements(case
  when pg_input_is_valid(f.payload->'metadata'->>'nutritionProfiles','jsonb')
    and jsonb_typeof((f.payload->'metadata'->>'nutritionProfiles')::jsonb)='array'
    then (f.payload->'metadata'->>'nutritionProfiles')::jsonb else '[]'::jsonb end) profile;

create or replace view public.health_os_meal_items with (security_invoker=true) as
select user_id,record_id as meal_id,payload->>'timestamp' as eaten_at,item.value as item
from public.health_os_biological_records,
lateral jsonb_array_elements(case
  when pg_input_is_valid(payload->'metadata'->>'foodItems','jsonb')
    and jsonb_typeof((payload->'metadata'->>'foodItems')::jsonb)='array'
    then (payload->'metadata'->>'foodItems')::jsonb else '[]'::jsonb end) item
where payload->>'type'='meal' and payload->>'deletedAt' is null;

revoke all on public.health_os_foods,public.health_os_nutrition_profiles,public.health_os_meal_items from anon;
grant select on public.health_os_foods,public.health_os_nutrition_profiles,public.health_os_meal_items to authenticated;
comment on view public.health_os_foods is 'Canonical food projection of the existing owner-scoped sync envelope. Legacy rows are adapted at read time.';
