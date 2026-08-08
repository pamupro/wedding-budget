-- ═══════════════════════════════════════════════════════════════════
-- WeddingLedger — DEMO PLANNER ACCOUNT
-- Creates a demo wedding-planner login so you can test the planner panel.
-- Run this AFTER migration_planner_tier.sql.
--
-- DEMO LOGIN (create the auth user first — see instructions below):
--   Email:    planner.demo@wedding-ledger.com
--   Password: PlannerDemo2027!
--
-- STEP 1 (in Supabase Dashboard → Authentication → Users → "Add user"):
--   • Add user with the email + password above, and tick "Auto Confirm User".
--   • Copy the new user's UID.
-- STEP 2: paste that UID below in place of PASTE_DEMO_UID_HERE, then run this.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  demo_uid uuid := 'PASTE_DEMO_UID_HERE';   -- ← replace with the demo user's UID
  w1 uuid; w2 uuid;
BEGIN
  -- Mark the demo account as a paid planner
  INSERT INTO profiles (user_id, name1, is_planner, planner_paid, email)
  VALUES (demo_uid, 'Demo Planner', true, true, 'planner.demo@wedding-ledger.com')
  ON CONFLICT (user_id) DO UPDATE
    SET is_planner = true, planner_paid = true, name1 = 'Demo Planner';

  -- Seed two sample weddings so the panel isn't empty
  INSERT INTO weddings (planner_id, couple_name, wedding_date, venue, currency, cover_emoji)
  VALUES (demo_uid, 'Sarah & James', '2027-06-12', 'The Grand Hotel, London', 'GBP', '💐')
  RETURNING id INTO w1;

  INSERT INTO weddings (planner_id, couple_name, wedding_date, venue, currency, cover_emoji)
  VALUES (demo_uid, 'Priya & Arjun', '2027-08-20', 'Kensington Gardens', 'GBP', '🥂')
  RETURNING id INTO w2;

  -- Give wedding 1 a couple of sample vendors so its dashboard has content
  INSERT INTO vendors (user_id, wedding_id, category, icon, name, total_cost)
  VALUES (demo_uid, w1, 'Hotel / Venue', '🏨', 'The Grand Hotel', 12000),
         (demo_uid, w1, 'Florist', '💐', 'Bloom & Bay', 1800);
END $$;

SELECT 'Demo planner ready ✅ — log in with planner.demo@wedding-ledger.com' AS status;
