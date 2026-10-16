-- Approved preservation change, 11 October 2026.
-- Preserve all existing memory summaries and vectors; disable physical client deletion.
alter table public.health_memory_embedding add column if not exists invalidated_at timestamptz;

create or replace function public.health_memory_invalidate_embedding() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.summary is distinct from old.summary or new.domain is distinct from old.domain
     or new.source_id is distinct from old.source_id or new.sensitivity is distinct from old.sensitivity
     or new.valid_to is distinct from old.valid_to or new.superseded_by is distinct from old.superseded_by then
    -- Retain the vector bytes, model metadata and source memory. Change validity metadata only.
    update public.health_memory_embedding
    set invalidated_at=coalesce(invalidated_at,now())
    where memory_id=old.id and user_id=old.user_id;
  end if;
  return new;
end $$;

create or replace function public.health_memory_match(query_embedding extensions.vector(384),purpose_domain text,embedding_model text,embedding_version text,match_count int default 5)
returns table(id uuid,summary text,domain text,source_id text,confidence numeric,created_at timestamptz,similarity double precision)
language sql stable security invoker set search_path='' as $$
  select m.id,m.summary,m.domain,m.source_id,m.confidence,m.created_at,
    1-(e.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.health_memory_item m join public.health_memory_embedding e on e.memory_id=m.id and e.user_id=m.user_id
  where m.user_id=(select auth.uid()) and e.user_id=(select auth.uid()) and m.domain=purpose_domain
    and m.valid_from<=now() and m.valid_to is null and m.superseded_by is null
    and m.sensitivity='personal' and e.invalidated_at is null
    and e.embedding_model=health_memory_match.embedding_model and e.embedding_version=health_memory_match.embedding_version
    and 1-(e.embedding operator(extensions.<=>) query_embedding)>=0.35
  order by (1-(e.embedding operator(extensions.<=>) query_embedding))*0.75 + m.confidence*0.15 + 0.1/(1+extract(epoch from now()-m.created_at)/86400) desc
  limit greatest(1,least(match_count,10));
$$;

revoke delete on public.health_memory_item,public.health_memory_embedding from authenticated;
