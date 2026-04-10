-- CREATE zg_workspace_edges table for connecting nodes
create table if not exists public.zg_workspace_edges (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.zg_workspaces(id) on delete cascade,
  source_id     uuid references public.zg_workspace_nodes(id) on delete cascade,
  target_id     uuid references public.zg_workspace_nodes(id) on delete cascade,
  created_at    timestamptz default now()
);

-- Enable RLS
alter table public.zg_workspace_edges enable row level security;

-- Drop existing policies if any
drop policy if exists "Allowed users can manage edges" on public.zg_workspace_edges;

-- Create policy allowing authenticated and allowed users to manage edges
create policy "Allowed users can manage edges"
  on public.zg_workspace_edges for all to authenticated
  using (public.zg_current_user_is_allowed())
  with check (public.zg_current_user_is_allowed());
