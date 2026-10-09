-- Owner-filtered startup and delta pagination must seek by change_version.
create index if not exists body_os_records_owner_cursor_idx
  on public.body_os_records (user_id, change_version);
