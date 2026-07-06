-- ═══════════════════════════════════════════════════════════════
-- WeddingLedger — DEDICATED ADMIN ACCOUNT + full admin visibility
--
-- STEP 1 (do this FIRST, in the Supabase dashboard — not SQL):
--   Authentication → Users → "Add user" → e.g.
--     email:    admin@wedding-ledger.com
--     password: (a long, unique password from your password manager)
--   Tick "Auto Confirm User" so it can sign in immediately.
--
-- STEP 2: edit the email below if you used a different one,
--         then run this ENTIRE file in SQL Editor.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  admin_uid uuid;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@wedding-ledger.com';
  IF admin_uid IS NULL THEN
    RAISE EXCEPTION 'No auth user with that email — complete STEP 1 first (or fix the email in this file)';
  END IF;

  -- Give the dedicated account a profile row flagged as admin
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = admin_uid) THEN
    UPDATE profiles SET is_admin = true WHERE user_id = admin_uid;
  ELSE
    INSERT INTO profiles (user_id, name1, is_admin) VALUES (admin_uid, 'Admin', true);
  END IF;
END $$;

-- Remove admin rights from your personal account, so the admin
-- console is ONLY reachable with the dedicated credentials.
UPDATE profiles SET is_admin = false
WHERE user_id = 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2';

-- ── Admin visibility for the remaining console data ──
-- (Users/Vendors pages aggregate these; without these policies the
--  admin only saw its own — i.e. zero — rows.)
DROP POLICY IF EXISTS admin_read_vendors ON vendors;
CREATE POLICY admin_read_vendors ON vendors FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS admin_read_tasks ON tasks;
CREATE POLICY admin_read_tasks ON tasks FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS admin_read_payments ON payments;
CREATE POLICY admin_read_payments ON payments FOR SELECT TO authenticated USING (is_admin());

SELECT 'Dedicated admin ready — sign in at /admin with the new credentials' AS status;
