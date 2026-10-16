-- Approved validation: explicit fixture IDs and owners, no unscoped mutation, always rollback.
begin;
select set_config('health_os.test_owner',(select id::text from auth.users where coalesce(is_anonymous,false)=false order by created_at limit 1),true);
select set_config('health_os.test_other',gen_random_uuid()::text,true);
select set_config('health_os.test_memory',gen_random_uuid()::text,true);
select set_config('health_os.test_expired',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('health_os.test_owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('health_os.test_owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
insert into public.health_memory_item(id,user_id,summary,domain,source_id,confidence)
values(current_setting('health_os.test_memory')::uuid,auth.uid(),'Preservation fixture','nutri','preservation-rls-fixture',1),
      (current_setting('health_os.test_expired')::uuid,auth.uid(),'Soft expiration fixture','train','preservation-rls-fixture',1);
insert into public.health_memory_embedding(memory_id,user_id,embedding,embedding_model,embedding_version)
values(current_setting('health_os.test_memory')::uuid,auth.uid(),(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'gte-small','supabase-edge-v1'),
      (current_setting('health_os.test_expired')::uuid,auth.uid(),(array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'gte-small','supabase-edge-v1');
do $$begin
  if (select count(*) from public.health_memory_item where id=current_setting('health_os.test_memory')::uuid and user_id=auth.uid())<>1 then raise exception 'Owner read-after-write failed';end if;
  if not exists(select 1 from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',10) where id=current_setting('health_os.test_memory')::uuid) then raise exception 'Owner vector retrieval failed';end if;
  if has_table_privilege(current_user,'public.health_memory_item','DELETE') or has_table_privilege(current_user,'public.health_memory_embedding','DELETE') then raise exception 'Client still has DELETE privilege';end if;
  begin
    -- Guarded by privilege denial above; restricted to this transaction's exact fixture and owner.
    delete from public.health_memory_item where id=current_setting('health_os.test_memory')::uuid and user_id=current_setting('health_os.test_owner')::uuid;
    raise exception 'Client fixture DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('health_os.test_other'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('health_os.test_other'),'role','authenticated','is_anonymous',false)::text,true);
do $$declare changed int;begin
  if exists(select 1 from public.health_memory_item where id=current_setting('health_os.test_memory')::uuid) or exists(select 1 from public.health_memory_embedding where memory_id=current_setting('health_os.test_memory')::uuid) then raise exception 'Cross-owner read leaked';end if;
  if exists(select 1 from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',10) where id=current_setting('health_os.test_memory')::uuid) then raise exception 'Cross-owner retrieval leaked';end if;
  update public.health_memory_item set valid_to=now() where id=current_setting('health_os.test_memory')::uuid and user_id=current_setting('health_os.test_owner')::uuid;
  get diagnostics changed=row_count;if changed<>0 then raise exception 'Cross-owner expiration allowed';end if;
  begin
    insert into public.health_memory_item(user_id,summary,domain,source_id,confidence) values(current_setting('health_os.test_owner')::uuid,'Forbidden','nutri','preservation-rls-fixture',1);
    raise exception 'Cross-owner insert allowed';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('health_os.test_owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('health_os.test_owner'),'role','authenticated','is_anonymous',false)::text,true);
update public.health_memory_item set summary='Updated fixture' where id=current_setting('health_os.test_memory')::uuid and user_id=auth.uid();
update public.health_memory_item set valid_to=now() where id=current_setting('health_os.test_expired')::uuid and user_id=auth.uid();
do $$begin
  if exists(select 1 from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',10) where id=current_setting('health_os.test_memory')::uuid) then raise exception 'Invalidated vector retrieved';end if;
  if exists(select 1 from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'train','gte-small','supabase-edge-v1',10) where id=current_setting('health_os.test_expired')::uuid) then raise exception 'Expired memory retrieved';end if;
  if not exists(select 1 from public.health_memory_item where id=current_setting('health_os.test_expired')::uuid and user_id=auth.uid() and summary='Soft expiration fixture' and valid_to is not null) then raise exception 'Expired source memory lost';end if;
end $$;
set local role anon;
do $$begin
  if has_table_privilege(current_user,'public.health_memory_item','SELECT') or has_table_privilege(current_user,'public.health_memory_embedding','SELECT') then raise exception 'Anonymous SELECT privilege exists';end if;
  begin perform 1 from public.health_memory_item where id=current_setting('health_os.test_memory')::uuid;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
  begin perform 1 from public.health_memory_match((array[1::real]||array_fill(0::real,array[383]))::extensions.vector,'nutri','gte-small','supabase-edge-v1',5);raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
  if (select count(*) from public.health_memory_embedding where memory_id in (current_setting('health_os.test_memory')::uuid,current_setting('health_os.test_expired')::uuid) and user_id=current_setting('health_os.test_owner')::uuid and invalidated_at is not null and embedding=(array[1::real]||array_fill(0::real,array[383]))::extensions.vector)<>2 then raise exception 'Original vector bytes lost or invalidation absent';end if;
  if (select count(*) from public.health_memory_item where id in (current_setting('health_os.test_memory')::uuid,current_setting('health_os.test_expired')::uuid) and user_id=current_setting('health_os.test_owner')::uuid)<>2 then raise exception 'Memory rows lost';end if;
end $$;
rollback;
select 'PASS: owner read-after-write; cross-owner read/retrieve/insert/update denial; anonymous table/RPC denial; scoped client DELETE denial; soft expiration; vector invalidation/exclusion; memory and vector retention. All fixtures rolled back.' as result;
