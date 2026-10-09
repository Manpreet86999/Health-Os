create table public.health_os_workers (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 100),
  capabilities jsonb not null default '{}'::jsonb check(octet_length(capabilities::text)<100000),
  updated_at timestamptz not null default now()
);
create index health_os_workers_owner on public.health_os_workers(user_id);
alter table public.health_os_workers enable row level security;
revoke all on public.health_os_workers from anon, authenticated;
grant select, insert, update, delete on public.health_os_workers to authenticated;
create policy workers_owner on public.health_os_workers to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table public.health_os_worker_jobs (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check(operation in ('research.status','research.statistics','research.workbench','research.notebook','medical.extract','medical.units','medical.fhir','medical.cql','analytics.rebuild','voice.transcribe','report.pdf')),
 input jsonb not null default '{}'::jsonb check(octet_length(input::text)<=4200000),
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 result jsonb check(octet_length(result::text)<=8000000), error text check(length(error)<=2000),
 attempts integer not null default 0, worker_id uuid, lease_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), finished_at timestamptz
);
create index health_os_jobs_owner_queue on public.health_os_worker_jobs(user_id,status,created_at);
alter table public.health_os_worker_jobs enable row level security;
revoke all on public.health_os_worker_jobs from anon,authenticated;
grant select on public.health_os_worker_jobs to authenticated;
create policy jobs_owner_read on public.health_os_worker_jobs for select to authenticated using ((select auth.uid())=user_id);

-- Only these state-transition functions can mutate jobs. Every function checks auth.uid().
create function public.health_os_enqueue_job(p_id uuid,p_operation text,p_input jsonb)
returns public.health_os_worker_jobs language plpgsql security definer set search_path = '' as $$
declare result public.health_os_worker_jobs;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into result from public.health_os_worker_jobs where id=p_id and user_id=auth.uid();
 if found then return result; end if;
 delete from public.health_os_worker_jobs where user_id=auth.uid() and finished_at<now()-interval '7 days';
 if (select count(*) from public.health_os_worker_jobs where user_id=auth.uid() and status in ('queued','running'))>=12 then raise exception 'Twelve jobs are already pending. Cancel an unused job first.'; end if;
 if coalesce((select sum(octet_length(input::text)) from public.health_os_worker_jobs where user_id=auth.uid() and status in ('queued','running')),0)+octet_length(p_input::text)>8400000 then raise exception 'Pending datasets exceed 8 MB. Finish or cancel an earlier analysis first.'; end if;
 insert into public.health_os_worker_jobs(id,user_id,operation,input) values(p_id,auth.uid(),p_operation,p_input) returning * into result;
 return result;
end $$;
create function public.health_os_claim_job(p_worker uuid,p_operations text[])
returns setof public.health_os_worker_jobs language plpgsql security definer set search_path = '' as $$
declare candidate uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.health_os_workers where id=p_worker and user_id=auth.uid()) then raise exception 'Worker is not registered to this account'; end if;
 update public.health_os_worker_jobs set status='failed',input='{}',error='Worker lease expired after three attempts.',finished_at=now(),lease_token=null
 where user_id=auth.uid() and status='running' and lease_until<now() and attempts>=3;
 select id into candidate from public.health_os_worker_jobs
 where user_id=auth.uid() and operation=any(p_operations) and attempts<3
 and (status='queued' or (status='running' and lease_until<now()))
 order by created_at for update skip locked limit 1;
 return query update public.health_os_worker_jobs set status='running',attempts=attempts+1,worker_id=p_worker,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where id=candidate and user_id=auth.uid() returning *;
end $$;
create function public.health_os_finish_job(p_id uuid,p_worker uuid,p_lease uuid,p_result jsonb,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare accepted boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.health_os_worker_jobs set status=case when p_error is null then 'completed' else 'failed' end,
 result=case when p_error is null then p_result else null end,error=left(p_error,2000),input='{}',finished_at=now(),lease_token=null,lease_until=null
 where id=p_id and user_id=auth.uid() and worker_id=p_worker and lease_token=p_lease and status='running' and lease_until>now();
 accepted=found;
 -- Bound cloud result history per account: newest 20 results, at most 16 MB combined.
 delete from public.health_os_worker_jobs where user_id=auth.uid() and id in (
   select id from (select id,row_number() over(order by finished_at desc,id) as position,
     sum(coalesce(octet_length(result::text),0)) over(order by finished_at desc,id) as bytes
     from public.health_os_worker_jobs where user_id=auth.uid() and finished_at is not null) history
   where position>20 or bytes>16000000
 );
 return accepted;
end $$;
create function public.health_os_cancel_job(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.health_os_worker_jobs set status='cancelled',input='{}',finished_at=now(),lease_token=null,lease_until=null
 where id=p_id and user_id=auth.uid() and status in ('queued','running');
 return found;
end $$;
revoke all on function public.health_os_enqueue_job(uuid,text,jsonb),public.health_os_claim_job(uuid,text[]),public.health_os_finish_job(uuid,uuid,uuid,jsonb,text),public.health_os_cancel_job(uuid) from public,anon;
grant execute on function public.health_os_enqueue_job(uuid,text,jsonb),public.health_os_claim_job(uuid,text[]),public.health_os_finish_job(uuid,uuid,uuid,jsonb,text),public.health_os_cancel_job(uuid) to authenticated;
