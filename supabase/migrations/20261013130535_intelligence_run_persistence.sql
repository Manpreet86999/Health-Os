-- Durable owned run/plan/observation state. No provider credentials are stored here.
create table public.health_agent_run (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 run_id text not null check(length(run_id) between 1 and 150),
 workspace_id text not null check(length(workspace_id) between 1 and 300),
 version bigint not null check(version>0),
 status text not null check(status in ('created','interpreting','gathering_context','planning','executing','awaiting_approval','verifying','replanning','completed','blocked','failed','cancelled')),
 state jsonb not null check(octet_length(state::text)<=2000000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(user_id,run_id)
);
create index health_agent_run_owner_updated_idx on public.health_agent_run(user_id,updated_at desc);
alter table public.health_agent_run enable row level security;
create policy health_agent_run_owner on public.health_agent_run to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.health_agent_run from public,anon;
grant select,insert,update on public.health_agent_run to authenticated;
create function public.health_agent_run_save(p_state jsonb,p_expected_version bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); wanted bigint; changed integer;
begin
 if owner is null or p_state->>'ownerId'<>owner::text then raise exception 'Run owner mismatch' using errcode='42501';end if;
 wanted:=(p_state->>'version')::bigint;
 if p_state->>'id' is null or p_state->>'workspaceId' is null or p_state->>'status' is null then raise exception 'Incomplete run' using errcode='22023';end if;
 if p_expected_version is null then
  if wanted<>1 then raise exception 'Initial run version must be one' using errcode='22023';end if;
  insert into public.health_agent_run(user_id,run_id,workspace_id,version,status,state) values(owner,p_state->>'id',p_state->>'workspaceId',wanted,p_state->>'status',p_state) on conflict do nothing;
 else
  if wanted<>p_expected_version+1 then raise exception 'Invalid run version' using errcode='22023';end if;
  update public.health_agent_run set version=wanted,status=p_state->>'status',state=p_state,updated_at=now()
  where user_id=owner and run_id=p_state->>'id' and workspace_id=p_state->>'workspaceId' and version=p_expected_version;
 end if;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Run changed on another executor; reload before continuing' using errcode='40001';end if;
 return p_state;
end;
$$;
revoke all on function public.health_agent_run_save(jsonb,bigint) from public,anon;
grant execute on function public.health_agent_run_save(jsonb,bigint) to authenticated;
