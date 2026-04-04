create table if not exists public.zg_profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.zg_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.zg_profiles;
create policy "Users can read own profile"
on public.zg_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.zg_profiles;
create policy "Users can insert own profile"
on public.zg_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.zg_profiles;
create policy "Users can update own profile"
on public.zg_profiles
for update
to authenticated
using (auth.uid() = id);

create table if not exists public.zg_client_problem_statements (
  id bigint generated always as identity primary key,
  full_name text not null,
  email text not null,
  phone text,
  organization text,
  project_type text not null,
  project_description text not null,
  budget_range text,
  discovery_source text,
  auth_user_id uuid,
  auth_display_name text,
  auth_email text,
  source_page text,
  submitted_at timestamptz default now()
);

alter table public.zg_client_problem_statements enable row level security;

drop policy if exists "Allow public problem statement inserts" on public.zg_client_problem_statements;
create policy "Allow public problem statement inserts"
on public.zg_client_problem_statements
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow public read of problem statements" on public.zg_client_problem_statements;
create policy "Allow public read of problem statements"
on public.zg_client_problem_statements
for select
to anon, authenticated
using (true);

create table if not exists public.zg_member_interest (
  id bigint generated always as identity primary key,
  full_name text not null,
  email text not null,
  phone text,
  college text not null,
  department text not null,
  year_of_study text not null,
  area_of_interest text not null,
  preferred_role text,
  skills text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  previous_work text not null,
  team_contribution text,
  motivation text not null,
  availability text,
  auth_user_id uuid,
  auth_display_name text,
  auth_email text,
  approval_status text not null default 'pending',
  show_on_team_page boolean not null default false,
  public_display_name text,
  public_role text,
  public_headline text,
  public_skills text,
  public_avatar_url text,
  display_order integer not null default 100,
  source_page text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table public.zg_member_interest enable row level security;

alter table public.zg_member_interest
  add column if not exists preferred_role text,
  add column if not exists skills text,
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists team_contribution text,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists show_on_team_page boolean not null default false,
  add column if not exists public_display_name text,
  add column if not exists public_role text,
  add column if not exists public_headline text,
  add column if not exists public_skills text,
  add column if not exists public_avatar_url text,
  add column if not exists display_order integer not null default 100,
  add column if not exists reviewed_at timestamptz;

update public.zg_member_interest
set approval_status = 'pending'
where approval_status is null;

drop policy if exists "Allow public member interest inserts" on public.zg_member_interest;
create policy "Allow public member interest inserts"
on public.zg_member_interest
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow public read of approved members" on public.zg_member_interest;
create policy "Allow public read of approved members"
on public.zg_member_interest
for select
to anon, authenticated
using (approval_status = 'approved' and show_on_team_page = true);

create table if not exists public.zg_site_metrics (
  metric_key text primary key,
  metric_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.zg_site_metrics enable row level security;

alter table public.zg_site_metrics
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "Allow public read of site metrics" on public.zg_site_metrics;
create policy "Allow public read of site metrics"
on public.zg_site_metrics
for select
to anon, authenticated
using (true);

insert into public.zg_site_metrics (metric_key, metric_value, updated_at)
values ('site_visits', 0, now())
on conflict (metric_key) do nothing;

create or replace function public.increment_zg_visitor_count()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count bigint;
begin
  insert into public.zg_site_metrics (metric_key, metric_value, updated_at)
  values ('site_visits', 1, now())
  on conflict (metric_key) do update
  set metric_value = public.zg_site_metrics.metric_value + 1,
      updated_at = now()
  returning metric_value into next_count;

  return coalesce(next_count, 0);
end;
$$;

create or replace function public.get_zg_visitor_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select metric_value
      from public.zg_site_metrics
      where metric_key = 'site_visits'
    ),
    0
  );
$$;

grant execute on function public.increment_zg_visitor_count() to anon, authenticated;
grant execute on function public.get_zg_visitor_count() to anon, authenticated;
