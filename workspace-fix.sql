-- ============================================================
-- WORKSPACE FIX: Run this in Supabase SQL Editor
-- Fixes RLS policies for anonymous access + changes owner_id to TEXT
-- ============================================================

-- 1. Change owner_id from UUID to TEXT (to support guest IDs)
ALTER TABLE public.zg_workspaces
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

-- 2. Drop old restrictive policies
DROP POLICY IF EXISTS "Owner can manage workspace" ON public.zg_workspaces;
DROP POLICY IF EXISTS "Public can read workspaces" ON public.zg_workspaces;
DROP POLICY IF EXISTS "Anyone can manage workspaces" ON public.zg_workspaces;

-- 3. Create open policies for both anon + authenticated
CREATE POLICY "Anyone can manage workspaces"
  ON public.zg_workspaces FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Drop old node policies
DROP POLICY IF EXISTS "Workspace members manage nodes" ON public.zg_workspace_nodes;
DROP POLICY IF EXISTS "Public can read nodes" ON public.zg_workspace_nodes;
DROP POLICY IF EXISTS "Anyone can manage nodes" ON public.zg_workspace_nodes;

-- 5. Create open policies for nodes
CREATE POLICY "Anyone can manage nodes"
  ON public.zg_workspace_nodes FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
