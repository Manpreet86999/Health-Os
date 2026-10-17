-- Durable per-owner cursor catches up every missed IST date in bounded batches.
create table body_os_private.daily_report_schedule (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enqueued_through date not null
);
alter table body_os_private.daily_report_schedule enable row level security;
revoke all on body_os_private.daily_report_schedule from public,anon,authenticated;

create or replace function public.body_os_daily_due_email_jobs()
returns setof public.body_os_email_jobs language plpgsql security definer set search_path='' as $$
declare pref record; account record; cursor_day date; batch_end date;
 local_now timestamp; zone text; schedule text; weekly_start date; daily_day date;
begin
 daily_day:=case when (now() at time zone 'Asia/Kolkata')::time>=time '23:00' then (now() at time zone 'Asia/Kolkata')::date else (now() at time zone 'Asia/Kolkata')::date-1 end;
 for account in select id,created_at from auth.users where email_confirmed_at is not null and email is not null loop
  insert into body_os_private.daily_report_schedule(user_id,enqueued_through)
  values(account.id,greatest(date '2026-10-16',(account.created_at at time zone 'Asia/Kolkata')::date)-1) on conflict do nothing;
  select enqueued_through into cursor_day from body_os_private.daily_report_schedule where user_id=account.id for update;
  if cursor_day>=daily_day then continue; end if;
  if exists(select 1 from public.body_os_records p where p.user_id=account.id and p.entity_type='sharedPreferences' and p.deleted_at is null and p.payload->'dailyReportEnabled'='false'::jsonb) then
   update body_os_private.daily_report_schedule set enqueued_through=daily_day where user_id=account.id;
   continue;
  end if;
  batch_end:=least(daily_day,cursor_day+31);
  insert into public.body_os_email_jobs(user_id,report_type,report_id)
  select account.id,'daily',day::date::text from generate_series((cursor_day+1)::timestamp,batch_end::timestamp,interval '1 day') day
  on conflict do nothing;
  update body_os_private.daily_report_schedule set enqueued_through=batch_end where user_id=account.id;
 end loop;
 -- Keep optional weekly/monthly scheduling unchanged.
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
  order by next_attempt_at,created_at limit 50 for update skip locked
 ) update public.body_os_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now() from due where j.id=due.id returning j.*;
end; $$;
revoke all on function public.body_os_daily_due_email_jobs() from public,anon,authenticated;
grant execute on function public.body_os_daily_due_email_jobs() to service_role;

-- Each claimed report gets its own worker; a busy owner's CPU cannot kill peers.
create function public.body_os_dispatch_due_report_jobs()
returns integer language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text; job record; dispatched integer:=0; overdue integer;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='body_os_email_function_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='body_os_email_scheduler_secret';
 if endpoint is null or secret is null then raise exception 'Report scheduler configuration is missing'; end if;
 for job in select * from public.body_os_daily_due_email_jobs() loop
  perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
   body:=jsonb_build_object('claimedJobId',job.id,'attempt',job.attempts),timeout_milliseconds:=10000);
  dispatched:=dispatched+1;
 end loop;
 select count(*) into overdue from public.body_os_email_jobs where report_type='daily' and status<>'done'
  and now()>((report_id::date+time '23:00') at time zone 'Asia/Kolkata')+interval '15 minutes';
 if overdue>0 then raise warning 'DAILY_REPORTS_OVERDUE count=%',overdue; end if;
 return dispatched;
end; $$;
revoke all on function public.body_os_dispatch_due_report_jobs() from public,anon,authenticated;
grant execute on function public.body_os_dispatch_due_report_jobs() to service_role;

-- Every minute includes exactly 23:00 IST (17:30 UTC), plus automatic recovery.
select cron.schedule('body-os-central-email','* * * * *','select public.body_os_dispatch_due_report_jobs();');
