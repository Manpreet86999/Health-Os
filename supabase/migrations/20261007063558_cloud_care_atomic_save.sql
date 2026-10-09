create or replace function public.body_os_save_care(expected_revision integer,expected_updated_at text,entries jsonb,expected_versions jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_revision integer; current_updated text; entry jsonb; allowed text[]:=array['careSettings','careGoal','careTask','careEvent','careCheckIn','careReview','carePlanVersion']; result jsonb;
begin
  if owner is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Sign in to save Care' using errcode='42501'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>5000 or octet_length(entries::text)>5000000 then raise exception 'Invalid Care records'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text||':care',0));
  perform 1 from public.body_os_records where user_id=owner and entity_type=any(allowed) for update;
  select coalesce((payload->>'revision')::integer,0),payload->>'updatedAt' into current_revision,current_updated from public.body_os_records where user_id=owner and entity_type='careSettings' and record_id='care-settings' and deleted_at is null;
  if coalesce(current_revision,0)<>expected_revision or coalesce(current_updated,'1970-01-01T00:00:00.000Z')<>expected_updated_at then raise exception 'Care changed elsewhere. Reload before saving.' using errcode='40001'; end if;
  if exists(select 1 from public.body_os_records r where user_id=owner and entity_type=any(allowed) and deleted_at is null and coalesce(expected_versions->>(entity_type||':'||record_id),'')<>change_version::text) then raise exception 'Care records changed elsewhere. Reload before saving.' using errcode='40001'; end if;
  if (select count(*) from jsonb_array_elements(entries) e where e->>'entityType'='careSettings' and e->>'id'='care-settings')<>1 then raise exception 'Care settings are required'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where not (e->>'entityType'=any(allowed)) or coalesce(e->>'id','')='' or jsonb_typeof(e->'payload')<>'object') then raise exception 'Invalid Care entry'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e group by e->>'entityType',e->>'id' having count(*)>1) then raise exception 'Duplicate Care entries'; end if;
  update public.body_os_records r set deleted_at=now(),updated_at=now(),revision=r.revision+1,device_id='body-os-cloud-web'
    where user_id=owner and entity_type=any(allowed) and deleted_at is null and not exists(select 1 from jsonb_array_elements(entries) e where e->>'entityType'=r.entity_type and e->>'id'=r.record_id);
  for entry in select value from jsonb_array_elements(entries) loop
    insert into public.body_os_records(user_id,entity_type,record_id,payload,updated_at,revision,device_id,workspace,payload_version,created_at,deleted_at)
    values(owner,entry->>'entityType',entry->>'id',entry->'payload',now(),1,'body-os-cloud-web','care',1,now(),null)
    on conflict(user_id,entity_type,record_id) do update set payload=excluded.payload,updated_at=now(),revision=body_os_records.revision+1,device_id=excluded.device_id,deleted_at=null
    where body_os_records.payload is distinct from excluded.payload or body_os_records.deleted_at is not null;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',record_id,'entityType',entity_type,'payload',payload,'updatedAt',updated_at,'createdAt',created_at,'revision',revision,'deviceId',device_id,'workspace',workspace,'payloadVersion',payload_version,'deletedAt',deleted_at,'cloudVersion',cloud_updated_at,'changeVersion',change_version)),'[]'::jsonb) into result from public.body_os_records where user_id=owner and entity_type=any(allowed);
  return result;
end;
$$;
revoke execute on function public.body_os_save_care(integer,text,jsonb,jsonb) from public,anon;
grant execute on function public.body_os_save_care(integer,text,jsonb,jsonb) to authenticated;
