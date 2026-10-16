-- Friend Pods additive upgrade. REVIEW BEFORE PRODUCTION EXECUTION.
-- Existing payload fields, IDs, check-ins, invitation state and timestamps are preserved.
-- Apply atomically; a failed preflight/constraint rolls back the complete upgrade.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table public.health_os_pods, public.health_os_pod_members, public.health_os_pod_goals,
 public.health_os_pod_completions, public.health_os_pod_invites in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.health_os_pods p where not exists(select 1 from public.health_os_pod_members m where m.pod_id=p.id and m.user_id=p.owner_id)) then
  raise exception 'Preflight: Pod owner membership missing; review existing rows before upgrading'; end if;
 if exists(select 1 from public.health_os_pod_members group by pod_id having count(*)>2) then
  raise exception 'Preflight: existing Pod has more than two members; no automatic deletion is permitted'; end if;
 if exists(select 1 from public.health_os_pod_completions c join public.health_os_pod_goals g on g.id=c.goal_id where c.pod_id<>g.pod_id) then
  raise exception 'Preflight: completion/goal Pod mismatch; no automatic rewrite is permitted'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and (
  (tablename='health_os_pod_goals' and policyname<>'pod_goals_read') or
  (tablename='health_os_pod_completions' and policyname<>'pod_completions_read'))) then
  raise exception 'Preflight: additional Friend Pods policies require review; no policies will be removed automatically'; end if;
end $$;
create schema if not exists health_os_private;
-- Do not change existing schema-wide grants: this namespace may have unrelated users.
-- Restrict only the Friend Pods functions introduced below.
grant usage on schema health_os_private to authenticated;

create table if not exists public.health_os_pod_periods (
 id uuid primary key default gen_random_uuid(), pod_id uuid not null references public.health_os_pods(id) on delete cascade,
 started_at timestamptz not null default now(), ended_at timestamptz, created_at timestamptz not null default now(), legacy_history boolean not null default false,
 unique(id,pod_id), check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists health_os_pod_one_open_period on public.health_os_pod_periods(pod_id) where ended_at is null;
create table if not exists public.health_os_pod_participants (
 membership_period_id uuid not null, pod_id uuid not null, user_id uuid not null references auth.users(id),
 display_name text not null check(length(trim(display_name)) between 1 and 40), role text not null check(role in ('owner','member')),
 joined_at timestamptz not null default now(), left_at timestamptz,
 primary key(membership_period_id,user_id), foreign key(membership_period_id,pod_id) references public.health_os_pod_periods(id,pod_id) on delete cascade
);
create index if not exists health_os_pod_participants_user on public.health_os_pod_participants(user_id,membership_period_id);
alter table public.health_os_pods add column if not exists current_period_id uuid, add column if not exists updated_at timestamptz not null default now(), add column if not exists timezone text not null default 'UTC';
alter table public.health_os_pod_members add column if not exists membership_period_id uuid, add column if not exists display_name text not null default 'Your friend';
alter table public.health_os_pod_goals add column if not exists membership_period_id uuid, add column if not exists description text not null default '' check(length(description)<=500), add column if not exists archived_at timestamptz, add column if not exists created_by uuid references auth.users(id), add column if not exists source_goal_id uuid;
alter table public.health_os_pod_completions add column if not exists membership_period_id uuid, add column if not exists timezone text not null default 'UTC', add column if not exists updated_at timestamptz not null default now();
alter table public.health_os_pod_invites add column if not exists membership_period_id uuid, add column if not exists created_by uuid references auth.users(id), add column if not exists accepted_at timestamptz;

-- Legacy rows cannot prove which previous pair produced them. Preserve them in a closed,
-- owner-only period, then copy goal definitions (not check-ins) into the current pair.
do $$ declare p record; legacy uuid; active uuid; begin
 for p in select * from public.health_os_pods where current_period_id is null loop
  insert into public.health_os_pod_periods(pod_id,started_at,ended_at,legacy_history) values(p.id,p.created_at,now(),true) returning id into legacy;
  insert into public.health_os_pod_participants(membership_period_id,pod_id,user_id,display_name,role,joined_at)
   select legacy,p.id,user_id,case when user_id=p.owner_id then 'You' else 'Previous partner' end,case when user_id=p.owner_id then 'owner' else 'member' end,min(created) from (
    select p.owner_id as user_id,p.created_at as created union all select user_id,updated_at from public.health_os_pod_completions where pod_id=p.id
   ) s group by user_id;
  update public.health_os_pod_goals set membership_period_id=legacy where pod_id=p.id and membership_period_id is null;
  update public.health_os_pod_participants set left_at=now() where membership_period_id=legacy and user_id<>p.owner_id;
  update public.health_os_pod_completions set membership_period_id=legacy where pod_id=p.id and membership_period_id is null;
  insert into public.health_os_pod_periods(pod_id) values(p.id) returning id into active;
  update public.health_os_pods set current_period_id=active where id=p.id and current_period_id is null;
  update public.health_os_pod_members set membership_period_id=active,display_name=case when user_id=p.owner_id and display_name='Your friend' then 'You' else display_name end where pod_id=p.id and membership_period_id is null;
  insert into public.health_os_pod_participants(membership_period_id,pod_id,user_id,display_name,role,joined_at)
   select active,p.id,user_id,display_name,case when user_id=p.owner_id then 'owner' else 'member' end,joined_at from public.health_os_pod_members where pod_id=p.id;
  insert into public.health_os_pod_goals(pod_id,membership_period_id,name,target_per_week,description,created_by,source_goal_id)
   select pod_id,active,name,target_per_week,description,p.owner_id,id from public.health_os_pod_goals where membership_period_id=legacy and archived_at is null;
  update public.health_os_pod_invites set membership_period_id=active where pod_id=p.id and membership_period_id is null;
 end loop;
end $$;
-- Validate backfill before tightening only the NEW columns.
do $$ begin
 if exists(select 1 from public.health_os_pods where current_period_id is null)
 or exists(select 1 from public.health_os_pod_members where membership_period_id is null)
 or exists(select 1 from public.health_os_pod_goals where membership_period_id is null)
 or exists(select 1 from public.health_os_pod_completions where membership_period_id is null)
 or exists(select 1 from public.health_os_pod_invites where membership_period_id is null) then
  raise exception 'Backfill incomplete; migration aborted without deleting or repairing data'; end if;
end $$;
alter table public.health_os_pod_members alter column membership_period_id set not null;
alter table public.health_os_pod_goals alter column membership_period_id set not null;
alter table public.health_os_pod_completions alter column membership_period_id set not null;
alter table public.health_os_pod_invites alter column membership_period_id set not null;
-- Fixed names + catalog checks make repeated execution safe. Validate replacements first.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pods'::regclass and conname='fp_current_period_fk') then
  alter table public.health_os_pods add constraint fp_current_period_fk foreign key(current_period_id,id) references public.health_os_pod_periods(id,pod_id) deferrable initially deferred;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_members'::regclass and conname='fp_member_participant_fk') then
  alter table public.health_os_pod_members add constraint fp_member_participant_fk foreign key(membership_period_id,user_id) references public.health_os_pod_participants(membership_period_id,user_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_goals'::regclass and conname='fp_goal_scope_unique') then
  alter table public.health_os_pod_goals add constraint fp_goal_scope_unique unique(id,membership_period_id,pod_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_goals'::regclass and conname='fp_goal_period_fk') then
  alter table public.health_os_pod_goals add constraint fp_goal_period_fk foreign key(membership_period_id,pod_id) references public.health_os_pod_periods(id,pod_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_completions'::regclass and conname='fp_completion_participant_fk') then
  alter table public.health_os_pod_completions add constraint fp_completion_participant_fk foreign key(membership_period_id,user_id) references public.health_os_pod_participants(membership_period_id,user_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_completions'::regclass and conname='fp_completion_goal_scope_fk') then
  alter table public.health_os_pod_completions add constraint fp_completion_goal_scope_fk foreign key(goal_id,membership_period_id,pod_id) references public.health_os_pod_goals(id,membership_period_id,pod_id) on delete cascade;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.health_os_pod_invites'::regclass and conname='fp_invite_period_fk') then
  alter table public.health_os_pod_invites add constraint fp_invite_period_fk foreign key(membership_period_id,pod_id) references public.health_os_pod_periods(id,pod_id);
 end if;
 -- The sole DROP: removes a relationship whose ON DELETE CASCADE destroys completion
 -- history when an active member leaves. Validated participant FK above replaces it.
 if exists(select 1 from pg_constraint where conrelid='public.health_os_pod_completions'::regclass and conname='health_os_pod_completions_pod_id_user_id_fkey') then
  alter table public.health_os_pod_completions drop constraint health_os_pod_completions_pod_id_user_id_fkey;
 end if;
end $$;
create table if not exists public.health_os_pod_goal_versions (
 goal_id uuid not null, membership_period_id uuid not null, pod_id uuid not null,
 effective_week date not null, name text not null check(length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=500),
 target_per_week integer not null check(target_per_week between 1 and 7), created_at timestamptz not null default now(),
 primary key(goal_id,effective_week), foreign key(goal_id,membership_period_id,pod_id) references public.health_os_pod_goals(id,membership_period_id,pod_id) on delete cascade,
 check(extract(isodow from effective_week)=1)
);
insert into public.health_os_pod_goal_versions(goal_id,membership_period_id,pod_id,effective_week,name,description,target_per_week)
 select id,membership_period_id,pod_id,date_trunc('week',created_at at time zone 'UTC')::date,name,description,target_per_week from public.health_os_pod_goals on conflict(goal_id,effective_week) do nothing;
create index if not exists health_os_pod_versions_pod on public.health_os_pod_goal_versions(pod_id,membership_period_id);
create index if not exists health_os_pod_goals_period on public.health_os_pod_goals(membership_period_id);
create index if not exists health_os_pod_completions_period on public.health_os_pod_completions(membership_period_id,day);

create or replace function health_os_private.pod_period_access_v2(period uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.health_os_pod_participants h join public.health_os_pods p on p.id=h.pod_id
 join public.health_os_pod_members m on m.pod_id=p.id and m.user_id=(select auth.uid())
 where h.membership_period_id=period and h.user_id=(select auth.uid()) and h.left_at is null
 and (not exists(select 1 from public.health_os_pod_periods legacy where legacy.id=period and legacy.legacy_history) or p.owner_id=(select auth.uid())));
$$;
revoke all on function health_os_private.pod_period_access_v2(uuid) from public,anon;
grant execute on function health_os_private.pod_period_access_v2(uuid) to authenticated;
-- An active owner retains their historical periods; departed members lose all Pod access.
-- Policy replacement changes visibility only; it deletes no underlying rows.
alter policy pod_goals_read on public.health_os_pod_goals to authenticated using(health_os_private.pod_period_access_v2(membership_period_id));
alter policy pod_completions_read on public.health_os_pod_completions to authenticated using(health_os_private.pod_period_access_v2(membership_period_id));
alter table public.health_os_pod_periods enable row level security;
alter table public.health_os_pod_participants enable row level security;
alter table public.health_os_pod_goal_versions enable row level security;
do $$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='health_os_pod_periods' and policyname='pod_period_read') then
 create policy pod_period_read on public.health_os_pod_periods for select to authenticated using(health_os_private.pod_period_access_v2(id));
 end if; end $$;
do $$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='health_os_pod_participants' and policyname='pod_participant_read') then
 create policy pod_participant_read on public.health_os_pod_participants for select to authenticated using(health_os_private.pod_period_access_v2(membership_period_id));
 end if; end $$;
do $$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='health_os_pod_goal_versions' and policyname='pod_version_read') then
 create policy pod_version_read on public.health_os_pod_goal_versions for select to authenticated using(health_os_private.pod_period_access_v2(membership_period_id));
 end if; end $$;
revoke all on public.health_os_pod_periods,public.health_os_pod_participants,public.health_os_pod_goal_versions from public,anon,authenticated;
grant select on public.health_os_pod_periods,public.health_os_pod_participants,public.health_os_pod_goal_versions to authenticated;

-- One lock order for every mutation: Pod first, invitation second. Capacity is serialized.
create or replace function health_os_private.pod_action_v2(action text,pod uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.health_os_pods; inv public.health_os_pod_invites; g public.health_os_pod_goals;
 code text; status text; period uuid; gid uuid; tz text; today date; effective date; dn text; victim uuid;
begin
 if uid is null then raise exception 'Sign in to open Friend Pods.' using errcode='42501'; end if;
 dn:=trim(coalesce(args->>'displayName','Your friend'));
 if action in ('create','accept','display_name') and (length(dn)<1 or length(dn)>40) then raise exception 'Display name must be 1–40 characters.'; end if;
 if action='create' then
  -- Account lock also serializes the per-owner creation limit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if (select count(*) from public.health_os_pods where owner_id=uid)>=10 then raise exception 'Pod limit reached'; end if;
  tz:=coalesce(args->>'timezone','UTC');
  if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Timezone unavailable'; end if;
  insert into public.health_os_pods(owner_id,name,timezone) values(uid,trim(args->>'name'),tz) returning * into p;
  insert into public.health_os_pod_periods(pod_id) values(p.id) returning id into period;
  update public.health_os_pods set current_period_id=period where id=p.id;
  insert into public.health_os_pod_participants(membership_period_id,pod_id,user_id,display_name,role) values(period,p.id,uid,dn,'owner');
  insert into public.health_os_pod_members(pod_id,user_id,membership_period_id,display_name) values(p.id,uid,period,dn);
  return jsonb_build_object('id',p.id);
 end if;
 if action in ('preview','accept') then
  code:=upper(trim(args->>'code'));
  if code is null or code !~ '^[A-F0-9]{32}$' then
   if action='preview' then return jsonb_build_object('status','invalid'); end if;
   raise exception 'Enter the complete invitation code.';
  end if;
  select * into inv from public.health_os_pod_invites where code_hash=encode(extensions.digest(code,'sha256'),'hex');
  if not found then
   if action='preview' then return jsonb_build_object('status','invalid'); end if;
   raise exception 'This invitation could not be found. Check the code and Health OS project.';
  end if;
  select * into p from public.health_os_pods where id=inv.pod_id for update;
  select * into inv from public.health_os_pod_invites where id=inv.id for update;
  status:=case when inv.accepted_by is not null then 'used' when inv.revoked_at is not null or inv.membership_period_id<>p.current_period_id then 'revoked'
   when inv.expires_at<=now() then 'expired' when (select count(*) from public.health_os_pod_members where pod_id=p.id)>=2 then 'full' else 'ready' end;
  if action='preview' then
   if status<>'ready' then return jsonb_build_object('status',status); end if;
   return jsonb_build_object('status',status,'name',p.name,'inviter',(select display_name from public.health_os_pod_members where pod_id=p.id and user_id=p.owner_id),'expiresAt',inv.expires_at);
  end if;
  if status<>'ready' then raise exception '%',case status when 'used' then 'This invitation has already been used.' when 'revoked' then 'This invitation is no longer active.' when 'expired' then 'This invitation has expired. Ask your friend to send a new invitation.' else 'This Friend Pod already has two members.' end; end if;
  if public.health_os_is_pod_member(p.id) then raise exception 'You already belong to this Pod.'; end if;
  insert into public.health_os_pod_participants(membership_period_id,pod_id,user_id,display_name,role) values(p.current_period_id,p.id,uid,dn,'member');
  insert into public.health_os_pod_members(pod_id,user_id,membership_period_id,display_name) values(p.id,uid,p.current_period_id,dn);
  update public.health_os_pod_invites set accepted_by=uid,accepted_at=now() where id=inv.id;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=p.id and id<>inv.id and accepted_by is null;
  return jsonb_build_object('id',p.id);
 end if;
 select * into p from public.health_os_pods where id=pod for update;
 if not found or not public.health_os_is_pod_member(pod) then raise exception 'This Pod is unavailable.' using errcode='42501'; end if;
 tz:=p.timezone; today:=(now() at time zone tz)::date;
 if action='rename' then
  if p.owner_id<>uid then raise exception 'Owner required' using errcode='42501'; end if;
  update public.health_os_pods set name=trim(args->>'name'),updated_at=now() where id=pod;
 elsif action='display_name' then
  update public.health_os_pod_members set display_name=dn where pod_id=pod and user_id=uid;
  update public.health_os_pod_participants set display_name=dn where membership_period_id=p.current_period_id and user_id=uid;
 elsif action in ('invite','revoke') then
  if p.owner_id<>uid then raise exception 'Owner required' using errcode='42501'; end if;
  if action='invite' and (select count(*) from public.health_os_pod_members where pod_id=pod)>=2 then raise exception 'This Friend Pod already has two members.'; end if;
  update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
  if action='invite' then
   code:=upper(encode(extensions.gen_random_bytes(16),'hex'));
   insert into public.health_os_pod_invites(pod_id,membership_period_id,created_by,code_hash,expires_at)
    values(pod,p.current_period_id,uid,encode(extensions.digest(code,'sha256'),'hex'),now()+interval '48 hours') returning * into inv;
   return jsonb_build_object('code',code,'expiresAt',inv.expires_at);
  end if;
 elsif action='goal' then
  insert into public.health_os_pod_goals(pod_id,membership_period_id,name,description,target_per_week,created_by)
   values(pod,p.current_period_id,trim(args->>'name'),coalesce(args->>'description',''),(args->>'targetPerWeek')::integer,uid) returning * into g;
  insert into public.health_os_pod_goal_versions values(g.id,p.current_period_id,pod,date_trunc('week',today::timestamp)::date,g.name,g.description,g.target_per_week,now());
  return jsonb_build_object('id',g.id);
 elsif action in ('complete','update_goal','archive_goal') then
  gid:=(args->>'goalId')::uuid;
  select * into g from public.health_os_pod_goals where id=gid and pod_id=pod and membership_period_id=p.current_period_id;
  if not found or g.archived_at is not null then raise exception 'This goal is unavailable.'; end if;
  if action='archive_goal' then update public.health_os_pod_goals set archived_at=now() where id=gid;
  elsif action='update_goal' then
   effective:=date_trunc('week',today::timestamp)::date+7;
   insert into public.health_os_pod_goal_versions(goal_id,membership_period_id,pod_id,effective_week,name,description,target_per_week)
    values(gid,p.current_period_id,pod,effective,trim(args->>'name'),coalesce(args->>'description',''),(args->>'targetPerWeek')::integer)
    on conflict(goal_id,effective_week) do update set name=excluded.name,description=excluded.description,target_per_week=excluded.target_per_week;
   return jsonb_build_object('effectiveWeek',effective);
  else
   if args ? 'userId' and args->>'userId'<>uid::text then raise exception 'You can only change your own check-ins.' using errcode='42501'; end if;
   tz:=coalesce(args->>'timezone','UTC');
   if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Timezone unavailable'; end if;
   today:=(now() at time zone tz)::date;
   if args->>'day' is null or (args->>'day')::date>today or (args->>'day')::date<today-365
    or (args->>'day')::date<(select (started_at at time zone tz)::date from public.health_os_pod_periods where id=p.current_period_id)
    or (args->>'day')::date<(g.created_at at time zone tz)::date then raise exception 'Check-in must be within this goal and membership period, no more than 365 days ago, and not in the future.'; end if;
   if jsonb_typeof(args->'completed') is distinct from 'boolean' then raise exception 'Completion must be boolean'; end if;
   insert into public.health_os_pod_completions(pod_id,membership_period_id,goal_id,user_id,day,completed,timezone)
    values(pod,p.current_period_id,gid,uid,(args->>'day')::date,(args->>'completed')::boolean,tz)
    on conflict(goal_id,user_id,day) do update set completed=excluded.completed,timezone=excluded.timezone,updated_at=now();
  end if;
 elsif action in ('leave','remove','delete') then
  if action='delete' or action='leave' and p.owner_id=uid then
   if p.owner_id<>uid then raise exception 'Owner required' using errcode='42501'; end if;
   delete from public.health_os_pods where id=pod;
  else
   victim:=case when action='leave' then uid else (args->>'memberId')::uuid end;
   if action='remove' and (p.owner_id<>uid or victim=p.owner_id) then raise exception 'Owner required; use delete to disconnect yourself' using errcode='42501'; end if;
   if not exists(select 1 from public.health_os_pod_members where pod_id=pod and user_id=victim) then raise exception 'Member unavailable'; end if;
   update public.health_os_pod_periods set ended_at=now() where id=p.current_period_id;
   update public.health_os_pod_participants set left_at=now() where membership_period_id=p.current_period_id and user_id=victim;
   delete from public.health_os_pod_members where pod_id=pod and user_id=victim;
   update public.health_os_pod_invites set revoked_at=now() where pod_id=pod and accepted_by is null;
   insert into public.health_os_pod_periods(pod_id) values(pod) returning id into period;
   insert into public.health_os_pod_participants(membership_period_id,pod_id,user_id,display_name,role)
    select period,pod,user_id,display_name,'owner' from public.health_os_pod_members where pod_id=pod;
   update public.health_os_pod_members set membership_period_id=period where pod_id=pod;
   update public.health_os_pods set current_period_id=period,updated_at=now() where id=pod;
  end if;
 else raise exception 'Unsupported Pod action'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function health_os_private.pod_action_v2(text,uuid,jsonb) from public,anon;
grant execute on function health_os_private.pod_action_v2(text,uuid,jsonb) to authenticated;
-- Exposed entry point runs as caller. Privileged logic is kept in the non-exposed schema.
create or replace function public.health_os_pod_action(action text,pod uuid default null,args jsonb default '{}'::jsonb)
 returns jsonb language sql security invoker set search_path='' as $$ select health_os_private.pod_action_v2(action,pod,args); $$;
revoke all on function public.health_os_pod_action(text,uuid,jsonb) from public,anon;
grant execute on function public.health_os_pod_action(text,uuid,jsonb) to authenticated;

-- Versioned endpoint for new clients; legacy endpoint delegates to identical checked logic.
create or replace function public.health_os_pod_action_v2(action text,pod uuid default null,args jsonb default '{}'::jsonb)
 returns jsonb language sql security invoker set search_path='' as $$ select health_os_private.pod_action_v2(action,pod,args); $$;
revoke all on function public.health_os_pod_action_v2(text,uuid,jsonb) from public,anon;
grant execute on function public.health_os_pod_action_v2(text,uuid,jsonb) to authenticated;
commit;
