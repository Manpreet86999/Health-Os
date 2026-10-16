-- Run inside one transaction; no persistent accounts, Pods, or tokens.
begin;
create temp table fp_state(k text primary key,v text);
insert into fp_state values('a',gen_random_uuid()::text),('b',gen_random_uuid()::text),('c',gen_random_uuid()::text);
insert into auth.users(id,aud,role,email) select v::uuid,'authenticated','authenticated','fp-'||v||'@validation.invalid' from fp_state;
grant all on fp_state to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='a'),true);
insert into fp_state values('pod',public.health_os_pod_action('create',null,'{"name":"Winter Arc","displayName":"Maan","timezone":"Asia/Kolkata"}')->>'id');
insert into fp_state select 'first-period',current_period_id::text from public.health_os_pods where id=(select v::uuid from fp_state where k='pod');
insert into fp_state values('goal',public.health_os_pod_action('goal',(select v::uuid from fp_state where k='pod'),'{"name":"Gym","targetPerWeek":4}')->>'id');
insert into fp_state values('code',public.health_os_pod_action('invite',(select v::uuid from fp_state where k='pod'))->>'code');
select set_config('request.jwt.claim.sub',(select v from fp_state where k='c'),true);
do $$ begin
 if exists(select 1 from public.health_os_pods) or exists(select 1 from public.health_os_pod_participants) or exists(select 1 from public.health_os_pod_goal_versions) then raise exception 'Unrelated account read'; end if;
 if public.health_os_pod_action('preview',null,jsonb_build_object('code',(select v from fp_state where k='code')))->>'status'<>'ready' then raise exception 'Preview unavailable'; end if;
 if public.health_os_pod_action('preview',null,jsonb_build_object('code',(select v from fp_state where k='code')))->>'inviter'<>'Maan' then raise exception 'Display name missing'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='b'),true);
select public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from fp_state where k='code'),'displayName','Parm'));
select public.health_os_pod_action('complete',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'day',(now() at time zone 'Asia/Kolkata')::date,'timezone','Asia/Kolkata','completed',true));
do $$ begin
 if (select count(*) from public.health_os_pod_members where pod_id=(select v::uuid from fp_state where k='pod'))<>2 then raise exception 'Pair capacity'; end if;
 if public.health_os_pod_action('preview',null,jsonb_build_object('code',(select v from fp_state where k='code')))->>'status'<>'used' then raise exception 'Used preview'; end if;
 begin perform public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from fp_state where k='code'))); raise exception 'Accepted used'; exception when raise_exception then if sqlerrm='Accepted used' then raise; end if; end;
 begin perform public.health_os_pod_action('complete',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'userId',(select v from fp_state where k='a'),'day',current_date,'completed',false)); raise exception 'Changed other user'; exception when insufficient_privilege then null; end;
 begin perform public.health_os_pod_action('complete',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'day',current_date+3,'timezone','Pacific/Kiritimati','completed',true)); raise exception 'Future accepted'; exception when raise_exception then if sqlerrm='Future accepted' then raise; end if; end;
 begin perform public.health_os_pod_action('complete',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'day',current_date-366,'timezone','UTC','completed',true)); raise exception 'Too old accepted'; exception when raise_exception then if sqlerrm='Too old accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='a'),true);
select public.health_os_pod_action('update_goal',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'name','Gym together','targetPerWeek',5,'description','A little movement'));
do $$ begin
 if (select target_per_week from public.health_os_pod_goal_versions where goal_id=(select v::uuid from fp_state where k='goal') and effective_week=date_trunc('week',now() at time zone 'Asia/Kolkata')::date)<>4 then raise exception 'Old target rewritten'; end if;
 if (select target_per_week from public.health_os_pod_goal_versions where goal_id=(select v::uuid from fp_state where k='goal') and effective_week=date_trunc('week',now() at time zone 'Asia/Kolkata')::date+7)<>5 then raise exception 'Next Monday missing'; end if;
end $$;
select public.health_os_pod_action('archive_goal',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal')));
do $$ begin if not exists(select 1 from public.health_os_pod_completions where goal_id=(select v::uuid from fp_state where k='goal')) then raise exception 'Archive erased history'; end if; end $$;
select public.health_os_pod_action('remove',(select v::uuid from fp_state where k='pod'),jsonb_build_object('memberId',(select v from fp_state where k='b')));
do $$ begin if not exists(select 1 from public.health_os_pod_completions where membership_period_id=(select v::uuid from fp_state where k='first-period')) then raise exception 'Owner lost historical period'; end if; end $$;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='b'),true);
do $$ begin if exists(select 1 from public.health_os_pods) or exists(select 1 from public.health_os_pod_completions) or exists(select 1 from public.health_os_pod_goal_versions) then raise exception 'Removed member access'; end if; end $$;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='a'),true);
update fp_state set v=public.health_os_pod_action('invite',(select v::uuid from fp_state where k='pod'))->>'code' where k='code';
select set_config('request.jwt.claim.sub',(select v from fp_state where k='c'),true);
select public.health_os_pod_action('accept',null,jsonb_build_object('code',(select v from fp_state where k='code'),'displayName','Replacement'));
do $$ begin
 if exists(select 1 from public.health_os_pod_goals where membership_period_id=(select v::uuid from fp_state where k='first-period')) or exists(select 1 from public.health_os_pod_completions) or exists(select 1 from public.health_os_pod_participants where membership_period_id=(select v::uuid from fp_state where k='first-period')) then raise exception 'Replacement history leak'; end if;
 begin perform public.health_os_pod_action('complete',(select v::uuid from fp_state where k='pod'),jsonb_build_object('goalId',(select v from fp_state where k='goal'),'day',current_date,'completed',true)); raise exception 'Old period write'; exception when raise_exception then if sqlerrm='Old period write' then raise; end if; end;
end $$;
select public.health_os_pod_action('leave',(select v::uuid from fp_state where k='pod'));
do $$ begin if exists(select 1 from public.health_os_pods) then raise exception 'Left member access'; end if; end $$;
select set_config('request.jwt.claim.sub',(select v from fp_state where k='a'),true);
select public.health_os_pod_action('delete',(select v::uuid from fp_state where k='pod'));
do $$ begin if exists(select 1 from public.health_os_pod_periods where pod_id=(select v::uuid from fp_state where k='pod')) then raise exception 'Delete left periods'; end if; end $$;
reset role;
select 'PASS: preview, explicit names, ownership, civil dates, immutable targets, archive, removal, replacement isolation, leave and deletion' as result;
rollback;
