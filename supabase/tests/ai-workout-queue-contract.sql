-- All rows and pg_net requests roll back; no synthetic email leaves the database.
begin;
do $$
declare owner uuid; workout text:='ai-queue-contract-'||gen_random_uuid()::text;
  job public.body_os_email_jobs; claimed public.body_os_email_jobs; snapshot jsonb; key text;
begin
  select id into owner from auth.users where lower(email)='manpreet86999singh@gmail.com';
  select payload into snapshot from public.body_os_records where user_id=owner and entity_type='session' and deleted_at is null limit 1;
  if snapshot is null then raise exception 'Existing workout required'; end if;
  snapshot:=snapshot||jsonb_build_object('id',workout,'date',to_char(now(),'YYYY-MM-DD'),'status','finished');
  insert into public.body_os_records(user_id,entity_type,record_id,payload,updated_at,revision,device_id)
    values(owner,'session',workout,snapshot,now(),1,'transactional-ai-contract');
  select * into job from public.body_os_email_jobs where user_id=owner and report_id=workout;
  if job.id is null or job.status<>'queued' or not job.automatic then raise exception 'Save did not create automatic job'; end if;
  if not exists(select 1 from net.http_request_queue where convert_from(body,'UTF8')::jsonb->>'jobId'=job.id::text) then
    raise exception 'Save did not dispatch an immediate cloud request'; end if;
  select * into claimed from public.body_os_claim_report_job(job.id);
  if claimed.status<>'processing' or claimed.attempts<>1 then raise exception 'Job lease failed'; end if;
  if exists(select 1 from public.body_os_claim_report_job(job.id)) then raise exception 'Concurrent processor claimed the same job'; end if;
  update public.body_os_email_jobs set status='queued',next_attempt_at=now()+interval '1 hour' where id=job.id;
  if exists(select 1 from public.body_os_claim_report_job(job.id)) then raise exception 'Retry ignored backoff'; end if;
  update public.body_os_email_jobs set attempts=7,next_attempt_at=now() where id=job.id;
  select * into claimed from public.body_os_claim_report_job(job.id);
  if claimed.attempts<>8 then raise exception 'Queue abandoned a report after five attempts'; end if;
  update public.body_os_email_jobs set status='processing',locked_at=now()-interval '6 minutes' where id=job.id;
  if not exists(select 1 from public.body_os_claim_report_job(job.id)) then raise exception 'Stale job was not recovered'; end if;
  update public.body_os_email_jobs set status='done' where id=job.id;
  select * into claimed from public.body_os_request_workout_report(owner,workout);
  if claimed.request_version<>2 or claimed.automatic or claimed.status<>'queued' then raise exception 'Manual resend did not create a new delivery version'; end if;
  if (select count(*) from public.body_os_email_jobs where user_id=owner and report_id=workout)<>1 then raise exception 'Duplicate queue jobs'; end if;
  key:='workout:'||workout||':ai:2';
  if public.body_os_claim_email(owner,key)<>'claimed' then raise exception 'Email claim failed'; end if;
  if public.body_os_claim_email(owner,key)<>'limited' then raise exception 'Concurrent SMTP claim was allowed'; end if;
  update public.body_os_email_deliveries set status='failed' where user_id=owner and delivery_key=key;
  if public.body_os_claim_email(owner,key)<>'claimed' then raise exception 'Failed email claim blocked its retry'; end if;
  update public.body_os_email_deliveries set status='sent' where user_id=owner and delivery_key=key;
  if public.body_os_claim_email(owner,key)<>'sent' then raise exception 'Successful email could be duplicated'; end if;
  if has_function_privilege('authenticated','public.body_os_request_workout_report(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.body_os_claim_report_job(bigint)','EXECUTE') then raise exception 'Privileged queue RPC exposed'; end if;
end;
$$;
rollback;
