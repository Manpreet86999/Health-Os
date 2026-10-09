-- Run this entire file in each user's Supabase SQL Editor.
create table if not exists public.body_os_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  revision bigint not null check (revision > 0),
  device_id text not null,
  deleted_at timestamptz,
  workspace text,
  payload_version integer,
  created_at timestamptz,
  cloud_updated_at timestamptz not null default now(),
  change_version bigint not null default 0,
  primary key (user_id, entity_type, record_id)
);

alter table public.body_os_records add column if not exists cloud_updated_at timestamptz not null default now();
alter table public.body_os_records add column if not exists change_version bigint not null default 0;

create index if not exists body_os_records_user_cloud_idx
  on public.body_os_records (user_id, change_version);

create table if not exists public.body_os_sync_cursors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_version bigint not null default 0
);

create table if not exists public.body_os_sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  change_version bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.body_os_sync_cursors enable row level security;
alter table public.body_os_sync_operations enable row level security;
drop policy if exists "body_os_cursor_own" on public.body_os_sync_cursors;
create policy "body_os_cursor_own" on public.body_os_sync_cursors for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "body_os_operations_own" on public.body_os_sync_operations;
create policy "body_os_operations_own" on public.body_os_sync_operations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.body_os_records enable row level security;
alter table public.body_os_records replica identity full;

-- Enable Supabase Realtime broadcast for body_os_records so mobile and PC clients receive change events instantly
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'body_os_records'
    ) then
      alter publication supabase_realtime add table public.body_os_records;
    end if;
  end if;
end;
$$;


drop policy if exists "body_os_select_own" on public.body_os_records;
create policy "body_os_select_own" on public.body_os_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "body_os_insert_own" on public.body_os_records;
create policy "body_os_insert_own" on public.body_os_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "body_os_update_own" on public.body_os_records;
create policy "body_os_update_own" on public.body_os_records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "body_os_delete_own" on public.body_os_records;
create policy "body_os_delete_own" on public.body_os_records
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.body_os_touch_cloud_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.body_os_sync_cursors(user_id,current_version) values(new.user_id,0)
    on conflict(user_id) do nothing;
  update public.body_os_sync_cursors set current_version=current_version+1
    where user_id=new.user_id returning current_version into new.change_version;
  new.cloud_updated_at = now();
  return new;
end;
$$;

drop trigger if exists body_os_touch_cloud_updated_at on public.body_os_records;
create trigger body_os_touch_cloud_updated_at
before insert or update on public.body_os_records
for each row execute function public.body_os_touch_cloud_updated_at();

revoke all on public.body_os_records from anon;
grant select, insert, update, delete on public.body_os_records to authenticated;
revoke all on public.body_os_sync_cursors from anon;
revoke all on public.body_os_sync_operations from anon;
grant select, insert, update on public.body_os_sync_cursors to authenticated;
grant select, insert on public.body_os_sync_operations to authenticated;

create or replace function public.body_os_pull_delta(after_version bigint default 0, page_size integer default 250)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  safe_size integer := least(greatest(page_size,1),500);
  result jsonb;
begin
  select jsonb_build_object(
    'protocolVersion',2,
    'records',coalesce(jsonb_agg(to_jsonb(page) order by page."changeVersion"),'[]'::jsonb),
    'cursor',coalesce(max(page."changeVersion"),after_version),
    'hasMore',(select count(*) > safe_size from public.body_os_records r where r.user_id=(select auth.uid()) and r.change_version>after_version)
  ) into result
  from (
    select entity_type as "entityType",record_id as id,payload,updated_at as "updatedAt",revision,
      device_id as "deviceId",deleted_at as "deletedAt",workspace,payload_version as "payloadVersion",
      created_at as "createdAt",change_version as "changeVersion"
    from public.body_os_records
    where user_id=(select auth.uid()) and change_version>after_version
    order by change_version asc limit safe_size
  ) page;
  return coalesce(result,jsonb_build_object('protocolVersion',2,'records','[]'::jsonb,'cursor',after_version,'hasMore',false));
end;
$$;

create or replace function public.body_os_push_batch(operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb; existing public.body_os_records%rowtype; prior bigint; saved public.body_os_records%rowtype;
  acknowledgements jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 100 then
    raise exception 'operations must be an array with at most 100 items';
  end if;
  for op in select value from jsonb_array_elements(operations) loop
    if coalesce((op->>'protocolVersion')::integer,0) <> 2 then raise exception 'unsupported sync protocol'; end if;
    select change_version into prior from public.body_os_sync_operations
      where user_id=(select auth.uid()) and operation_id=op->>'operationId';
    if prior is not null then
      acknowledgements := acknowledgements || jsonb_build_array(jsonb_build_object('operationId',op->>'operationId','status','duplicate','changeVersion',prior));
      continue;
    end if;
    select * into existing from public.body_os_records where user_id=(select auth.uid())
      and entity_type=op->'record'->>'entityType' and record_id=op->'record'->>'id';
    if existing.record_id is not null and (
      op->>'expectedChangeVersion' is null
      or (op->>'expectedChangeVersion')::bigint <> existing.change_version
    ) then
      acknowledgements := acknowledgements || jsonb_build_array(jsonb_build_object('operationId',op->>'operationId','status','conflict','changeVersion',existing.change_version,'record',jsonb_build_object(
        'id',existing.record_id,'entityType',existing.entity_type,'payload',existing.payload,'updatedAt',existing.updated_at,'revision',existing.revision,'deviceId',existing.device_id,
        'deletedAt',existing.deleted_at,'workspace',existing.workspace,'payloadVersion',existing.payload_version,'createdAt',existing.created_at,'changeVersion',existing.change_version)));
      continue;
    end if;
    insert into public.body_os_records(user_id,entity_type,record_id,payload,updated_at,revision,device_id,deleted_at,workspace,payload_version,created_at)
    values((select auth.uid()),op->'record'->>'entityType',op->'record'->>'id',op->'record'->'payload',(op->'record'->>'updatedAt')::timestamptz,
      (op->'record'->>'revision')::bigint,op->'record'->>'deviceId',nullif(op->'record'->>'deletedAt','')::timestamptz,op->'record'->>'workspace',
      nullif(op->'record'->>'payloadVersion','')::integer,nullif(op->'record'->>'createdAt','')::timestamptz)
    on conflict(user_id,entity_type,record_id) do update set payload=excluded.payload,updated_at=excluded.updated_at,revision=excluded.revision,
      device_id=excluded.device_id,deleted_at=excluded.deleted_at,workspace=excluded.workspace,payload_version=excluded.payload_version,created_at=excluded.created_at
    returning * into saved;
    insert into public.body_os_sync_operations(user_id,operation_id,change_version) values((select auth.uid()),op->>'operationId',saved.change_version);
    acknowledgements := acknowledgements || jsonb_build_array(jsonb_build_object('operationId',op->>'operationId','status','applied','changeVersion',saved.change_version));
  end loop;
  return jsonb_build_object('protocolVersion',2,'acknowledgements',acknowledgements);
end;
$$;

revoke all on function public.body_os_pull_delta(bigint,integer) from public, anon;
revoke all on function public.body_os_push_batch(jsonb) from public, anon;
grant execute on function public.body_os_pull_delta(bigint,integer) to authenticated;
grant execute on function public.body_os_push_batch(jsonb) to authenticated;

-- Backfill any existing records that were created before v5.1 so their change_version > 0
with numbered as (
  select user_id, entity_type, record_id, row_number() over (partition by user_id order by updated_at asc) as rn
  from public.body_os_records
  where change_version = 0
)
update public.body_os_records r
set change_version = n.rn
from numbered n
where r.user_id = n.user_id and r.entity_type = n.entity_type and r.record_id = n.record_id;

insert into public.body_os_sync_cursors (user_id, current_version)
select user_id, coalesce(max(change_version), 0)
from public.body_os_records
group by user_id
on conflict (user_id) do update set current_version = excluded.current_version;

-- Deduplicate any legacy readiness records that were created with random UUIDs instead of date keys
with ranked_readiness as (
  select ctid, row_number() over (
    partition by user_id, entity_type, coalesce(payload->>'date', record_id)
    order by updated_at desc
  ) as rn
  from public.body_os_records
  where entity_type = 'readiness'
)
delete from public.body_os_records
where ctid in (select ctid from ranked_readiness where rn > 1);

-- Normalize record_id for readiness to match its payload date
update public.body_os_records
set record_id = payload->>'date'
where entity_type = 'readiness' 
  and payload->>'date' is not null 
  and record_id <> payload->>'date'
  and not exists (
    select 1 from public.body_os_records r2
    where r2.user_id = body_os_records.user_id
      and r2.entity_type = 'readiness'
      and r2.record_id = body_os_records.payload->>'date'
  );


