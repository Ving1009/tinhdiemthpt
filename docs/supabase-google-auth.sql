-- Chạy trong Supabase SQL Editor để bật vùng sao lưu riêng cho từng tài khoản.
create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_data enable row level security;

drop policy if exists "user_app_data_select_own" on public.user_app_data;
create policy "user_app_data_select_own" on public.user_app_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_app_data_insert_own" on public.user_app_data;
create policy "user_app_data_insert_own" on public.user_app_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_app_data_update_own" on public.user_app_data;
create policy "user_app_data_update_own" on public.user_app_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
