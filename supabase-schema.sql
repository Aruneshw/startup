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

-- ============================================================
-- COMPETITIVE PLATFORM EXTENSIONS
-- ============================================================

-- 1. Extend problems table with difficulty, open status, tags
alter table public.zg_client_problem_statements
  add column if not exists difficulty text default 'medium'
    check (difficulty in ('easy','medium','hard','critical')),
  add column if not exists is_open boolean default true,
  add column if not exists tags text[];

-- 2. Submissions table (competitive solutions)
create table if not exists public.zg_submissions (
  id               uuid primary key default gen_random_uuid(),
  problem_id       bigint references public.zg_client_problem_statements(id) on delete cascade,
  developer_id     uuid,
  developer_name   text,
  solution_text    text not null,
  repo_url         text,
  is_blind         boolean default true,
  submitted_at     timestamptz default now(),
  status           text default 'pending'
    check (status in ('pending','accepted','rejected')),
  quality_score    float default 0,
  client_rating    int check (client_rating between 1 and 5),
  response_time_hours float,
  final_score      float default 0
);

alter table public.zg_submissions enable row level security;

drop policy if exists "Devs see own or unblinded submissions" on public.zg_submissions;
create policy "Devs see own or unblinded submissions"
  on public.zg_submissions for select to authenticated
  using (developer_id = auth.uid() or is_blind = false);

drop policy if exists "Public can see accepted submissions" on public.zg_submissions;
create policy "Public can see accepted submissions"
  on public.zg_submissions for select to anon, authenticated
  using (status = 'accepted');

drop policy if exists "Devs insert own solutions" on public.zg_submissions;
create policy "Devs insert own solutions"
  on public.zg_submissions for insert to authenticated
  with check (developer_id = auth.uid());

drop policy if exists "Devs update own solutions" on public.zg_submissions;
create policy "Devs update own solutions"
  on public.zg_submissions for update to authenticated
  using (developer_id = auth.uid());

-- 3. Reputation, trust, and stat columns on zg_member_interest
alter table public.zg_member_interest
  add column if not exists reputation_score int default 0,
  add column if not exists success_rate float default 0,
  add column if not exists avg_rating float default 0,
  add column if not exists avg_response_time float default 0,
  add column if not exists problems_solved int default 0,
  add column if not exists total_submissions int default 0,
  add column if not exists trust_score int default 0,
  add column if not exists is_verified boolean default false,
  add column if not exists is_client_preferred boolean default false,
  add column if not exists skill_tags text[];

-- 4. Badge system tables
create table if not exists public.zg_badges (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  category text,
  level    int default 1,
  criteria jsonb not null,
  icon     text
);

alter table public.zg_badges enable row level security;

drop policy if exists "Public badge read" on public.zg_badges;
create policy "Public badge read"
  on public.zg_badges for select to anon, authenticated using (true);

create table if not exists public.zg_user_badges (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  badge_id uuid references public.zg_badges(id) on delete cascade,
  earned_at timestamptz default now(),
  unique(user_id, badge_id)
);

alter table public.zg_user_badges enable row level security;

drop policy if exists "Public user badge read" on public.zg_user_badges;
create policy "Public user badge read"
  on public.zg_user_badges for select to anon, authenticated using (true);

create table if not exists public.zg_badge_progress (
  user_id    uuid not null,
  badge_id   uuid references public.zg_badges(id) on delete cascade,
  progress   int default 0,
  updated_at timestamptz default now(),
  primary key (user_id, badge_id)
);

alter table public.zg_badge_progress enable row level security;

drop policy if exists "Public progress read" on public.zg_badge_progress;
create policy "Public progress read"
  on public.zg_badge_progress for select to anon, authenticated using (true);

-- 5. Solution tags table
create table if not exists public.zg_solution_tags (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid references public.zg_submissions(id) on delete cascade,
  tag           text not null,
  tagged_by     text default 'system',
  tagged_at     timestamptz default now()
);

alter table public.zg_solution_tags enable row level security;

drop policy if exists "Public tag read" on public.zg_solution_tags;
create policy "Public tag read"
  on public.zg_solution_tags for select to anon, authenticated using (true);

-- 6. Seed starter badges
insert into public.zg_badges (name, category, level, criteria, icon) values
  ('First Blood',      'volume',   1, '{"field":"total_submissions","threshold":1}',   '🩸'),
  ('Problem Solver',   'volume',   1, '{"field":"problems_solved","threshold":5}',     '⚡'),
  ('50 Solved',        'volume',   2, '{"field":"problems_solved","threshold":50}',    '🔥'),
  ('High Accuracy',    'accuracy', 2, '{"field":"success_rate","threshold":0.9}',      '🎯'),
  ('Speed Demon',      'speed',    1, '{"field":"avg_response_time","threshold":2}',   '⚡'),
  ('Client Favorite',  'rating',   3, '{"field":"avg_rating","threshold":4.5}',        '⭐')
on conflict (name) do nothing;

-- ============================================================
-- 7. MIND MAP WORKSPACE TABLES
-- ============================================================

create table if not exists public.zg_workspaces (
  id            uuid primary key default gen_random_uuid(),
  problem_id    bigint references public.zg_client_problem_statements(id) on delete cascade,
  owner_id      text,
  name          text not null,
  collaborators uuid[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.zg_workspaces enable row level security;

drop policy if exists "Owner can manage workspace" on public.zg_workspaces;
drop policy if exists "Public can read workspaces" on public.zg_workspaces;
drop policy if exists "Anyone can manage workspaces" on public.zg_workspaces;
create policy "Anyone can manage workspaces"
  on public.zg_workspaces for all to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.zg_workspace_nodes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.zg_workspaces(id) on delete cascade,
  label         text not null,
  node_type     text default 'code'
    check (node_type in ('code','text','image','pdf','link')),
  content       text default '',
  file_url      text,
  language      text default 'javascript',
  position_x    float default 0,
  position_y    float default 0,
  parent_id     uuid,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

alter table public.zg_workspace_nodes enable row level security;

drop policy if exists "Workspace members manage nodes" on public.zg_workspace_nodes;
drop policy if exists "Public can read nodes" on public.zg_workspace_nodes;
drop policy if exists "Anyone can manage nodes" on public.zg_workspace_nodes;
create policy "Anyone can manage nodes"
  on public.zg_workspace_nodes for all to anon, authenticated
  using (true)
  with check (true);

