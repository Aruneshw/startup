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

create table if not exists public.zg_team_directory (
  application_id bigint primary key references public.zg_member_interest(id) on delete cascade,
  display_name text not null,
  role_title text,
  headline text,
  skills text,
  college text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  avatar_url text,
  display_order integer not null default 100,
  is_visible boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.zg_team_directory enable row level security;

alter table public.zg_team_directory
  add column if not exists role_title text,
  add column if not exists headline text,
  add column if not exists skills text,
  add column if not exists college text,
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists avatar_url text,
  add column if not exists display_order integer not null default 100,
  add column if not exists is_visible boolean not null default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

drop policy if exists "Allow public read of team directory" on public.zg_team_directory;
create policy "Allow public read of team directory"
on public.zg_team_directory
for select
to anon, authenticated
using (is_visible = true);

create or replace function public.sync_zg_team_directory()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.zg_team_directory
    where application_id = old.id;
    return old;
  end if;

  if new.approval_status = 'approved' and new.show_on_team_page = true then
    insert into public.zg_team_directory (
      application_id,
      display_name,
      role_title,
      headline,
      skills,
      college,
      linkedin_url,
      github_url,
      portfolio_url,
      avatar_url,
      display_order,
      is_visible,
      updated_at
    )
    values (
      new.id,
      coalesce(nullif(new.public_display_name, ''), new.full_name),
      coalesce(nullif(new.public_role, ''), nullif(new.preferred_role, ''), new.area_of_interest || ' Contributor'),
      coalesce(nullif(new.public_headline, ''), nullif(new.team_contribution, ''), nullif(new.motivation, ''), 'Approved member of Team Zero Gravity'),
      coalesce(nullif(new.public_skills, ''), nullif(new.skills, ''), new.area_of_interest),
      new.college,
      new.linkedin_url,
      new.github_url,
      new.portfolio_url,
      nullif(new.public_avatar_url, ''),
      coalesce(new.display_order, 100),
      true,
      now()
    )
    on conflict (application_id) do update
    set display_name = excluded.display_name,
        role_title = excluded.role_title,
        headline = excluded.headline,
        skills = excluded.skills,
        college = excluded.college,
        linkedin_url = excluded.linkedin_url,
        github_url = excluded.github_url,
        portfolio_url = excluded.portfolio_url,
        avatar_url = excluded.avatar_url,
        display_order = excluded.display_order,
        is_visible = true,
        updated_at = now();
  else
    delete from public.zg_team_directory
    where application_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_zg_team_directory_on_change on public.zg_member_interest;
create trigger sync_zg_team_directory_on_change
after insert or update or delete on public.zg_member_interest
for each row
execute function public.sync_zg_team_directory();

insert into public.zg_team_directory (
  application_id,
  display_name,
  role_title,
  headline,
  skills,
  college,
  linkedin_url,
  github_url,
  portfolio_url,
  avatar_url,
  display_order,
  is_visible,
  updated_at
)
select
  id,
  coalesce(nullif(public_display_name, ''), full_name),
  coalesce(nullif(public_role, ''), nullif(preferred_role, ''), area_of_interest || ' Contributor'),
  coalesce(nullif(public_headline, ''), nullif(team_contribution, ''), nullif(motivation, ''), 'Approved member of Team Zero Gravity'),
  coalesce(nullif(public_skills, ''), nullif(skills, ''), area_of_interest),
  college,
  linkedin_url,
  github_url,
  portfolio_url,
  nullif(public_avatar_url, ''),
  coalesce(display_order, 100),
  true,
  now()
from public.zg_member_interest
where approval_status = 'approved' and show_on_team_page = true
on conflict (application_id) do update
set display_name = excluded.display_name,
    role_title = excluded.role_title,
    headline = excluded.headline,
    skills = excluded.skills,
    college = excluded.college,
    linkedin_url = excluded.linkedin_url,
    github_url = excluded.github_url,
    portfolio_url = excluded.portfolio_url,
    avatar_url = excluded.avatar_url,
    display_order = excluded.display_order,
    is_visible = true,
    updated_at = now();

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
