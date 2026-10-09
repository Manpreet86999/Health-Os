create or replace function public.body_os_due_email_jobs()
returns setof public.body_os_email_jobs language plpgsql set search_path='' as $$
declare pref record; local_now timestamp; zone text; schedule text; weekly_start date;
begin
  for pref in select user_id,payload from public.body_os_records where entity_type='sharedPreferences' and record_id='shared-preferences' and deleted_at is null loop
    zone:=coalesce(pref.payload->>'emailTimezone','Asia/Kolkata');
    if not exists(select 1 from pg_timezone_names where name=zone) then zone:='Asia/Kolkata'; end if;
    local_now:=now() at time zone zone; schedule:=coalesce(pref.payload->>'reportSchedule','Sunday 20:00');
    if pref.payload->'weeklyReportEnabled'='true'::jsonb and schedule ~ '^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) ([01][0-9]|2[0-3]):[0-5][0-9]$'
      and trim(to_char(local_now,'Day'))=split_part(schedule,' ',1) and to_char(local_now,'HH24:MI')>=split_part(schedule,' ',2) then
      weekly_start:=date_trunc('week',local_now)::date;
      insert into public.body_os_email_jobs(user_id,report_type,report_id) values(pref.user_id,'weekly',weekly_start::text) on conflict do nothing;
    end if;
    if pref.payload->'monthlyReportEnabled'='true'::jsonb and extract(day from local_now)=1 and local_now::time>=time '20:00' then
      insert into public.body_os_email_jobs(user_id,report_type,report_id) values(pref.user_id,'monthly',(date_trunc('month',local_now)-interval '1 month')::date::text) on conflict do nothing;
    end if;
  end loop;
  update public.body_os_email_jobs set status='queued',locked_at=null where status='processing' and locked_at<now()-interval '10 minutes' and attempts<5;
  return query with due as (
    select id from public.body_os_email_jobs where (status='queued' or (status='failed' and attempts<5)) and next_attempt_at<=now()
    order by created_at limit 1 for update skip locked
  ) update public.body_os_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now() from due where j.id=due.id returning j.*;
end;
$$;
revoke execute on function public.body_os_due_email_jobs() from public,anon,authenticated;
grant execute on function public.body_os_due_email_jobs() to service_role;
create index if not exists body_os_email_jobs_due_idx on public.body_os_email_jobs(next_attempt_at,created_at) where status in ('queued','failed','processing');
