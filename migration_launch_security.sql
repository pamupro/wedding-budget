-- ═══════════════════════════════════════════════════════════════
-- WeddingLedger — LAUNCH SECURITY MIGRATION
--
-- What this does:
--  1. Adds an is_admin flag so the admin console uses REAL
--     authentication instead of a service key in the browser
--  2. Grants the admin account read/manage access via RLS policies
--  3. Makes sure the support_tickets table exists with the right
--     columns and policies (fixes live-chat messages not arriving)
--  4. Lets the PUBLIC wedding page read invitation_config and
--     menu_config (fixes invitation details not updating)
--  5. Lets the homepage read the two subscription prices
--
-- Run this ENTIRE file once in Supabase → SQL Editor → Run
--
-- ⚠ AFTER running this, you MUST rotate your service_role key:
--    Supabase → Settings → API → "Reset" the service_role secret.
--    The old key was embedded in your public admin page and must
--    be treated as compromised.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Admin flag ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Make YOUR account the admin (platform owner)
UPDATE profiles SET is_admin = true
WHERE user_id = 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2';

-- Helper: is the current authenticated user an admin?
-- SECURITY DEFINER lets it check profiles without recursive RLS issues.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.is_admin FROM profiles p WHERE p.user_id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- ── 2. Admin access policies (read everything the console needs) ──
DROP POLICY IF EXISTS admin_read_profiles  ON profiles;
CREATE POLICY admin_read_profiles  ON profiles  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_write_profiles ON profiles;
CREATE POLICY admin_write_profiles ON profiles  FOR UPDATE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS admin_read_settings  ON settings;
CREATE POLICY admin_read_settings  ON settings  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_write_settings ON settings;
CREATE POLICY admin_write_settings ON settings  FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_insert_settings ON settings;
CREATE POLICY admin_insert_settings ON settings FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ── 3. Support tickets (live chat) ──
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  name        text,
  email       text,
  subject     text,
  message     text,
  status      text NOT NULL DEFAULT 'open',
  admin_reply text,
  replied_at  timestamptz,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Reconcile columns if an older version of the table exists
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at  timestamptz,
  ADD COLUMN IF NOT EXISTS source      text,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'open';

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone can open a ticket (logged in or not — the widget allows both)
DROP POLICY IF EXISTS tickets_insert_any ON support_tickets;
CREATE POLICY tickets_insert_any ON support_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Users can see their own tickets (for reply history in the widget)
DROP POLICY IF EXISTS tickets_read_own ON support_tickets;
CREATE POLICY tickets_read_own ON support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Admin can see and manage all tickets
DROP POLICY IF EXISTS tickets_admin_read ON support_tickets;
CREATE POLICY tickets_admin_read ON support_tickets
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS tickets_admin_update ON support_tickets;
CREATE POLICY tickets_admin_update ON support_tickets
  FOR UPDATE TO authenticated USING (is_admin());

-- ── 4 + 5. Public read of safe config keys only ──
-- The wedding invitation page (no login) needs menu + invitation
-- config; the homepage needs the two prices. NOTHING else in
-- settings is exposed.
DROP POLICY IF EXISTS settings_public_config ON settings;
CREATE POLICY settings_public_config ON settings
  FOR SELECT TO anon
  USING (key IN ('menu_config','invitation_config','sub_price_monthly','sub_price_bundle'));

SELECT 'Launch security migration complete — now ROTATE the service_role key!' AS reminder;
