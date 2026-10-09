-- Friend Pods: metadata and explicit completion only. No personal-record joins.
create table public.health_os_pods (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(char_length(name) between 1 and 80), created_at timestamptz not null default now()
);
create table public.health_os_pod_members (
 pod_id uuid not null references public.health_os_pods(id) on delete cascade,
 user_id uuid not null references auth.users(id), joined_at timestamptz not null default now(), primary key(pod_id,user_id)
);
create table public.health_os_pod_invites (
 id uuid primary key default gen_random_uuid(), pod_id uuid not null references public.health_os_pods(id) on delete cascade,
 code_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, accepted_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.health_os_pod_goals (
 id uuid primary key default gen_random_uuid(), pod_id uuid not null references public.health_os_pods(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 120), target_per_week integer not null check(target_per_week between 1 and 7), created_at timestamptz not null default now()
);
create table public.health_os_pod_completions (
 pod_id uuid not null, goal_id uuid not null references public.health_os_pod_goals(id) on delete cascade,
 user_id uuid not null, day date not null, completed boolean not null, primary key(goal_id,user_id,day),
 foreign key(pod_id,user_id) references public.health_os_pod_members(pod_id,user_id) on delete cascade
);
create index health_os_pod_members_user on public.health_os_pod_members(user_id,pod_id);
create index health_os_pod_goals_pod on public.health_os_pod_goals(pod_id);
create index health_os_pod_completions_pod on public.health_os_pod_completions(pod_id,day);
create function public.health_os_is_pod_member(p_pod uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.health_os_pod_members where pod_id=p_pod and user_id=(select auth.uid()));
$$;
revoke all on function public.health_os_is_pod_member(uuid) from public,anon;
grant execute on function public.health_os_is_pod_member(uuid) to authenticated;
alter table public.health_os_pods enable row level security;
alter table public.health_os_pod_members enable row level security;
alter table public.health_os_pod_invites enable row level security;
alter table public.health_os_pod_goals enable row level security;
alter table public.health_os_pod_completions enable row level security;
create policy pod_member_read on public.health_os_pods for select to authenticated using(public.health_os_is_pod_member(id));
create policy pod_members_read on public.health_os_pod_members for select to authenticated using(public.health_os_is_pod_member(pod_id));
create policy pod_goals_read on public.health_os_pod_goals for select to authenticated using(public.health_os_is_pod_member(pod_id));
create policy pod_completions_read on public.health_os_pod_completions for select to authenticated using(public.health_os_is_pod_member(pod_id));
-- Invite hashes are never readable through the data API. All mutations are checked RPCs.
revoke all on public.health_os_pods,public.health_os_pod_members,public.health_os_pod_invites,public.health_os_pod_goals,public.health_os_pod_completions from anon,authenticated;
grant select on public.health_os_pods,public.health_os_pod_members,public.health_os_pod_goals,public.health_os_pod_completions to authenticated;

create function public.health_os_pod_action(action text, pod uuid default null, args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.health_os_pods; inv public.health_os_pod_invites; code text; gid uuid; result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if action='create' then
  if (select count(*) from public.health_os_pods where owner_id=uid)>=10 then raise exception 'Pod limit reached'; end if;
  insert into public.health_os_pods(owner_id,name) values(uid,trim(args->>'name')) returning * into p;
  insert into public.health_os_pod_members(pod_id,user_id) values(p.id,uid);
  return jsonb_build_object('id',p.id,'name',p.name);
 end if;
 if action='accept' then
  -- Lock the invite and then the Pod, serializing joins across multiple invites.
  select * into inv from public.health_os_pod_invites where code_hash=encode(extensions.digest(upper(trim(args->>'code')),'sha256'),'hex') for update;
  if not found or inv.revoked_at is not null or inv.accepted_by is not null or inv.expires_at<=now() then raise exception 'Invitation invalid or expired'; end if;
  select * into p from public.health_os_pods where id=inv.pod_id for update;
  if public.health_os_is_pod_member(p.id) then raise exception 'Already a member'; end if;
  if (select count(*) from public.health_os_pod_members where pod_id=p.id)>=2 then raise exception 'Pod is full'; end if;
  insert into public.health_os_pod_members(pod_id,user_id) values(p.id,uid);
  update public.health_os_pod_invites set accepted_by=uid where id=inv.id;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=p.id and id<>inv.id and accepted_by is null;
  return jsonb_build_object('id',p.id,'name',p.name);
 end if;
 select * into p from public.health_os_pods where id=pod for update;
 if not found or not public.health_os_is_pod_member(pod) then raise exception 'Pod unavailable' using errcode='42501'; end if;
 if action='invite' then
  if p.owner_id<>uid then raise exception 'Owner required' using errcode='42501'; end if;
  if (select count(*) from public.health_os_pod_members where pod_id=pod)>=2 then raise exception 'Pod is full'; end if;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
  code:=upper(encode(extensions.gen_random_bytes(16),'hex'));
  insert into public.health_os_pod_invites(pod_id,code_hash,expires_at) values(pod,encode(extensions.digest(code,'sha256'),'hex'),now()+interval '48 hours') returning * into inv;
  return jsonb_build_object('code',code,'expiresAt',inv.expires_at);
 elsif action='revoke' then
  if p.owner_id<>uid then raise exception 'Owner required' using errcode='42501'; end if;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
 elsif action='goal' then
  insert into public.health_os_pod_goals(pod_id,name,target_per_week) values(pod,trim(args->>'name'),(args->>'targetPerWeek')::integer) returning id into gid;
  return jsonb_build_object('id',gid);
 elsif action='complete' then
  gid:=(args->>'goalId')::uuid;
  if not exists(select 1 from public.health_os_pod_goals where id=gid and pod_id=pod) then raise exception 'Goal unavailable'; end if;
  if (args->>'day')::date>current_date or (args->>'day')::date<current_date-365 then raise exception 'Completion date out of range'; end if;
  if jsonb_typeof(args->'completed') is distinct from 'boolean' then raise exception 'Completion must be boolean'; end if;
  insert into public.health_os_pod_completions(pod_id,goal_id,user_id,day,completed) values(pod,gid,uid,(args->>'day')::date,(args->>'completed')::boolean)
  on conflict(goal_id,user_id,day) do update set completed=excluded.completed;
 elsif action='leave' then
  if p.owner_id=uid then delete from public.health_os_pods where id=pod;
  else delete from public.health_os_pod_members where pod_id=pod and user_id=uid; end if;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
 elsif action='remove' then
  if p.owner_id<>uid or (args->>'memberId')::uuid=uid then raise exception 'Owner required; use leave to disconnect yourself' using errcode='42501'; end if;
  delete from public.health_os_pod_members where pod_id=pod and user_id=(args->>'memberId')::uuid;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
 else raise exception 'Unsupported action'; end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.health_os_pod_action(text,uuid,jsonb) from public,anon;
grant execute on function public.health_os_pod_action(text,uuid,jsonb) to authenticated;
