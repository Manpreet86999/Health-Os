-- Durable AI-before-email work shared by immediate dispatch, manual sends and cron.
alter table public.body_os_email_jobs add column if not exists automatic boolean not null default true;
alter table public.body_os_email_jobs add column if not exists request_version integer not null default 1;

create or replace function public.body_os_request_workout_report(owner_id uuid, session_id text)
returns setof public.body_os_email_jobs language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.body_os_records where user_id=owner_id and entity_type='session'
    and record_id=session_id and deleted_at is null and payload->>'status' in ('finished','completed')) then return; end if;
  return query insert into public.body_os_email_jobs(user_id,report_type,report_id,automatic)
  values(owner_id,'workout',session_id,false)
  on conflict(user_id,report_type,report_id) do update set
    automatic=false,
    request_version=case when body_os_email_jobs.status='done' then body_os_email_jobs.request_version+1 else body_os_email_jobs.request_version end,
    attempts=case when body_os_email_jobs.status='done' then 0 else body_os_email_jobs.attempts end,
    status=case when body_os_email_jobs.status='processing' then 'processing' else 'queued' end,
    next_attempt_at=case when body_os_email_jobs.status='processing' then body_os_email_jobs.next_attempt_at else now() end,
    last_error=case when body_os_email_jobs.status='processing' then body_os_email_jobs.last_error else null end
  returning *;
end;
$$;
revoke all on function public.body_os_request_workout_report(uuid,text) from public,anon,authenticated;
grant execute on function public.body_os_request_workout_report(uuid,text) to service_role;

create or replace function public.body_os_claim_report_job(job_id bigint)
returns setof public.body_os_email_jobs language sql set search_path='' as $$
  with due as (
    select id from public.body_os_email_jobs where id=job_id and next_attempt_at<=now()
      and (status in ('queued','failed') or (status='processing' and locked_at<now()-interval '5 minutes'))
    for update skip locked
  ) update public.body_os_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now()
    from due where j.id=due.id returning j.*;
$$;
revoke all on function public.body_os_claim_report_job(bigint) from public,anon,authenticated;
grant execute on function public.body_os_claim_report_job(bigint) to service_role;

-- A failed delivery claim must be reusable; the queue owns the processing lease.
create or replace function public.body_os_claim_email(owner_id uuid, delivery_key text)
returns text language plpgsql set search_path='' as $$
declare prior record;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select d.status,d.created_at into prior from public.body_os_email_deliveries d
    where d.user_id=owner_id and d.delivery_key=body_os_claim_email.delivery_key;
  if found then
    if prior.status='sent' then return 'sent'; end if;
    if prior.status='sending' and prior.created_at>now()-interval '5 minutes' then return 'limited'; end if;
    update public.body_os_email_deliveries d set status='sending',created_at=now()
      where d.user_id=owner_id and d.delivery_key=body_os_claim_email.delivery_key;
    return 'claimed';
  end if;
  if (select count(*) from public.body_os_email_deliveries where user_id=owner_id and created_at>now()-interval '1 hour')>=10 then return 'limited'; end if;
  insert into public.body_os_email_deliveries(user_id,delivery_key,status) values(owner_id,delivery_key,'sending');
  return 'claimed';
end;
$$;
revoke all on function public.body_os_claim_email(uuid,text) from public,anon,authenticated;
grant execute on function public.body_os_claim_email(uuid,text) to service_role;

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
  -- No retry-count cutoff: an unsuccessful report remains recoverable.
  update public.body_os_email_jobs set status='queued',locked_at=null
    where status='processing' and locked_at<now()-interval '5 minutes';
  return query with due as (
    select id from public.body_os_email_jobs where status in ('queued','failed') and next_attempt_at<=now()
    order by next_attempt_at,created_at limit 1 for update skip locked
  ) update public.body_os_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now()
    from due where j.id=due.id returning j.*;
end;
$$;
revoke all on function public.body_os_due_email_jobs() from public,anon,authenticated;
grant execute on function public.body_os_due_email_jobs() to service_role;

create or replace function body_os_private.dispatch_report_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text;
begin
  if new.status<>'queued' or new.next_attempt_at>now() then return new; end if;
  if tg_op='UPDATE' and old.status<>'done' then return new; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='body_os_email_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='body_os_email_scheduler_secret';
  if endpoint is not null and secret is not null then
    perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
      body:=jsonb_build_object('jobId',new.id),timeout_milliseconds:=10000);
  end if;
  return new;
exception when others then
  -- Dispatch trouble must never undo a saved workout; cron recovers the durable job.
  return new;
end;
$$;
revoke all on function body_os_private.dispatch_report_job() from public,anon,authenticated;
drop trigger if exists body_os_dispatch_report_job on public.body_os_email_jobs;
create trigger body_os_dispatch_report_job after insert or update on public.body_os_email_jobs
  for each row execute function body_os_private.dispatch_report_job();

-- Preserve recent-workout import behavior while preventing AI updates from enqueueing again.
create or replace function body_os_private.queue_report_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is null and new.entity_type='session' and new.payload->>'status' in ('finished','completed')
    and coalesce(new.payload->>'date','')>=to_char(now()-interval '2 days','YYYY-MM-DD') then
    insert into public.body_os_email_jobs(user_id,report_type,report_id) values(new.user_id,'workout',new.record_id)
      on conflict(user_id,report_type,report_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function body_os_private.queue_report_email() from public,anon,authenticated;
