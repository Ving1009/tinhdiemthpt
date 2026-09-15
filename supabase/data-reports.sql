create table if not exists public.data_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'in_review', 'resolved', 'rejected')),
  report_type text not null default 'incorrect_admission_data',
  university_id text,
  university_name text,
  major_id text,
  major_name text,
  page_url text,
  message text not null,
  contact_email text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.data_reports enable row level security;
revoke all on table public.data_reports from anon, authenticated;
grant all on table public.data_reports to service_role;

create index if not exists data_reports_status_created_at_idx
  on public.data_reports (status, created_at desc);
