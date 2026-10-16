begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users order by created_at limit 1),true);
set local role authenticated;
do $$
declare owner uuid:=auth.uid(); test_id text:='intelligence-rls-'||gen_random_uuid()::text; total integer;
begin
 if owner is null then raise exception 'An existing registered account is needed'; end if;
 insert into public.health_os_biological_records(user_id,record_id,payload) values(owner,test_id,jsonb_build_object('id',test_id,'userId',owner,'type','journal','domain','Insights','name','Synthetic intelligence ownership test','metadata',jsonb_build_object('intelligenceMemory',true)));
 select count(*) into total from public.health_os_biological_records where record_id=test_id;
 if total<>1 then raise exception 'Owner read failed'; end if;
 update public.health_os_biological_records set payload=payload||jsonb_build_object('name','Synthetic updated pattern') where record_id=test_id;
 get diagnostics total=row_count;
 if total<>1 then raise exception 'Owner update failed'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 select count(*) into total from public.health_os_biological_records where record_id=test_id;
 if total<>0 then raise exception 'Cross-owner learned record visible'; end if;
 update public.health_os_biological_records set payload=payload where record_id=test_id;
 get diagnostics total=row_count;
 if total<>0 then raise exception 'Cross-owner write allowed'; end if;
 begin
  insert into public.health_os_biological_records(user_id,record_id,payload) values(owner,test_id||'-foreign','{}');
  raise exception 'Cross-owner insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare total integer; begin
 begin
  select count(*) into total from public.health_os_biological_records;
  if total<>0 then raise exception 'Anonymous health data visible'; end if;
 exception when insufficient_privilege then null; end;
 begin
  insert into public.health_os_biological_records(user_id,record_id,payload) values(gen_random_uuid(),'intelligence-anon-test','{}');
  raise exception 'Anonymous insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: owner read/write; non-owner read/write denied; anonymous read/write denied; synthetic fixtures rolled back' as result;
