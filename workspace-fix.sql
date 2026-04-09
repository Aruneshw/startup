-- ============================================================
-- WORKSPACE FIX: Run this in Supabase SQL Editor
-- Keeps owner_id as TEXT while preserving blocked-user enforcement
-- ============================================================

-- 1. Change owner_id from UUID to TEXT (to support guest IDs)
ALTER TABLE public.zg_workspaces
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

-- 2. Drop old workspace policies
DROP POLICY IF EXISTS "Owner can manage workspace" ON public.zg_workspaces;
DROP POLICY IF EXISTS "Public can read workspaces" ON public.zg_workspaces;
DROP POLICY IF EXISTS "Allowed users can manage workspaces" ON public.zg_workspaces;
DROP POLICY IF EXISTS "Anyone can manage workspaces" ON public.zg_workspaces;

-- 3. Create auth-only policy guarded by zg_profiles.is_blocked
CREATE POLICY "Allowed users can manage workspaces"
  ON public.zg_workspaces FOR ALL TO authenticated
  USING (public.zg_current_user_is_allowed())
  WITH CHECK (public.zg_current_user_is_allowed());

-- 4. Drop old node policies
DROP POLICY IF EXISTS "Workspace members manage nodes" ON public.zg_workspace_nodes;
DROP POLICY IF EXISTS "Public can read nodes" ON public.zg_workspace_nodes;
DROP POLICY IF EXISTS "Allowed users can manage nodes" ON public.zg_workspace_nodes;
DROP POLICY IF EXISTS "Anyone can manage nodes" ON public.zg_workspace_nodes;

-- 5. Create auth-only policy for nodes
CREATE POLICY "Allowed users can manage nodes"
  ON public.zg_workspace_nodes FOR ALL TO authenticated
  USING (public.zg_current_user_is_allowed())
  WITH CHECK (public.zg_current_user_is_allowed());
