-- Managed worker grants contain only encrypted, separately-created Auth sessions.
-- Health reads/writes continue using that owner's ordinary JWT and RLS.
alter table public.health_agent_run drop constraint health_agent_run_status_check;
alter table public.health_agent_run add constraint health_agent_run_status_check check(status in ('created','interpreting','gathering_context','planning','executing','awaiting_approval','waiting','verifying','replanning','completed','blocked','failed','cancelled'));
create schema if not exists body_os_private;
create table body_os_private.health_cloud_grant (
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id text not null check(length(run_id) between 1 and 150),
 secret_id uuid not null references vault.secrets(id),
 enabled boolean not null default true, expires_at timestamptz not null,
 lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 last_run_at timestamptz,last_error text not null default 'none' check(last_error in ('none','auth_expired','budget_or_provider','execution_blocked')),
 primary key(user_id,run_id)
);
alter table body_os_private.health_cloud_grant enable row level security;
revoke all on body_os_private.health_cloud_grant from public,anon,authenticated;

create function public.health_cloud_grant_save(p_owner uuid,p_run_id text,p_session jsonb,p_days integer)
returns void language plpgsql security definer set search_path='' as $$
declare secret uuid;begin
 if p_days not between 1 and 30 or not exists(select 1 from public.health_agent_run where user_id=p_owner and run_id=p_run_id and status not in ('completed','failed','cancelled')) then raise exception 'Invalid owned cloud goal';end if;
 if not coalesce(length(p_session->>'accessToken') between 10 and 20000 and length(p_session->>'refreshToken') between 1 and 10000 and (p_session->>'expiresAt')::numeric>extract(epoch from now())*1000,false) then raise exception 'Invalid delegated session';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_run_id,74));
 select secret_id into secret from body_os_private.health_cloud_grant where user_id=p_owner and run_id=p_run_id for update;
 if secret is null then secret:=vault.create_secret(p_session::text,'healthos-cloud-'||p_owner::text||'-'||md5(p_run_id),'Owner-consented independent cloud worker session');else perform vault.update_secret(secret,p_session::text);end if;
 insert into body_os_private.health_cloud_grant(user_id,run_id,secret_id,expires_at) values(p_owner,p_run_id,secret,now()+make_interval(days=>p_days))
 on conflict(user_id,run_id) do update set enabled=true,expires_at=excluded.expires_at,lease_id=null,lease_until=null,next_attempt_at=now(),last_error='none';
end;$$;
revoke all on function public.health_cloud_grant_save(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.health_cloud_grant_save(uuid,text,jsonb,integer) to service_role;

create function public.health_cloud_grant_status(p_run_id text,p_disable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();g body_os_private.health_cloud_grant;begin
 if owner is null then raise exception 'Sign in' using errcode='42501';end if;
 if p_disable then update body_os_private.health_cloud_grant set enabled=false,lease_id=null,lease_until=null where user_id=owner and run_id=p_run_id;end if;
 select * into g from body_os_private.health_cloud_grant where user_id=owner and run_id=p_run_id for share;
 return jsonb_build_object('enabled',coalesce(g.enabled and g.expires_at>now(),false),'expiresAt',g.expires_at,'lastRunAt',g.last_run_at,'lastError',coalesce(g.last_error,'none'));
end;$$;
revoke all on function public.health_cloud_grant_status(text,boolean) from public,anon;
grant execute on function public.health_cloud_grant_status(text,boolean) to authenticated;

create function public.health_cloud_reminder_is_due(p_metadata jsonb,p_now timestamptz default now())
returns boolean language plpgsql stable security invoker set search_path='' as $$begin
 if not coalesce(p_metadata->>'date' ~ '^\d{4}-\d{2}-\d{2}$',false) or not coalesce(p_metadata->>'time' ~ '^([01]\d|2[0-3]):[0-5]\d$',false) or p_metadata->>'timeZone' is null then return false;end if;
 return coalesce((((p_metadata->>'date')||' '||(p_metadata->>'time'))::timestamp at time zone (p_metadata->>'timeZone'))<=p_now,false);
exception when others then return false;end;$$;
revoke all on function public.health_cloud_reminder_is_due(jsonb,timestamptz) from public,anon;
grant execute on function public.health_cloud_reminder_is_due(jsonb,timestamptz) to authenticated;
create index health_bio_owned_scheduled_reminders on public.health_os_biological_records(user_id,(payload->'metadata'->>'agentRunId')) where payload->'metadata'->>'intelligenceReminder'='true' and payload->'metadata'->>'status'='scheduled';

create function public.health_cloud_grant_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare g body_os_private.health_cloud_grant;s text;l uuid:=gen_random_uuid();begin
 select q.* into g from body_os_private.health_cloud_grant q join public.health_agent_run r on r.user_id=q.user_id and r.run_id=q.run_id
 where q.enabled and q.expires_at>now() and q.next_attempt_at<=now() and (q.lease_until is null or q.lease_until<=now())
 and r.status not in ('failed','cancelled') and (r.status not in ('awaiting_approval','blocked','completed') or coalesce((r.state->'monitoring'->>'enabled')::boolean,false) or exists(select 1 from public.health_os_biological_records reminder where reminder.user_id=q.user_id and reminder.payload->'metadata'->>'agentRunId'=q.run_id and reminder.payload->'metadata'->>'intelligenceReminder'='true' and reminder.payload->'metadata'->>'status'='scheduled' and public.health_cloud_reminder_is_due(reminder.payload->'metadata')) or (r.state->'approval'->>'ownerId'=q.user_id::text and r.state->'approval'->>'proposalId'=r.state->'pendingProposal'->>'id' and exists(select 1 from jsonb_array_elements(r.state->'plan'->'steps') step where step->>'id'=r.state->>'pendingStepId' and (step->>'attempts')::integer<3))) and coalesce((r.state->>'allowBackgroundReads')::boolean,false)
 and (r.state->>'waitUntil' is null or (r.state->>'waitUntil')::timestamptz<=now() or coalesce((r.state->'monitoring'->>'enabled')::boolean,false))
 order by q.next_attempt_at for update of q skip locked limit 1;
 if not found then return null;end if;
 update body_os_private.health_cloud_grant set lease_id=l,lease_until=now()+interval '6 minutes' where user_id=g.user_id and run_id=g.run_id;
 select decrypted_secret into s from vault.decrypted_secrets where id=g.secret_id;
 return jsonb_build_object('ownerId',g.user_id,'runId',g.run_id,'leaseId',l,'expiresAt',g.expires_at,'session',s::jsonb);
end;$$;
revoke all on function public.health_cloud_grant_claim() from public,anon,authenticated;
grant execute on function public.health_cloud_grant_claim() to service_role;

create function public.health_cloud_grant_checkpoint(p_owner uuid,p_run_id text,p_lease uuid,p_session jsonb default null,p_error text default 'none',p_finish boolean default true)
returns boolean language plpgsql security definer set search_path='' as $$
declare g body_os_private.health_cloud_grant;begin
 if p_error not in ('none','auth_expired','budget_or_provider','execution_blocked') then raise exception 'Invalid error';end if;
 select * into g from body_os_private.health_cloud_grant where user_id=p_owner and run_id=p_run_id and lease_id=p_lease and enabled and expires_at>now() and lease_until>now() for update;
 if not found then return false;end if;
 if p_session is not null then perform vault.update_secret(g.secret_id,p_session::text);end if;
 if p_finish then update body_os_private.health_cloud_grant set lease_id=null,lease_until=null,last_run_at=now(),last_error=p_error,enabled=(p_error<>'auth_expired'),next_attempt_at=now()+case when p_error='none' then interval '1 minute' else interval '5 minutes' end where user_id=p_owner and run_id=p_run_id;end if;
 return true;
end;$$;
revoke all on function public.health_cloud_grant_checkpoint(uuid,text,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.health_cloud_grant_checkpoint(uuid,text,uuid,jsonb,text,boolean) to service_role;

-- Reuse the existing encrypted scheduler credential and derive this worker's URL.
create function body_os_private.dispatch_cloud_intelligence()
returns void language plpgsql security definer set search_path='' as $$
declare endpoint text;secret text;begin
 if not exists(select 1 from body_os_private.health_cloud_grant where enabled and expires_at>now() and next_attempt_at<=now()) then return;end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='body_os_email_function_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='body_os_email_scheduler_secret';
 if endpoint is null or secret is null or endpoint !~ '^https://[^/]+/functions/v1/body-os-email$' then raise exception 'Existing protected scheduler configuration unavailable';end if;
 perform net.http_post(url:=regexp_replace(endpoint,'body-os-email$','health-os-intelligence-worker'),headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=10000);
end;$$;
revoke all on function body_os_private.dispatch_cloud_intelligence() from public,anon,authenticated;
select cron.schedule('health-os-cloud-intelligence','* * * * *','select body_os_private.dispatch_cloud_intelligence()');

create function public.health_cloud_scheduler_auth() returns text language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='body_os_email_scheduler_secret';
$$;
revoke all on function public.health_cloud_scheduler_auth() from public,anon,authenticated;
grant execute on function public.health_cloud_scheduler_auth() to service_role;

-- Cancellation, approval identity and source revisions are checked in the health-write transaction.
create function public.health_cloud_commit_approved_action(p_run_id text,p_proposal jsonb,p_writes jsonb,p_expectations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid();r public.health_agent_run;sources jsonb;begin
 if owner is null then raise exception 'Sign in' using errcode='42501';end if;
 select * into r from public.health_agent_run where user_id=owner and run_id=p_run_id for update;
 if not found or r.status<>'executing' or not coalesce((r.state->>'allowBackgroundReads')::boolean,false) or not coalesce((public.health_cloud_grant_status(p_run_id)->>'enabled')::boolean,false) or r.state->'pendingProposal' is distinct from p_proposal or r.state->'approval'->>'ownerId' is distinct from owner::text or r.state->'approval'->>'proposalId' is distinct from p_proposal->>'id' then raise exception 'Exact owner approval is unavailable or changed' using errcode='42501';end if;
 select coalesce(jsonb_agg(case when b.record_id is null or b.payload->>'deletedAt' is not null then 'null'::jsonb else jsonb_build_array(b.record_id,b.revision,null) end order by source.ordinality),'[]'::jsonb) into sources
 from jsonb_array_elements_text(p_proposal->'sourceIds') with ordinality source(id,ordinality) left join public.health_os_biological_records b on b.user_id=owner and b.record_id=source.id;
 if sources is distinct from (p_proposal->>'sourceFingerprint')::jsonb then raise exception 'Approved health evidence changed' using errcode='40001';end if;
 return public.health_os_commit_biological_records(p_writes,p_expectations);
end;$$;
revoke all on function public.health_cloud_commit_approved_action(text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.health_cloud_commit_approved_action(text,jsonb,jsonb,jsonb) to authenticated;

create function public.health_cloud_deliver_reminder(p_run_id text,p_writes jsonb,p_expectations jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid();r public.health_agent_run;reminder public.health_os_biological_records;begin
 if owner is null or jsonb_typeof(p_writes) is distinct from 'array' or jsonb_array_length(p_writes) is distinct from 2 then raise exception 'Invalid reminder delivery' using errcode='42501';end if;
 select * into r from public.health_agent_run where user_id=owner and run_id=p_run_id for share;
 if not found or r.status in ('failed','cancelled') or not coalesce((r.state->>'allowBackgroundReads')::boolean,false) or not coalesce((public.health_cloud_grant_status(p_run_id)->>'enabled')::boolean,false) then raise exception 'Cloud reminder permission was revoked' using errcode='42501';end if;
 select * into reminder from public.health_os_biological_records where user_id=owner and record_id=p_writes->0->>'id' for update;
 if not found or reminder.payload->>'deletedAt' is not null or reminder.payload->>'type' is distinct from 'journal' or reminder.payload->'metadata'->>'intelligenceReminder' is distinct from 'true' or reminder.payload->'metadata'->>'status' is distinct from 'scheduled' or reminder.payload->'metadata'->>'agentRunId' is distinct from p_run_id or not public.health_cloud_reminder_is_due(reminder.payload->'metadata') or p_writes->0->'metadata'->>'status' is distinct from 'delivered' or p_writes->0->'metadata'->>'deliveredAt' is null or p_writes->1->>'type' is distinct from 'journal' or p_writes->1->'metadata'->>'intelligenceReminderAlert' is distinct from 'true' or p_writes->1->'metadata'->>'reminderId' is distinct from reminder.record_id then raise exception 'Invalid approved reminder metadata' using errcode='42501';end if;
 if ((p_writes->0)-'metadata'-'updatedAt'-'revision'-'syncState') is distinct from (reminder.payload-'metadata'-'updatedAt'-'revision'-'syncState') or ((p_writes->0->'metadata')-'status'-'deliveredAt') is distinct from ((reminder.payload->'metadata')-'status'-'deliveredAt') then raise exception 'Reminder delivery cannot change approved content' using errcode='42501';end if;
 if p_writes->1->>'id' is null or exists(select 1 from public.health_os_biological_records where user_id=owner and record_id=p_writes->1->>'id') then raise exception 'Reminder notification must be new' using errcode='40001';end if;
 return public.health_os_commit_biological_records(p_writes,p_expectations);
end;$$;
revoke all on function public.health_cloud_deliver_reminder(text,jsonb,jsonb) from public,anon;
grant execute on function public.health_cloud_deliver_reminder(text,jsonb,jsonb) to authenticated;
