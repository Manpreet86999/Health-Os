-- One immutable generated daily report per owner/IST date. Acknowledgment syncs across devices.
create table public.body_os_daily_reports (
 user_id uuid not null references auth.users(id) on delete cascade,
 report_date date not null,
 payload jsonb not null,
 html text not null,
 text text not null,
 generated_at timestamptz not null default now(),
 sent_at timestamptz,
 read_at timestamptz,
 primary key(user_id,report_date),
 check(read_at is null or sent_at is not null)
);
alter table public.body_os_daily_reports enable row level security;
revoke all on public.body_os_daily_reports from anon,authenticated;
grant select on public.body_os_daily_reports to authenticated;
grant all on public.body_os_daily_reports to service_role;
create policy daily_reports_owner_read on public.body_os_daily_reports for select to authenticated using ((select auth.uid())=user_id);

alter table public.body_os_email_jobs drop constraint if exists body_os_email_jobs_report_type_check;
alter table public.body_os_email_jobs add constraint body_os_email_jobs_report_type_check check(report_type in ('daily','workout','weekly','monthly','skincare','health','test'));

-- Preserve all existing job rows and legacy functions. Stop new per-workout queue inserts.
drop trigger if exists body_os_queue_report_email on public.body_os_records;

create or replace function public.body_os_request_daily_report(owner_id uuid,day date)
returns setof public.body_os_email_jobs language plpgsql set search_path='' as $$
begin
 if now() < ((day+time '23:00') at time zone 'Asia/Kolkata') then raise exception 'REPORT_TOO_EARLY'; end if;
 return query insert into public.body_os_email_jobs(user_id,report_type,report_id,automatic)
 values(owner_id,'daily',day::text,false)
 on conflict(user_id,report_type,report_id) do update set
 automatic=false,
 status=case when body_os_email_jobs.status in ('done','processing') then body_os_email_jobs.status else 'queued' end,
 next_attempt_at=case when body_os_email_jobs.status in ('done','processing') then body_os_email_jobs.next_attempt_at else now() end
 returning *;
end; $$;
revoke all on function public.body_os_request_daily_report(uuid,date) from public,anon,authenticated;
grant execute on function public.body_os_request_daily_report(uuid,date) to service_role;

create or replace function public.body_os_daily_due_email_jobs()
returns setof public.body_os_email_jobs language plpgsql set search_path='' as $$
declare pref record; local_now timestamp; zone text; schedule text; weekly_start date; daily_day date;
begin
 daily_day:=case when (now() at time zone 'Asia/Kolkata')::time>=time '23:00' then (now() at time zone 'Asia/Kolkata')::date else (now() at time zone 'Asia/Kolkata')::date-1 end;
 if daily_day>=date '2026-10-16' then
   insert into public.body_os_email_jobs(user_id,report_type,report_id)
   select distinct r.user_id,'daily',daily_day::text from public.body_os_records r
   where r.deleted_at is null and not exists(select 1 from public.body_os_records p where p.user_id=r.user_id and p.entity_type='sharedPreferences' and p.deleted_at is null and p.payload->'dailyReportEnabled'='false'::jsonb)
   on conflict do nothing;
 end if;
 -- Preserve existing optional weekly/monthly delivery.
 for pref in select user_id,payload from public.body_os_records where entity_type='sharedPreferences' and record_id='shared-preferences' and deleted_at is null loop
  zone:=coalesce(pref.payload->>'emailTimezone','Asia/Kolkata');
  if not exists(select 1 from pg_timezone_names where name=zone) then zone:='Asia/Kolkata'; end if;
  local_now:=now() at time zone zone;schedule:=coalesce(pref.payload->>'reportSchedule','Sunday 20:00');
  if pref.payload->'weeklyReportEnabled'='true'::jsonb and schedule ~ '^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) ([01][0-9]|2[0-3]):[0-5][0-9]$'
   and trim(to_char(local_now,'Day'))=split_part(schedule,' ',1) and to_char(local_now,'HH24:MI')>=split_part(schedule,' ',2) then
   weekly_start:=date_trunc('week',local_now)::date;
   insert into public.body_os_email_jobs(user_id,report_type,report_id) values(pref.user_id,'weekly',weekly_start::text) on conflict do nothing;
  end if;
  if pref.payload->'monthlyReportEnabled'='true'::jsonb and extract(day from local_now)=1 and local_now::time>=time '20:00' then
   insert into public.body_os_email_jobs(user_id,report_type,report_id) values(pref.user_id,'monthly',(date_trunc('month',local_now)-interval '1 month')::date::text) on conflict do nothing;
  end if;
 end loop;
 update public.body_os_email_jobs set status='queued',locked_at=null where status='processing' and locked_at<now()-interval '5 minutes';
 return query with due as (
  select id from public.body_os_email_jobs where status in ('queued','failed') and next_attempt_at<=now()
   and report_type<>'workout'
   and (report_type<>'daily' or now()>=((report_id::date+time '23:00') at time zone 'Asia/Kolkata'))
  order by next_attempt_at,created_at limit 10 for update skip locked
 ) update public.body_os_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now() from due where j.id=due.id returning j.*;
end; $$;
revoke all on function public.body_os_daily_due_email_jobs() from public,anon,authenticated;
grant execute on function public.body_os_daily_due_email_jobs() to service_role;

-- Every newly imported/created training week must receive its own explicit goals.
create or replace function body_os_private.valid_nutrition_goals(goals jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(goals)='object' and (
  select bool_and(case when jsonb_typeof(goals->k)='number' then (goals->>k)::numeric>0 and (goals->>k)::numeric<=max_value else false end)
  from (values ('calories',20000),('protein',1000),('carbs',3000),('fat',1000),('fibre',300),('water',20000)) fields(k,max_value)
 ),false);
$$;
revoke all on function body_os_private.valid_nutrition_goals(jsonb) from public,anon,authenticated;
create or replace function body_os_private.require_week_nutrition_goals()
returns trigger language plpgsql security definer set search_path='' as $$
declare week_payload jsonb;
begin
 if new.deleted_at is not null then return new; end if;
 if new.entity_type='week' then
  if tg_op='INSERT' then
   -- Imported JSON cannot silently reuse a previous week's targets.
   new.payload:=(new.payload-'nutritionGoals'-'nutritionGoalsSetAt')||jsonb_build_object('nutritionGoalsRequired',true,'active',false);
  elsif old.payload->'nutritionGoalsRequired'='true'::jsonb then
   new.payload:=new.payload||jsonb_build_object('nutritionGoalsRequired',true);
  end if;
  if new.payload->'nutritionGoalsRequired'='true'::jsonb and not body_os_private.valid_nutrition_goals(new.payload->'nutritionGoals') then
   new.payload:=new.payload||jsonb_build_object('active',false);
  end if;
 elsif new.entity_type in ('session','workoutDraft','workspaceState') then
  select payload into week_payload from public.body_os_records where user_id=new.user_id and entity_type='week'
   and record_id=case when new.entity_type='workspaceState' then new.payload->>'activeWeekId' else coalesce(new.payload->>'weekId',new.payload->'tracker'->>'weekId') end and deleted_at is null;
  if week_payload->'nutritionGoalsRequired'='true'::jsonb and not body_os_private.valid_nutrition_goals(week_payload->'nutritionGoals') then
   raise exception 'Set all six daily nutrition goals before starting this week.';
  end if;
 end if;
 return new;
end; $$;
revoke all on function body_os_private.require_week_nutrition_goals() from public,anon,authenticated;
create trigger body_os_week_nutrition_goals before insert or update on public.body_os_records for each row execute function body_os_private.require_week_nutrition_goals();
