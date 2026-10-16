-- Required summary metrics are the canonical non-medical daily metrics. Raw interval/distance history is unchanged.
set local lock_timeout='3s';
create index if not exists health_os_biology_owner_type_metric_time_idx on public.health_os_biological_records(user_id,(payload->>'type'),(payload->'metadata'->>'metric'),(payload->>'timestamp'));
-- Select identifiers before fetching full payloads to bound sorting and materialization memory.
-- Read-only MCP workspace projection. Samples remain untouched in the sync store.
create or replace function public.health_os_mcp_workspace_page(
 p_from date,p_through date,p_time_zone text,p_types text[],p_after bigint default 0,p_page_size integer default 500
) returns setof public.body_os_records
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>455
  or p_after is null or p_after<0 or p_page_size is null or p_page_size not between 1 and 500
  or p_types is null or not p_types <@ array['profile','workspaceState','week','session','readiness','measurement','trainingConfig','scheduledWorkout','healthReading','target','habit','habitLog','cardio','goalCheckIn','careSettings','careTask','careGoal','careEvent','careCheckIn','careReview','carePlanVersion','skinProduct']::text[]
  or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
 then raise exception 'Invalid workspace window' using errcode='22023';end if;
 return query
 with windowed as materialized (
  select r.record_id,r.change_version,r.entity_type,r.payload->>'kind' as kind,r.payload->>'source' as source,
   case when r.entity_type='healthReading' then (r.payload->>'startTime')::timestamptz end as stamp,r.deleted_at
  from public.body_os_records r where r.user_id=(select auth.uid()) and r.entity_type=any(p_types)
  and (r.entity_type<>all(array['session','readiness','measurement','healthReading','habitLog','cardio','goalCheckIn'])
   or (r.payload->>'date'>=p_from::text and r.payload->>'date'<=p_through::text))
 ),daily as (
  select distinct on (w.kind,w.source,(w.stamp at time zone p_time_zone)::date) w.record_id,w.change_version,w.entity_type
  from windowed w where w.entity_type='healthReading' and w.deleted_at is null
  order by w.kind,w.source,(w.stamp at time zone p_time_zone)::date,w.stamp desc,w.change_version asc
 ),projected as (
  select w.record_id,w.change_version,w.entity_type from windowed w where w.entity_type<>'healthReading'
  union all select d.record_id,d.change_version,d.entity_type from daily d
 ),page as (
  select p.* from projected p where p.change_version>p_after order by p.change_version limit p_page_size
 )
 select r.* from page p join public.body_os_records r on r.user_id=(select auth.uid()) and r.record_id=p.record_id and r.entity_type=p.entity_type order by p.change_version;
end;
$$;
revoke all on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) from public,anon;
grant execute on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) to authenticated;


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
 with windowed as materialized (
  select r.record_id,r.payload->>'type' as kind,r.payload->'metadata'->>'metric' as metric,r.payload->>'source' as source,
   (r.payload->>'timestamp')::timestamptz as stamp,r.payload->>'deletedAt' as deleted,r.payload->>'value' is not null as has_value,r.payload->'metadata'->>'correctionOf' as correction
  from public.health_os_biological_records r where r.user_id=(select auth.uid()) and r.payload->>'type'=any(p_types)
  and (r.payload->>'type'<>'vital' or r.payload->'metadata'->>'metric'=any(array['HRV','Resting HR','Weight','Steps','Heart Rate','Body fat','Active Calories','Waist','Neck','Chest','Arms','Hips']))
  and (r.payload->>'type'=any(array['nutritionTarget','sleepPreference','goal','routine','food','recipe','mealPlan'])
   or ((r.payload->>'timestamp')::timestamptz>=p_from and (r.payload->>'timestamp')::timestamptz<p_until))
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
