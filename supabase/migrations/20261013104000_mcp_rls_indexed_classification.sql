-- Stored classification fields let leakproof column comparisons use indexes under existing RLS.
-- Values are generated from the existing payload; callers cannot set them independently.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.health_os_biological_records
 add column if not exists mcp_record_type text generated always as (payload->>'type') stored,
 add column if not exists mcp_metric text generated always as (payload->'metadata'->>'metric') stored;
create index if not exists health_os_biology_owner_classification_idx on public.health_os_biological_records(user_id,mcp_record_type,mcp_metric);
-- Separate type/metric branches so the planner can use bounded index ranges.
-- Read-only summary projection of canonical daily vital candidates.
create or replace function public.health_os_mcp_biology_page(
 p_from timestamptz,p_until timestamptz,p_time_zone text,p_types text[],p_after text default '',p_page_size integer default 500
) returns setof public.health_os_biological_records
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<=p_from or p_until-p_from>interval '460 days'
  or p_after is null or length(p_after)>200 or p_page_size is null or p_page_size not between 1 and 500
  or p_types is null or not p_types <@ array['vital','sleep','checkIn','meal','water','nutritionTarget','sleepPreference','bodyMeasurement','recoveryNote','goal','goalCheckIn','nutritionDay','routine','food','recipe','mealPlan']::text[]
  or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
 then raise exception 'Invalid biology window' using errcode='22023';end if;
 return query
 with non_vitals as (
  select r.record_id,r.mcp_record_type as kind,r.mcp_metric as metric,r.payload->>'source' as source,(r.payload->>'timestamp')::timestamptz as stamp,r.payload->>'deletedAt' as deleted,r.payload->>'value' is not null as has_value,r.payload->'metadata'->>'correctionOf' as correction from public.health_os_biological_records r
  where r.user_id=(select auth.uid()) and r.mcp_record_type=any(array_remove(p_types,'vital'))
  and (r.mcp_record_type=any(array['nutritionTarget','sleepPreference','goal','routine','food','recipe','mealPlan'])
   or ((r.payload->>'timestamp')::timestamptz>=p_from and (r.payload->>'timestamp')::timestamptz<p_until))
 ),vitals as (
  select r.record_id,r.mcp_record_type as kind,r.mcp_metric as metric,r.payload->>'source' as source,(r.payload->>'timestamp')::timestamptz as stamp,r.payload->>'deletedAt' as deleted,r.payload->>'value' is not null as has_value,r.payload->'metadata'->>'correctionOf' as correction from public.health_os_biological_records r
  where r.user_id=(select auth.uid()) and 'vital'=any(p_types) and r.mcp_record_type='vital'
  and r.mcp_metric=any(array['HRV','Resting HR','Weight','Steps','Heart Rate','Body fat','Active Calories','Waist','Neck','Chest','Arms','Hips'])
  and (r.payload->>'timestamp')::timestamptz>=p_from and (r.payload->>'timestamp')::timestamptz<p_until
 ),windowed as materialized (
  select * from non_vitals union all select * from vitals
 ),corrected as (
  select distinct w.correction as id from windowed w where w.kind='vital' and w.deleted is null and w.correction is not null
 ),daily as (
  select distinct on (w.metric,w.source,(w.stamp at time zone p_time_zone)::date) w.record_id
  from windowed w left join corrected c on c.id=w.record_id
  where w.kind='vital' and w.deleted is null and w.has_value and c.id is null
  order by w.metric,w.source,(w.stamp at time zone p_time_zone)::date,w.stamp desc,w.record_id asc
 ),projected as (
  select w.record_id from windowed w where w.kind<>'vital'
  union all select d.record_id from daily d
 ),page as (
  select p.record_id from projected p where p.record_id>p_after order by p.record_id limit p_page_size
 )
 select r.* from page p join public.health_os_biological_records r on r.user_id=(select auth.uid()) and r.record_id=p.record_id order by p.record_id;
end;
$$;
revoke all on function public.health_os_mcp_biology_page(timestamptz,timestamptz,text,text[],text,integer) from public,anon;
grant execute on function public.health_os_mcp_biology_page(timestamptz,timestamptz,text,text[],text,integer) to authenticated;

analyze public.health_os_biological_records;
