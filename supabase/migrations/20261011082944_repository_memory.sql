create extension if not exists vector with schema extensions;

create table public.health_memory_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_type text not null default 'user_preference' check (memory_type in ('user_preference','reviewed_summary')),
  domain text not null check (domain in ('general','train','nutri','recover','body','care')),
  source_type text not null default 'user_authored', source_id text not null check (length(source_id)<=200),
  summary text not null check (length(summary) between 1 and 1000),
  confidence numeric not null check (confidence between 0 and 1),
  sensitivity text not null default 'personal' check (sensitivity in ('personal','medical')),
  valid_from timestamptz not null default now(), valid_to timestamptz,
  superseded_by uuid, created_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (superseded_by,user_id) references public.health_memory_item(id,user_id),
  check (superseded_by is null or superseded_by<>id)
);
create index health_memory_item_owner_idx on public.health_memory_item(user_id,domain,created_at desc);
create table public.health_memory_embedding (
  memory_id uuid primary key, user_id uuid not null default auth.uid(),
  embedding extensions.vector(384) not null,
  embedding_model text not null, embedding_version text not null,
  created_at timestamptz not null default now(),
  foreign key (memory_id,user_id) references public.health_memory_item(id,user_id) on delete cascade
);
create index health_memory_embedding_owner_idx on public.health_memory_embedding(user_id);
alter table public.health_memory_item enable row level security;
alter table public.health_memory_embedding enable row level security;
create policy memory_owner on public.health_memory_item for all to authenticated
  using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false')
  with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy embedding_owner on public.health_memory_embedding for all to authenticated
  using ((select auth.uid())=user_id and exists(select 1 from public.health_memory_item m where m.id=memory_id and m.user_id=(select auth.uid()) and m.valid_to is null and m.superseded_by is null and m.sensitivity='personal'))
  with check ((select auth.uid())=user_id and exists(select 1 from public.health_memory_item m where m.id=memory_id and m.user_id=(select auth.uid()) and m.valid_to is null and m.superseded_by is null and m.sensitivity='personal'));
revoke all on public.health_memory_item,public.health_memory_embedding from anon;
grant select,insert,update,delete on public.health_memory_item,public.health_memory_embedding to authenticated;

create function public.health_memory_invalidate_embedding() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- BEFORE update keeps old row permissions valid while deleting its derivative.
  if new.summary is distinct from old.summary or new.domain is distinct from old.domain
     or new.source_id is distinct from old.source_id or new.sensitivity is distinct from old.sensitivity
     or new.valid_to is distinct from old.valid_to or new.superseded_by is distinct from old.superseded_by then
    delete from public.health_memory_embedding where memory_id=old.id and user_id=old.user_id;
  end if;
  return new;
end $$;
revoke all on function public.health_memory_invalidate_embedding() from public,anon,authenticated;
create trigger health_memory_invalidate before update on public.health_memory_item for each row execute function public.health_memory_invalidate_embedding();

create function public.health_memory_remember(p_summary text,p_domain text,p_source_id text,p_confidence numeric,p_embedding extensions.vector(384),p_model text,p_version text)
returns setof public.health_memory_item language plpgsql security invoker set search_path='' as $$
declare item public.health_memory_item;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.health_memory_item(summary,domain,source_id,confidence) values(p_summary,p_domain,p_source_id,p_confidence) returning * into item;
  insert into public.health_memory_embedding(memory_id,user_id,embedding,embedding_model,embedding_version) values(item.id,item.user_id,p_embedding,p_model,p_version);
  return next item;
end $$;
create function public.health_memory_match(query_embedding extensions.vector(384),purpose_domain text,embedding_model text,embedding_version text,match_count int default 5)
returns table(id uuid,summary text,domain text,source_id text,confidence numeric,created_at timestamptz,similarity double precision)
language sql stable security invoker set search_path='' as $$
  select m.id,m.summary,m.domain,m.source_id,m.confidence,m.created_at,
    1-(e.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.health_memory_item m join public.health_memory_embedding e on e.memory_id=m.id and e.user_id=m.user_id
  where m.user_id=(select auth.uid()) and e.user_id=(select auth.uid()) and m.domain=purpose_domain
    and m.valid_from<=now() and (m.valid_to is null or m.valid_to>now()) and m.superseded_by is null
    and m.sensitivity='personal' and e.embedding_model=health_memory_match.embedding_model and e.embedding_version=health_memory_match.embedding_version
    and 1-(e.embedding operator(extensions.<=>) query_embedding)>=0.35
  order by (1-(e.embedding operator(extensions.<=>) query_embedding))*0.75 + m.confidence*0.15 + 0.1/(1+extract(epoch from now()-m.created_at)/86400) desc
  limit greatest(1,least(match_count,10));
$$;
revoke all on function public.health_memory_remember(text,text,text,numeric,extensions.vector,text,text) from public,anon;
revoke all on function public.health_memory_match(extensions.vector,text,text,text,int) from public,anon;
grant execute on function public.health_memory_remember(text,text,text,numeric,extensions.vector,text,text) to authenticated;
grant execute on function public.health_memory_match(extensions.vector,text,text,text,int) to authenticated;
