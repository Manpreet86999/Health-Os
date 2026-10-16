-- Account-scoped, content-free usage ledger. Reservations serialize paid calls across devices.
create table public.health_ai_usage (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id text not null check(length(request_id) between 1 and 240),
 usage_day date not null default (now() at time zone 'Asia/Kolkata')::date,
 reserved_usd numeric not null check(reserved_usd>=0),
 charged_usd numeric check(charged_usd>=0),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create index health_ai_usage_day_idx on public.health_ai_usage(user_id,usage_day);
alter table public.health_ai_usage enable row level security;
create policy health_ai_usage_owner on public.health_ai_usage to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.health_ai_usage from public,anon;
grant select,insert,update on public.health_ai_usage to authenticated;

create function public.health_ai_reserve(p_request_id text,p_maximum_usd numeric,p_limit_usd numeric,p_metadata jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); spent numeric;
begin
 if owner is null then raise exception 'Authentication required'; end if;
 if p_maximum_usd is null or p_limit_usd is null or p_maximum_usd<0 or p_limit_usd<0 or p_maximum_usd>100 or p_limit_usd>100 then raise exception 'Invalid budget'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,73));
 select coalesce(sum(coalesce(charged_usd,reserved_usd)),0) into spent from public.health_ai_usage where user_id=owner and usage_day=(now() at time zone 'Asia/Kolkata')::date;
 if p_maximum_usd>0 and spent+p_maximum_usd>p_limit_usd then raise exception 'Daily paid budget exceeded'; end if;
 insert into public.health_ai_usage(user_id,request_id,reserved_usd,metadata) values(owner,p_request_id,p_maximum_usd,jsonb_build_object('role',p_metadata->>'role','model',p_metadata->>'model','provider',p_metadata->>'provider','paid',p_metadata->'paid','reason',p_metadata->>'reason'));
end $$;
create function public.health_ai_settle(p_request_id text,p_usage jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare amount numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 amount:=coalesce((p_usage->>'estimatedCostUsd')::numeric,0);
 if amount<0 or amount>100 then raise exception 'Invalid usage amount'; end if;
 update public.health_ai_usage set charged_usd=amount,metadata=metadata||jsonb_build_object('latencyMs',p_usage->'latencyMs','tokens',p_usage->'tokens','estimatedCostUsd',amount,'escalationReason',case when p_usage ? 'escalationReason' then 'Previous model unavailable or invalid output' else null end)
 where user_id=auth.uid() and request_id=p_request_id and charged_usd is null;
 if not found then raise exception 'Usage reservation unavailable or already settled'; end if;
end $$;
create function public.health_ai_usage_summary()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('date',(now() at time zone 'Asia/Kolkata')::date,'timezone','Asia/Kolkata','requests',count(*),'paidUsd',coalesce(sum(coalesce(charged_usd,reserved_usd)),0),'tokens',coalesce(sum((metadata->>'tokens')::bigint),0),'recent',coalesce((select jsonb_agg(x.metadata) from (select metadata from public.health_ai_usage where user_id=auth.uid() order by created_at desc limit 20) x),'[]'::jsonb))
 from public.health_ai_usage where user_id=auth.uid() and usage_day=(now() at time zone 'Asia/Kolkata')::date;
$$;
revoke all on function public.health_ai_reserve(text,numeric,numeric,jsonb),public.health_ai_settle(text,jsonb),public.health_ai_usage_summary() from public,anon;
grant execute on function public.health_ai_reserve(text,numeric,numeric,jsonb),public.health_ai_settle(text,jsonb),public.health_ai_usage_summary() to authenticated;
