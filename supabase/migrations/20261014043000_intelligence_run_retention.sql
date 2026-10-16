-- Explicit owner controls delete terminal run metadata only, never health records.
create function public.health_agent_run_delete(p_run_id text,p_expected_version bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); saved public.health_agent_run%rowtype;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into saved from public.health_agent_run where user_id=owner and run_id=p_run_id for update;
 if not found then return false;end if;
 if saved.version<>p_expected_version then raise exception 'Run changed; reload before deleting' using errcode='40001';end if;
 if saved.status not in ('completed','cancelled','failed') then raise exception 'Cancel unfinished work before deleting its trace' using errcode='22023';end if;
 if coalesce((saved.state->'executorLease'->>'expiresAt')::timestamptz,'-infinity'::timestamptz)>now() then raise exception 'An executor still owns this run' using errcode='40001';end if;
 delete from public.health_agent_run where user_id=owner and run_id=p_run_id;
 return true;
end;
$$;
revoke all on function public.health_agent_run_delete(text,bigint) from public,anon;
grant execute on function public.health_agent_run_delete(text,bigint) to authenticated;

create function public.health_agent_run_prune(p_older_than_days integer default 90)
returns integer language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); changed integer;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_older_than_days<30 or p_older_than_days>3650 then raise exception 'Retention must be between 30 and 3650 days' using errcode='22023';end if;
 delete from public.health_agent_run where user_id=owner and status in ('completed','cancelled','failed')
 and updated_at<now()-make_interval(days=>p_older_than_days)
 and coalesce((state->'executorLease'->>'expiresAt')::timestamptz,'-infinity'::timestamptz)<=now();
 get diagnostics changed=row_count;return changed;
end;
$$;
revoke all on function public.health_agent_run_prune(integer) from public,anon;
grant execute on function public.health_agent_run_prune(integer) to authenticated;
