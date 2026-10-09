-- Run against the connected development project. All fixtures are rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','78e313d9-6fdc-4d29-a764-e20dc199830d',true);
insert into public.health_os_workers(id,user_id,name) values('20000000-0000-4000-8000-000000000001',auth.uid(),'Synthetic worker isolation test');
select public.health_os_enqueue_job('20000000-0000-4000-8000-000000000002','research.statistics','{"values":[1,2,3]}');
do $$ begin
 if has_table_privilege('authenticated','public.health_os_worker_jobs','UPDATE') then raise exception 'Direct job updates allowed'; end if;
 if has_function_privilege('anon','public.health_os_claim_job(uuid,text[])','EXECUTE') then raise exception 'Anonymous worker execution allowed'; end if;
 if (select count(*) from public.health_os_claim_job('20000000-0000-4000-8000-000000000001',array['research.statistics']))<>1 then raise exception 'Claim failed'; end if;
 if (select count(*) from public.health_os_claim_job('20000000-0000-4000-8000-000000000001',array['research.statistics']))<>0 then raise exception 'Duplicate claim allowed'; end if;
 if public.health_os_finish_job('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}') then raise exception 'Wrong lease accepted'; end if;
 perform set_config('health_os_test.old_lease',(select lease_token::text from public.health_os_worker_jobs where id='20000000-0000-4000-8000-000000000002'),true);
end $$;
select set_config('request.jwt.claim.sub','7548a5d9-0098-489c-8fce-9204215cbfe0',true);
do $$ begin
 if exists(select 1 from public.health_os_worker_jobs where id='20000000-0000-4000-8000-000000000002') then raise exception 'Another account can read job'; end if;
 if exists(select 1 from public.health_os_workers where id='20000000-0000-4000-8000-000000000001') then raise exception 'Another account can read worker'; end if;
 if public.health_os_cancel_job('20000000-0000-4000-8000-000000000002') then raise exception 'Another account can cancel job'; end if;
 begin
  perform public.health_os_claim_job('20000000-0000-4000-8000-000000000001',array['research.statistics']);
  raise exception 'Other owner worker claim allowed';
 exception when others then
  if sqlerrm<>'Worker is not registered to this account' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','78e313d9-6fdc-4d29-a764-e20dc199830d',true);
reset role;
update public.health_os_worker_jobs set lease_until=now()-interval '1 second' where id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if (select count(*) from public.health_os_claim_job('20000000-0000-4000-8000-000000000001',array['research.statistics']))<>1 then raise exception 'Expired job was not reclaimed'; end if;
 if public.health_os_finish_job('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',current_setting('health_os_test.old_lease')::uuid,'{}') then raise exception 'Stale worker completed reclaimed job'; end if;
end $$;
do $$ declare lease uuid; begin
 select lease_token into lease from public.health_os_worker_jobs where id='20000000-0000-4000-8000-000000000002';
 if not public.health_os_finish_job('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',lease,'{"mean":2}') then raise exception 'Owner completion failed'; end if;
 if (select input<>'{}' or status<>'completed' from public.health_os_worker_jobs where id='20000000-0000-4000-8000-000000000002') then raise exception 'Input not cleared'; end if;
 if public.health_os_finish_job('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',lease,'{}') then raise exception 'Duplicate completion accepted'; end if;
end $$;
select public.health_os_enqueue_job('20000000-0000-4000-8000-000000000003','research.statistics','{"values":[1,2]}');
do $$ begin
 if not public.health_os_cancel_job('20000000-0000-4000-8000-000000000003') then raise exception 'Owner cancellation failed'; end if;
 if (select input<>'{}' or status<>'cancelled' from public.health_os_worker_jobs where id='20000000-0000-4000-8000-000000000003') then raise exception 'Cancelled input retained'; end if;
end $$;
rollback;
