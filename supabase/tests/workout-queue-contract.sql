-- Verify automatic queueing and deduplication without saving a synthetic workout
-- or sending an email. The scheduler cannot see uncommitted rows.
begin;
do $$
declare owner uuid; test_id text := 'transactional-workout-'||gen_random_uuid()::text; snapshot jsonb;
begin
  select id into owner from auth.users where lower(email)='manpreet86999singh@gmail.com';
  select payload into snapshot from public.body_os_records where user_id=owner and entity_type='session' and deleted_at is null limit 1;
  if snapshot is null then raise exception 'Existing workout required for queue contract'; end if;
  snapshot := snapshot || jsonb_build_object('id',test_id,'date',to_char(now(),'YYYY-MM-DD'),'status','finished');
  insert into public.body_os_records(user_id,entity_type,record_id,payload,updated_at,revision,device_id)
  values(owner,'session',test_id,snapshot,now(),1,'transactional-contract');
  if (select count(*) from public.body_os_email_jobs where user_id=owner and report_type='workout' and report_id=test_id and status='queued')<>1 then
    raise exception 'Finished workout did not enqueue exactly one cloud report';
  end if;
  update public.body_os_records set payload=payload||jsonb_build_object('notes','transactional edit'),revision=revision+1 where user_id=owner and entity_type='session' and record_id=test_id;
  if (select count(*) from public.body_os_email_jobs where user_id=owner and report_type='workout' and report_id=test_id)<>1 then
    raise exception 'Workout edit duplicated its report job';
  end if;
end;
$$;
rollback;
