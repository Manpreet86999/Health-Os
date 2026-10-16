begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users order by created_at limit 1),true);
set local role authenticated;
do $$
declare owner uuid:=auth.uid(); test_id text:='food-rls-'||gen_random_uuid()::text; total integer;
begin
  if owner is null then raise exception 'RLS test needs an existing registered account'; end if;
  insert into public.health_os_biological_records(user_id,record_id,payload)
  values(owner,test_id,jsonb_build_object('id',test_id,'userId',owner,'type','food','name','Synthetic RLS test','metadata',jsonb_build_object('nutritionProfiles','[]')));
  select count(*) into total from public.health_os_foods where food_id=test_id;
  if total<>1 then raise exception 'Owner food read failed'; end if;
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  select count(*) into total from public.health_os_foods where food_id=test_id;
  if total<>0 then raise exception 'Cross-owner food visible'; end if;
  select count(*) into total from public.health_os_biological_records where record_id=test_id;
  if total<>0 then raise exception 'Cross-owner record visible'; end if;
  update public.health_os_biological_records set payload=payload where record_id=test_id;
  get diagnostics total=row_count;
  if total<>0 then raise exception 'Cross-owner update allowed'; end if;
  begin
    insert into public.health_os_biological_records(user_id,record_id,payload)
    values(owner,test_id||'-other',jsonb_build_object('id',test_id||'-other'));
    raise exception 'Cross-owner insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.health_os_food_source_records(provider,source_key,payload,checksum,expires_at,license)
    values('test','test','{}','test',now(),'test');
    raise exception 'Client source cache write allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.health_os_foods; raise exception 'Anonymous foods read allowed';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.health_os_food_source_records; raise exception 'Anonymous cache read allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Owner reads pass; cross-owner read/insert/update denied; anonymous reads denied; client cache writes denied; fixtures rolled back' as result;
