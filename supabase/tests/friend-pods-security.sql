-- Standalone acceptance: unique temporary identities, no persistent test records.
begin;
create temp table pod_test_state(k text primary key,v text);
insert into pod_test_state values ('account-a',gen_random_uuid()::text),('account-b',gen_random_uuid()::text),('account-c',gen_random_uuid()::text);
insert into auth.users(id,aud,role,email) values
 ((select v::uuid from pod_test_state where k='account-a'),'authenticated','authenticated','pod-a-'||(select v from pod_test_state where k='account-a')||'@validation.invalid'),
 ((select v::uuid from pod_test_state where k='account-b'),'authenticated','authenticated','pod-b-'||(select v from pod_test_state where k='account-b')||'@validation.invalid'),
 ((select v::uuid from pod_test_state where k='account-c'),'authenticated','authenticated','pod-c-'||(select v from pod_test_state where k='account-c')||'@validation.invalid');
grant all on pod_test_state to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-a'),true);
insert into pod_test_state values('pod',(public.health_os_pod_action('create',null,'{"name":"Validation Pod"}')->>'id'));
insert into pod_test_state select 'invite',public.health_os_pod_action('invite',v::uuid)->>'code' from pod_test_state where k='pod';
insert into pod_test_state select 'goal',public.health_os_pod_action('goal',v::uuid,'{"name":"Mobility","targetPerWeek":3}')->>'id' from pod_test_state where k='pod';
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-b'),true);
select public.health_os_pod_action('accept',null,jsonb_build_object('code',v)) from pod_test_state where k='invite';
select public.health_os_pod_action('complete',(select v::uuid from pod_test_state where k='pod'),jsonb_build_object('goalId',(select v from pod_test_state where k='goal'),'day',current_date,'completed',true));
do $$begin
 if (select count(*) from public.health_os_pods)<>1 or (select count(*) from public.health_os_pod_members)<>2 or (select count(*) from public.health_os_pod_completions)<>1 then raise exception 'Member visibility failed'; end if;
 begin perform public.health_os_pod_action('invite',(select v::uuid from pod_test_state where k='pod')); raise exception 'Non-owner invite allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.health_os_pod_completions values((select v::uuid from pod_test_state where k='pod'),(select v::uuid from pod_test_state where k='goal'),(select v::uuid from pod_test_state where k='account-a'),current_date,true); raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-a'),true);
do $$begin if (select count(*) from public.health_os_pod_completions where completed)<>1 then raise exception 'Completion synchronization failed'; end if; end$$;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-c'),true);
do $$begin
 if exists(select 1 from public.health_os_pods) or exists(select 1 from public.health_os_pod_members) or exists(select 1 from public.health_os_pod_goals) or exists(select 1 from public.health_os_pod_completions) then raise exception 'Unauthorized read'; end if;
 begin perform public.health_os_pod_action('goal',(select v::uuid from pod_test_state where k='pod'),'{"name":"Attack","targetPerWeek":1}'); raise exception 'Unauthorized mutation'; exception when insufficient_privilege then null; end;
 begin perform public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from pod_test_state where k='invite'))); raise exception 'Invite reuse'; exception when raise_exception then if sqlerrm='Invite reuse' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-b'),true);
select public.health_os_pod_action('leave',v::uuid) from pod_test_state where k='pod';
do $$begin if exists(select 1 from public.health_os_pods) then raise exception 'Leave did not revoke visibility'; end if; end$$;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-a'),true);
update pod_test_state set v=public.health_os_pod_action('invite',(select v::uuid from pod_test_state where k='pod'))->>'code' where k='invite';
select public.health_os_pod_action('revoke',v::uuid) from pod_test_state where k='pod';
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-c'),true);
do $$begin
 begin perform public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from pod_test_state where k='invite'))); raise exception 'Revoked invite accepted'; exception when raise_exception then if sqlerrm='Revoked invite accepted' then raise; end if; end;
end$$;
reset role;
update public.health_os_pod_invites set revoked_at=null,expires_at=now()-interval '1 second' where pod_id=(select v::uuid from pod_test_state where k='pod');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-c'),true);
do $$begin
 begin perform public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from pod_test_state where k='invite'))); raise exception 'Expired invite accepted'; exception when raise_exception then if sqlerrm='Expired invite accepted' then raise; end if; end;
end$$;
reset role;
update public.health_os_pod_invites set revoked_at=null,expires_at=now()+interval '1 hour' where code_hash=encode(extensions.digest((select v from pod_test_state where k='invite'),'sha256'),'hex');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-b'),true);
select public.health_os_pod_action('accept',null,jsonb_build_object('code',v)) from pod_test_state where k='invite';
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-a'),true);
select public.health_os_pod_action('remove',v::uuid,jsonb_build_object('memberId',(select v from pod_test_state where k='account-b'))) from pod_test_state where k='pod';
select set_config('request.jwt.claim.sub',(select v from pod_test_state where k='account-b'),true);
do $$begin if exists(select 1 from public.health_os_pods) then raise exception 'Removed member retained access'; end if; end$$;
reset role;
set local role anon;
do $$begin
 begin perform public.health_os_pod_action('create',null,'{"name":"Unauthorized"}'); raise exception 'Anonymous create allowed'; exception when insufficient_privilege then null; end;
end$$;
reset role;
select 'PASS: A/B membership/completion; C and anon denied; direct writes denied; invite reuse/revoke/expiry denied; leave and removal revoke access' as result;
rollback;
