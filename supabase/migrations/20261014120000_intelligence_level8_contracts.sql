-- ============================================================================
-- HEALTH OS INTELLIGENCE — LEVEL 8 CONTRACT MIGRATION
-- STATUS: PREPARED
-- DEPLOYED: NO
-- AUTHOR: Antigravity (Prepared for Codex Level 8 Hand-off)
-- TARGET: Supabase PostgreSQL (Public & Private Schemas)
-- ============================================================================

-- 1. Extend Step Status check on health_agent_run to include 'waiting_for_device'
-- Allows device-only steps (e.g. active workout, local sensors, cameras) to pause safely.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'health_agent_run_step_status_check'
  ) then
    alter table public.health_agent_run drop constraint health_agent_run_step_status_check;
  end if;
end $$;

-- Step states live inside JSON; the table has a run-status constraint.
-- Preserve it, including scheduled waits introduced by cloud continuation.
alter table public.health_agent_run drop constraint if exists health_agent_run_status_check;
alter table public.health_agent_run add constraint health_agent_run_status_check
 check(status in ('created','interpreting','gathering_context','planning','executing',
 'awaiting_approval','waiting','verifying','replanning','completed','blocked','failed','cancelled'));

-- 2. Add lease tracking and background execution policy to body_os_private.health_cloud_grant
alter table body_os_private.health_cloud_grant
  add column if not exists executor_id text,
  add column if not exists executor_type text check (executor_type in ('cloud_worker', 'browser', 'android', 'device')),
  add column if not exists lease_version integer not null default 1,
  add column if not exists allow_writes boolean not null default false,
  add column if not exists medical_consent boolean not null default false,
  add column if not exists permitted_domains jsonb not null default '["goals","readiness","recovery","training","nutrition","sleep","body"]'::jsonb,
  add column if not exists max_spend_usd numeric(10,4) not null default 1.0000,
  add column if not exists max_tools_limit integer not null default 20,
  add column if not exists max_actions_limit integer not null default 5;

alter table body_os_private.health_cloud_grant
 add constraint health_cloud_grant_level8_limits check (
  lease_version > 0 and max_spend_usd between 0 and 100 and
  max_tools_limit between 1 and 100 and max_actions_limit between 0 and 12 and
  jsonb_typeof(permitted_domains)='array');

-- 3. Atomic optimistic CAS lease acquisition function
create or replace function body_os_private.health_cloud_acquire_lease(
  p_owner uuid,
  p_run_id text,
  p_executor_id text,
  p_executor_type text,
  p_expected_version integer,
  p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_grant body_os_private.health_cloud_grant;
  v_new_version integer;
  v_expires_at timestamptz;
begin
  -- Validate executor type
  if p_executor_type is null or p_executor_type not in ('cloud_worker', 'browser', 'android', 'device')
     or p_executor_id is null or length(p_executor_id) not between 1 and 150
     or p_expected_version is null or p_lease_seconds is null or p_lease_seconds not between 1 and 600 then
    raise exception 'Invalid executor type' using errcode = '42501';
  end if;

  -- Lock target row for update
  select * into v_grant
  from body_os_private.health_cloud_grant
  where user_id = p_owner and run_id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'grant_not_found');
  end if;

  if not v_grant.enabled or v_grant.expires_at <= now() then
    return jsonb_build_object('success', false, 'reason', 'grant_revoked_or_expired');
  end if;
  if not exists(select 1 from public.health_agent_run where user_id=p_owner and run_id=p_run_id and status not in ('completed','cancelled','failed')) then
    return jsonb_build_object('success', false, 'reason', 'run_unavailable');
  end if;

  -- Check if existing lease is still valid by another executor
  if v_grant.lease_until is not null
     and v_grant.lease_until > now()
     and v_grant.executor_id is distinct from p_executor_id then
    return jsonb_build_object('success', false, 'reason', 'lease_active_by_other', 'current_executor', v_grant.executor_id, 'expires_at', v_grant.lease_until);
  end if;

  -- CAS version check
  if p_expected_version is not null and v_grant.lease_version is distinct from p_expected_version then
    return jsonb_build_object('success', false, 'reason', 'version_conflict', 'actual_version', v_grant.lease_version);
  end if;

  v_new_version := v_grant.lease_version + 1;
  v_expires_at := now() + make_interval(secs => p_lease_seconds);

  update body_os_private.health_cloud_grant
  set executor_id = p_executor_id,
      lease_id = gen_random_uuid(),
      executor_type = p_executor_type,
      lease_version = v_new_version,
      lease_until = v_expires_at,
      last_run_at = now()
  where user_id = p_owner and run_id = p_run_id
  returning lease_id into v_grant.lease_id;

  return jsonb_build_object(
    'success', true,
    'lease_id', v_grant.lease_id,
    'version', v_new_version,
    'expires_at', v_expires_at
  );
end;
$$;
revoke all on function body_os_private.health_cloud_acquire_lease(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function body_os_private.health_cloud_acquire_lease(uuid, text, text, text, integer, integer) to service_role;

-- 4. Indices for biological records supporting Level 8 memory categorization and outcome learning
-- Memory is serialized text in existing records; tolerate malformed historical rows.
create or replace function body_os_private.health_memory_field(p_payload jsonb,p_field text)
returns text language plpgsql immutable security invoker set search_path='' as $$
begin
 return case when jsonb_typeof(p_payload->'metadata'->'memory')='string'
  then (p_payload->'metadata'->>'memory')::jsonb->>p_field
  else p_payload->'metadata'->'memory'->>p_field end;
exception when others then return null;
end;$$;
revoke all on function body_os_private.health_memory_field(jsonb,text) from public,anon;
grant usage on schema body_os_private to authenticated,service_role;
grant execute on function body_os_private.health_memory_field(jsonb,text) to authenticated,service_role;
create index if not exists idx_bio_memory_category
  on public.health_os_biological_records(user_id, (body_os_private.health_memory_field(payload,'category')))
  where payload->'metadata'->>'intelligenceMemory' = 'true';

create index if not exists idx_bio_memory_status
  on public.health_os_biological_records(user_id, (body_os_private.health_memory_field(payload,'status')))
  where payload->'metadata'->>'intelligenceMemory' = 'true';

create index if not exists idx_bio_action_receipt_idempotency
  on public.health_os_biological_records(user_id, (payload->'metadata'->>'receiptId'))
  where payload->'metadata'->>'mcpReceipt' = 'true' or payload->'metadata'->>'intelligenceReceipt' = 'true';

-- Recheck new write/domain permissions in the same transaction as the health write.
-- Keep the existing exact-proposal and source-revision guards intact.
create or replace function public.health_cloud_commit_approved_action(p_run_id text,p_proposal jsonb,p_writes jsonb,p_expectations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid();r public.health_agent_run;sources jsonb;policy jsonb;begin
 if owner is null then raise exception 'Sign in' using errcode='42501';end if;
 select * into r from public.health_agent_run where user_id=owner and run_id=p_run_id for update;
 policy:=r.state->'backgroundPolicy';
 if not found or r.status<>'executing' or not coalesce((r.state->>'allowBackgroundReads')::boolean,false)
  or not coalesce((policy->>'enabled')::boolean,false) or not coalesce((policy->>'allowWrites')::boolean,false)
  or not coalesce((public.health_cloud_grant_status(p_run_id)->>'enabled')::boolean,false)
  or r.state->'pendingProposal' is distinct from p_proposal
  or r.state->'approval'->>'ownerId' is distinct from owner::text
  or r.state->'approval'->>'proposalId' is distinct from p_proposal->>'id'
  then raise exception 'Exact owner approval or background write permission is unavailable or changed' using errcode='42501';end if;
 if (r.state->'request'->'policy'->'domains') ? 'medical' and not coalesce((policy->>'medicalConsent')::boolean,false)
  then raise exception 'Separate Medical consent required' using errcode='42501';end if;
 if policy ? 'permittedDomains' and exists(select 1 from jsonb_array_elements_text(r.state->'request'->'policy'->'domains') d where not (policy->'permittedDomains') ? d)
  then raise exception 'Background domain permission changed' using errcode='42501';end if;
 if (policy ? 'maxActionsLimit' and coalesce((r.state->'counters'->>'actions')::integer,0)>=(policy->>'maxActionsLimit')::integer)
  then raise exception 'Owner action budget exceeded' using errcode='42501';end if;
 if policy ? 'maxSpendUsd' and (select coalesce(sum((u->>'estimatedCostUsd')::numeric),0) from jsonb_array_elements(coalesce(r.state->'usage','[]'::jsonb)) u)>=(policy->>'maxSpendUsd')::numeric
  then raise exception 'Owner spending budget exceeded' using errcode='42501';end if;
 select coalesce(jsonb_agg(case when b.record_id is null or b.payload->>'deletedAt' is not null then 'null'::jsonb else jsonb_build_array(b.record_id,b.revision,null) end order by source.ordinality),'[]'::jsonb) into sources
 from jsonb_array_elements_text(p_proposal->'sourceIds') with ordinality source(id,ordinality) left join public.health_os_biological_records b on b.user_id=owner and b.record_id=source.id;
 if sources is distinct from (p_proposal->>'sourceFingerprint')::jsonb then raise exception 'Approved health evidence changed' using errcode='40001';end if;
 return public.health_os_commit_biological_records(p_writes,p_expectations);
end;$$;
revoke all on function public.health_cloud_commit_approved_action(text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.health_cloud_commit_approved_action(text,jsonb,jsonb,jsonb) to authenticated;
