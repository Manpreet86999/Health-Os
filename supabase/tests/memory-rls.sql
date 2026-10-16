-- Transactional fixtures only: no existing user records are touched.
begin;
insert into auth.users(id) values ('0f521141-107a-48c9-a433-591966b3f001'),('0f521141-107a-48c9-a433-591966b3f002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"0f521141-107a-48c9-a433-591966b3f001","role":"authenticated","is_anonymous":false}',true);
select public.health_memory_remember('Prefers rice','nutri','integration-fixture',1,(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'gte-small','supabase-edge-v1');
select set_config('health_os.fixture_memory',(select id::text from public.health_memory_item where source_id='integration-fixture'),true);
do $$begin
  if (select count(*) from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',5))<>1 then raise exception 'Owner retrieval failed';end if;
  if (select count(*) from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'train','gte-small','supabase-edge-v1',5))<>0 then raise exception 'Domain filter failed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"0f521141-107a-48c9-a433-591966b3f002","role":"authenticated","is_anonymous":false}',true);
do $$begin
  if (select count(*) from public.health_memory_item)<>0 or (select count(*) from public.health_memory_embedding)<>0 then raise exception 'Cross-account read leaked';end if;
  if (select count(*) from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',5))<>0 then raise exception 'Cross-account retrieval leaked';end if;
  begin
    insert into public.health_memory_item(user_id,summary,domain,source_id,confidence) values('0f521141-107a-48c9-a433-591966b3f001','forbidden','nutri','test',1);
    raise exception 'Cross-account write was allowed';
  exception when insufficient_privilege then null;end;
  delete from public.health_memory_item where id=current_setting('health_os.fixture_memory')::uuid;
end $$;
select set_config('request.jwt.claims','{"sub":"0f521141-107a-48c9-a433-591966b3f001","role":"authenticated","is_anonymous":false}',true);
do $$begin
  if (select count(*) from public.health_memory_item)<>1 then raise exception 'Cross-account deletion succeeded';end if;
  update public.health_memory_item set summary='Updated preference';
  if (select count(*) from public.health_memory_embedding)<>0 then raise exception 'Changed summary retained stale vector';end if;
  insert into public.health_memory_embedding(memory_id,embedding,embedding_model,embedding_version) values(current_setting('health_os.fixture_memory')::uuid,(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'gte-small','supabase-edge-v1');
  update public.health_memory_item set sensitivity='medical';
  if (select count(*) from public.health_memory_embedding)<>0 then raise exception 'Sensitivity change retained vector';end if;
  delete from public.health_memory_item;
  if (select count(*) from public.health_memory_item)<>0 then raise exception 'Reset failed';end if;
end $$;
reset role;
do $$begin
  if has_table_privilege('anon','public.health_memory_item','SELECT') or has_function_privilege('anon','public.health_memory_match(extensions.vector,text,text,text,integer)','EXECUTE') then raise exception 'Anonymous access is allowed';end if;
end $$;
rollback;
