-- Add an atomic adapter to the existing biological sync API. It runs as the
-- authenticated account, uses existing RLS and cursor locks, and creates no
-- MCP-specific health store. The existing single-record API remains unchanged.
create or replace function public.health_os_commit_biological_records(
  p_writes jsonb,
  p_expectations jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_write jsonb;
  v_check jsonb;
  v_actual bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_writes) is distinct from 'array'
     or jsonb_typeof(p_expectations) is distinct from 'array'
     or jsonb_array_length(p_writes) not between 1 and 50
     or jsonb_array_length(p_expectations)>100
     or pg_catalog.octet_length(p_writes::text)>1000000
  then raise exception 'Invalid atomic biological batch' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_writes)) <>
     (select count(distinct x->>'id') from jsonb_array_elements(p_writes) x)
  then raise exception 'Duplicate write identity' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_expectations)) <>
     (select count(distinct x->>'id') from jsonb_array_elements(p_expectations) x)
  then raise exception 'Duplicate expectation identity' using errcode='22023'; end if;

  -- The same owner cursor lock is used by the existing single-record function,
  -- so browser sync and cloud batches share one revision boundary.
  insert into public.health_os_biological_sync_cursors(user_id,current_version)
  values(v_uid,0) on conflict(user_id) do nothing;
  perform 1 from public.health_os_biological_sync_cursors where user_id=v_uid for update;
  for v_check in select value from jsonb_array_elements(p_expectations) loop
    if coalesce(length(v_check->>'id'),0) not between 1 and 150
       or not (v_check ? 'revision') then raise exception 'Invalid source expectation' using errcode='22023'; end if;
    select revision into v_actual from public.health_os_biological_records
      where user_id=v_uid and record_id=v_check->>'id';
    if v_actual is distinct from (v_check->>'revision')::bigint
    then raise exception 'Biological source revision changed' using errcode='40001'; end if;
  end loop;
  for v_write in select value from jsonb_array_elements(p_writes) loop
    if v_write->>'userId' is distinct from v_uid::text
       or coalesce(length(v_write->>'id'),0) not between 1 and 150
    then raise exception 'Biological account or identity mismatch' using errcode='42501'; end if;
    select value into v_check from jsonb_array_elements(p_expectations)
      where value->>'id'=v_write->>'id';
    if not found then raise exception 'Write requires a revision expectation' using errcode='22023'; end if;
    v_result := public.health_os_save_biological_record(v_write->>'id',v_write,(v_check->>'revision')::bigint);
    if v_result->>'status' is distinct from 'saved'
    then raise exception 'Biological record commit conflicted' using errcode='40001'; end if;
    v_results := v_results || jsonb_build_array(v_result->'payload');
  end loop;
  return jsonb_build_object('records',v_results);
end;
$$;
revoke all on function public.health_os_commit_biological_records(jsonb,jsonb) from public,anon;
grant execute on function public.health_os_commit_biological_records(jsonb,jsonb) to authenticated;
