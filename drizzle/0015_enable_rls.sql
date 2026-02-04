-- Enable Row Level Security on all tables
-- Run this in your Neon console or via psql

-- ============================================
-- STEP 1: Enable RLS on all tables
-- ============================================

-- User-related tables
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passkey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "twoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

-- Workspace tables
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_kit" ENABLE ROW LEVEL SECURITY;

-- Project & Video tables
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "viral_clip" ENABLE ROW LEVEL SECURITY;

-- Caption & Export tables
ALTER TABLE "caption_style" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batch_export" ENABLE ROW LEVEL SECURITY;

-- Credit tables
ALTER TABLE "credit_package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_transaction" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create service role for backend API
-- (Skip if your DB user already has superuser/owner privileges)
-- ============================================

-- Your Neon connection likely uses the owner role which bypasses RLS by default.
-- If you want RLS to apply to your backend, create a separate role:

-- CREATE ROLE app_service;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO app_service;

-- ============================================
-- STEP 3: RLS Policies
-- These policies allow workspace members to access their data
-- ============================================

-- USER TABLE: Users can only see/edit their own record
CREATE POLICY "users_own_record" ON "user"
  FOR ALL USING (id = current_setting('app.current_user_id', true));

-- ACCOUNT TABLE: Users can only access their own accounts
CREATE POLICY "accounts_own_user" ON "account"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- SESSION TABLE: Users can only access their own sessions
CREATE POLICY "sessions_own_user" ON "session"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- PASSKEY TABLE: Users can only access their own passkeys
CREATE POLICY "passkeys_own_user" ON "passkey"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- TWO FACTOR TABLE: Users can only access their own 2FA
CREATE POLICY "twofactor_own_user" ON "twoFactor"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- VERIFICATION TABLE: Allow all (tokens are short-lived and random)
CREATE POLICY "verification_allow_all" ON "verification"
  FOR ALL USING (true);

-- WORKSPACE TABLE: Members can access workspaces they belong to
CREATE POLICY "workspace_member_access" ON "workspace"
  FOR ALL USING (
    id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR owner_id = current_setting('app.current_user_id', true)
  );

-- WORKSPACE MEMBER TABLE: Members can see other members in their workspaces
CREATE POLICY "workspace_member_view" ON "workspace_member"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- WORKSPACE INVITATION TABLE: Members can see invitations for their workspaces
CREATE POLICY "workspace_invitation_access" ON "workspace_invitation"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR email = current_setting('app.current_user_email', true)
  );

-- WORKSPACE CREDITS TABLE: Members can view their workspace credits
CREATE POLICY "workspace_credits_access" ON "workspace_credits"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- BRAND KIT TABLE: Members can access their workspace brand kit
CREATE POLICY "brand_kit_access" ON "brand_kit"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- PROJECT TABLE: Members can access projects in their workspaces
CREATE POLICY "project_workspace_access" ON "project"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- VIDEO TABLE: Users can access their own videos
CREATE POLICY "video_owner_access" ON "video"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- VIRAL CLIP TABLE: Users can access clips from their videos
CREATE POLICY "viral_clip_video_owner" ON "viral_clip"
  FOR ALL USING (
    video_id IN (
      SELECT id FROM video 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- CAPTION STYLE TABLE: Users can access caption styles for their clips
CREATE POLICY "caption_style_clip_owner" ON "caption_style"
  FOR ALL USING (
    clip_id IN (
      SELECT vc.id FROM viral_clip vc
      JOIN video v ON vc.video_id = v.id
      WHERE v.user_id = current_setting('app.current_user_id', true)
    )
  );

-- VIDEO EXPORT TABLE: Users can access their own exports
CREATE POLICY "video_export_owner" ON "video_export"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- BATCH EXPORT TABLE: Users can access their own batch exports
CREATE POLICY "batch_export_owner" ON "batch_export"
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- CREDIT PACKAGE TABLE: Everyone can view credit packages (public pricing)
CREATE POLICY "credit_package_public_read" ON "credit_package"
  FOR SELECT USING (true);

-- CREDIT TRANSACTION TABLE: Members can view their workspace transactions
CREATE POLICY "credit_transaction_workspace" ON "credit_transaction"
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );
