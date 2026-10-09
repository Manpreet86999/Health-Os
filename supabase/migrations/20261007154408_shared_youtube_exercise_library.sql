-- Community video writes are authenticated and validated by the edge function.
-- Keep direct catalog writes restricted to service_role.
create or replace function public.body_os_save_shared_tutorial(
  exercise uuid, video text, actor uuid, title text, replace_existing boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare saved public.body_os_exercise_media;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception 'Registered actor required'; end if;
  if video !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'Invalid video ID'; end if;
  if not exists(select 1 from public.body_os_exercises where id=exercise and catalog_status<>'disabled') then raise exception 'Exercise unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(exercise::text, 22));
  select * into saved from public.body_os_exercise_media
    where exercise_id=exercise and media_type='tutorial' and is_primary
    and provider='youtube' and status in ('usable','verified','inherited') limit 1;
  if saved.id is not null and (not replace_existing or saved.provider_asset_id=video) then return to_jsonb(saved); end if;
  update public.body_os_exercise_media set is_primary=false,updated_at=now()
    where exercise_id=exercise and media_type='tutorial' and is_primary;
  insert into public.body_os_exercise_media(exercise_id,media_type,provider,provider_asset_id,url,embed_url,source_url,status,is_primary,match_method,metadata)
    values(exercise,'tutorial','youtube',video,'https://www.youtube.com/watch?v='||video,
      'https://www.youtube-nocookie.com/embed/'||video,'https://www.youtube.com/watch?v='||video,
      'usable',true,case when replace_existing then 'community_contribution' else 'shared_search' end,
      jsonb_build_object('title',left(title,300),'contributed_by',actor)) returning * into saved;
  update public.body_os_exercises set updated_at=now() where id=exercise;
  update public.body_os_exercise_media_requests set status='resolved',resolved_at=now(),resolved_media_id=saved.id
    where exercise_id=exercise and media_type in ('tutorial','both') and status in ('pending','in_progress');
  return to_jsonb(saved);
end;
$$;
revoke all on function public.body_os_save_shared_tutorial(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.body_os_save_shared_tutorial(uuid,text,uuid,text,boolean) to service_role;

-- Preserve saved guides before removing personal animation/image resources.
do $$
declare item record;
begin
  for item in
    select distinct on (e.id) e.id,r.user_id,m.value->>'provider_asset_id' video,
      coalesce(m.value->'metadata'->>'title',e.name) title
    from public.body_os_records r
    join public.body_os_exercises e on e.id::text=r.record_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'media')='array' then r.payload->'media' else '[]'::jsonb end) m
    where r.entity_type='exercise' and r.deleted_at is null and e.catalog_status<>'disabled'
      and m.value->>'media_type'='tutorial' and m.value->>'provider'='youtube'
      and m.value->>'provider_asset_id' ~ '^[A-Za-z0-9_-]{11}$'
    order by e.id,r.updated_at desc
  loop
    perform public.body_os_save_shared_tutorial(item.id,item.video,item.user_id,item.title,false);
  end loop;
end $$;

-- Imports only queue video guides now.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.body_os_ensure_exercise(jsonb,uuid)'::regprocedure);
  execute replace(definition, 'array[''animation'',''tutorial'']', 'array[''tutorial'']');
end $$;

delete from public.body_os_exercise_media_requests where media_type in ('animation','image');
update public.body_os_exercise_media_requests set media_type='tutorial' where media_type='both';
delete from public.body_os_exercise_media where media_type in ('animation','image') or provider='giphy';
update public.body_os_records r set payload=jsonb_set(r.payload,'{media}',coalesce((
  select jsonb_agg(m) from jsonb_array_elements(r.payload->'media') m where m->>'media_type'='tutorial' and m->>'provider'='youtube'
),'[]'::jsonb)),revision=revision+1,updated_at=now(),device_id='shared-youtube-library-migration'
where entity_type='exercise' and jsonb_typeof(payload->'media')='array'
  and exists(select 1 from jsonb_array_elements(payload->'media') m where m->>'media_type' in ('animation','image') or m->>'provider'='giphy');
update public.body_os_records set payload=payload-'giphyApiKey',revision=revision+1,updated_at=now(),device_id='shared-youtube-library-migration'
where entity_type='sharedPreferences' and payload ? 'giphyApiKey';
