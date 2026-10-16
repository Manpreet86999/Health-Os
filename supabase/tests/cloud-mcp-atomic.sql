begin;
do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  stamp text := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  observation jsonb;
  receipt jsonb;
  result jsonb;
  n integer;
begin
  insert into auth.users(id,email) values(owner_a,owner_a::text||'@example.test'),(owner_b,owner_b::text||'@example.test');
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  observation := jsonb_build_object('id','cloud-atomic-test-weight','userId',owner_a,'type','vital','domain','Body','name','Weight','value',75,'unit','kg','source','Cloud atomic test','deviceId','test','quality','manual','syncState','saved','revision',1,'createdAt',stamp,'updatedAt',stamp,'timestamp',stamp,'metadata',jsonb_build_object('metric','Weight'));
  receipt := observation || jsonb_build_object('id','cloud-atomic-test-receipt','type','journal','domain','Today','name','Test receipt','metadata',jsonb_build_object('mcpReceipt',true));
  result := public.health_os_commit_biological_records(jsonb_build_array(observation,receipt),'[{"id":"cloud-atomic-test-weight","revision":null},{"id":"cloud-atomic-test-receipt","revision":null}]');
  if jsonb_array_length(result->'records')<>2 then raise exception 'Atomic record and receipt missing'; end if;
  select count(*) into n from public.health_os_biological_records where user_id=owner_a;
  if n<>2 then raise exception 'Unexpected record count'; end if;
  begin
    perform public.health_os_commit_biological_records(jsonb_build_array(observation||jsonb_build_object('value',76),receipt||jsonb_build_object('userId',owner_b)),'[{"id":"cloud-atomic-test-weight","revision":1},{"id":"cloud-atomic-test-receipt","revision":1}]');
    raise exception 'Cross-account write was accepted';
  exception when insufficient_privilege then null;
  end;
  if (select payload->>'value' from public.health_os_biological_records where record_id='cloud-atomic-test-weight')<>'75' then raise exception 'Partial failed batch was committed'; end if;
  begin
    perform public.health_os_commit_biological_records(jsonb_build_array(observation),'[{"id":"cloud-atomic-test-weight","revision":null}]');
    raise exception 'Stale expected revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.health_os_commit_biological_records(jsonb_build_array(observation),'[]');
    raise exception 'Missing revision expectation was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  select count(*) into n from public.health_os_biological_records where user_id=owner_a;
  if n<>0 then raise exception 'RLS exposed another account'; end if;
  begin
    perform public.health_os_commit_biological_records(jsonb_build_array(observation),'[{"id":"cloud-atomic-test-weight","revision":null}]');
    raise exception 'Other account could write owner A';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'Atomic record/receipt commit, rollback, CAS, required expectations, RLS reads and cross-account writes passed' as verification;
rollback;
