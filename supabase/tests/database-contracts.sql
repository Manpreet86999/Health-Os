-- Transactional live checks: all synthetic writes are rolled back.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','is_anonymous',false)::text from auth.users where lower(email)='manpreet86999singh@gmail.com'),true);
set local role authenticated;
do $$
declare owner uuid:=auth.uid(); entries jsonb; versions jsonb; expected_rev integer; stamp text; result jsonb; settings jsonb;
begin
  if owner is null then raise exception 'Test owner is unavailable'; end if;
  if exists(select 1 from public.body_os_records where user_id<>owner) then raise exception 'Owner RLS failed'; end if;
  select payload into settings from public.body_os_records where user_id=owner and entity_type='careSettings' and record_id='care-settings' and deleted_at is null;
  expected_rev:=coalesce((settings->>'revision')::integer,0);stamp:=coalesce(settings->>'updatedAt','1970-01-01T00:00:00.000Z');
  select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'entityType',entity_type,'payload',case when entity_type='careSettings' then payload||jsonb_build_object('revision',expected_rev+1,'updatedAt',now()::text) else payload end)),'[]'::jsonb),coalesce(jsonb_object_agg(entity_type||':'||record_id,change_version),'{}'::jsonb)
  into entries,versions from public.body_os_records where user_id=owner and entity_type in ('careSettings','careGoal','careTask','careEvent','careCheckIn','careReview','carePlanVersion') and deleted_at is null;
  if settings is null then entries:=entries||jsonb_build_array(jsonb_build_object('id','care-settings','entityType','careSettings','payload',jsonb_build_object('id','care-settings','revision',1,'updatedAt',now()::text))); end if;
  result:=public.body_os_save_care(expected_rev,stamp,entries,versions);
  if jsonb_array_length(result)<1 then raise exception 'Care save returned no records'; end if;
  begin
    perform public.body_os_save_care(expected_rev,stamp,entries,versions);
    raise exception 'Stale Care save was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform 1 from public.body_os_cloud_integrations;
    raise exception 'Integration secrets are readable by browser roles';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
declare owner uuid; test_job bigint; claimed public.body_os_email_jobs;
begin
  select id into owner from auth.users where lower(email)='manpreet86999singh@gmail.com';
  insert into public.body_os_email_jobs(user_id,report_type,report_id,status,next_attempt_at) values(owner,'test','transactional-queue-check-'||gen_random_uuid()::text,'queued',now()) returning id into test_job;
  select * into claimed from public.body_os_due_email_jobs();
  if claimed.id<>test_job or claimed.status<>'processing' or claimed.attempts<>1 then raise exception 'Queue claim failed'; end if;
  update public.body_os_email_jobs set status='failed',next_attempt_at=now()+interval '1 hour' where id=test_job;
  if exists(select 1 from public.body_os_due_email_jobs() where id=test_job) then raise exception 'Queue ignored retry delay'; end if;
  update public.body_os_email_jobs set status='processing',locked_at=now()-interval '11 minutes',next_attempt_at=now() where id=test_job;
  select * into claimed from public.body_os_due_email_jobs();
  if claimed.id<>test_job or claimed.attempts<>2 then raise exception 'Stuck queue recovery failed'; end if;
  update public.body_os_email_jobs set status='failed',attempts=5,next_attempt_at=now() where id=test_job;
  if exists(select 1 from public.body_os_due_email_jobs() where id=test_job) then raise exception 'Queue exceeded retry limit'; end if;
end;
$$;
rollback;
