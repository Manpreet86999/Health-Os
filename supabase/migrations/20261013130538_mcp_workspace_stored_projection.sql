-- EXPLAIN ANALYZE baseline: first 28-day page 5.77s, 21,567 shared hits.
-- Extract sensor classification once on write; projections scan compact stored
-- columns rather than repeatedly detoasting large JSON sensor payloads under RLS.
set local lock_timeout='3s';
alter table public.body_os_records
 add column if not exists mcp_day text generated always as (coalesce(payload->>'date',left(payload->>'startTime',10))) stored,
 add column if not exists mcp_kind text generated always as (payload->>'kind') stored,
 add column if not exists mcp_source text generated always as (payload->>'source') stored,
 add column if not exists mcp_stamp text generated always as (payload->>'startTime') stored;
create index if not exists body_os_records_owner_type_day_idx on public.body_os_records(user_id,entity_type,mcp_day,change_version);
create or replace function public.health_os_mcp_workspace_page(
 p_from date,p_through date,p_time_zone text,p_types text[],p_after bigint default 0,p_page_size integer default 500
) returns setof public.body_os_records language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>455
 or p_after is null or p_after<0 or p_page_size is null or p_page_size not between 1 and 500
 or p_types is null or not p_types <@ array['profile','workspaceState','week','session','readiness','measurement','trainingConfig','scheduledWorkout','healthReading','target','habit','habitLog','cardio','goalCheckIn','careSettings','careTask','careGoal','careEvent','careCheckIn','careReview','carePlanVersion','skinProduct','medicalReport']::text[]
 or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
 then raise exception 'Invalid workspace window' using errcode='22023';end if;
 return query
 with regular as (
  select r.record_id,r.change_version,r.entity_type from public.body_os_records r
  where r.user_id=(select auth.uid()) and r.entity_type=any(array_remove(p_types,'healthReading')) and r.change_version>p_after
  and (r.entity_type<>all(array['session','readiness','measurement','habitLog','cardio','goalCheckIn']) or (r.mcp_day>=p_from::text and r.mcp_day<=p_through::text))
 ),sensor as materialized (
  select r.record_id,r.change_version,r.entity_type,r.mcp_kind,r.mcp_source,(r.mcp_stamp::timestamptz at time zone p_time_zone)::date as local_day,r.mcp_stamp::timestamptz as stamp
  from public.body_os_records r where r.user_id=(select auth.uid()) and 'healthReading'=any(p_types) and r.entity_type='healthReading' and r.deleted_at is null
  and r.mcp_day>=(p_from-1)::text and r.mcp_day<=(p_through+1)::text and r.mcp_stamp is not null
 ),daily as (
  select distinct on (s.mcp_kind,s.mcp_source,s.local_day) s.record_id,s.change_version,s.entity_type
  from sensor s where s.local_day>=p_from and s.local_day<=p_through
  order by s.mcp_kind,s.mcp_source,s.local_day,s.stamp desc,s.change_version asc
 ),projected as (
  select * from regular union all select * from daily where change_version>p_after
 ),page as (
  select * from projected order by change_version limit p_page_size
 ) select r.* from page p join public.body_os_records r on r.user_id=(select auth.uid()) and r.record_id=p.record_id and r.entity_type=p.entity_type order by p.change_version;
end;
$$;
revoke all on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) from public,anon;
grant execute on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) to authenticated;
analyze public.body_os_records;
