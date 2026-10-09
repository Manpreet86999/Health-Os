alter table public.body_os_email_jobs drop constraint body_os_email_jobs_report_type_check;
alter table public.body_os_email_jobs add constraint body_os_email_jobs_report_type_check check(report_type in ('workout','weekly','monthly','skincare','health','test'));
alter table public.body_os_email_jobs add column if not exists attempts integer not null default 0;
alter table public.body_os_email_jobs add column if not exists next_attempt_at timestamptz not null default now();
alter table public.body_os_email_jobs add column if not exists locked_at timestamptz;
create table if not exists public.body_os_cloud_integrations(
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), primary key(user_id,provider)
);
alter table public.body_os_cloud_integrations enable row level security;
revoke all on public.body_os_cloud_integrations from anon,authenticated;
grant all on public.body_os_cloud_integrations to service_role;
