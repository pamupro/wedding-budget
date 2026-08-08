-- ═══════════════════════════════════════════════════════════════════════════
-- WeddingLedger — PLANNER TIER (multi-wedding) — NON-DESTRUCTIVE MIGRATION
--
-- SAFETY FIRST: This migration is ADDITIVE only. It does not delete, move, or
-- rewrite any existing rows. Your live wedding (couples' accounts) keeps working
-- exactly as before, because:
--   • existing tables keep their user_id columns untouched
--   • the new wedding_id column is NULLABLE and defaults to NULL
--   • existing accounts never set wedding_id, so their queries are unchanged
--   • only planner accounts create weddings and use wedding_id
--
-- Run this whole file in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Planner flag on profiles ──────────────────────────────────────────────
-- Marks an account as a wedding-planner account (separate from couples).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_planner   boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS planner_paid boolean DEFAULT false;  -- paid the £49 bundle
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_weddings_paid int DEFAULT 0;    -- how many extra (>3) they've paid for

-- ── 2. Weddings table ────────────────────────────────────────────────────────
-- Each planner owns many weddings. Each wedding is a "project".
CREATE TABLE IF NOT EXISTS weddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_name  text NOT NULL DEFAULT 'New Wedding',
  partner_name text,
  wedding_date date,
  venue        text,
  currency     text DEFAULT 'GBP',
  cover_emoji  text DEFAULT '💍',
  archived     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weddings_planner ON weddings(planner_id);

-- ── 3. Add a NULLABLE wedding_id to each data table ──────────────────────────
-- NULL for all existing rows (couples' data) → their behaviour is unchanged.
-- Planner-created data will carry a wedding_id.
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS wedding_id uuid REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS wedding_id uuid REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE guests   ADD COLUMN IF NOT EXISTS wedding_id uuid REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS wedding_id uuid REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE tasks    ADD COLUMN IF NOT EXISTS wedding_id uuid REFERENCES weddings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_vendors_wedding  ON vendors(wedding_id);
CREATE INDEX IF NOT EXISTS idx_payments_wedding ON payments(wedding_id);
CREATE INDEX IF NOT EXISTS idx_guests_wedding   ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_settings_wedding ON settings(wedding_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wedding    ON tasks(wedding_id);

-- ── 4. RLS: planners can manage their own weddings ───────────────────────────
ALTER TABLE weddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weddings_own ON weddings;
CREATE POLICY weddings_own ON weddings
  FOR ALL TO authenticated
  USING (planner_id = auth.uid())
  WITH CHECK (planner_id = auth.uid());

-- ── 5. RLS: let a planner reach data rows belonging to THEIR weddings ─────────
-- These policies ADD to the existing owner-only policies; they don't replace them.
-- A planner can touch a row if that row's wedding_id belongs to a wedding they own.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','payments','guests','settings','tasks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_planner_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_planner_all ON %I FOR ALL TO authenticated
         USING (wedding_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM weddings w WHERE w.id = %I.wedding_id AND w.planner_id = auth.uid()))
         WITH CHECK (wedding_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM weddings w WHERE w.id = %I.wedding_id AND w.planner_id = auth.uid()))',
      t, t, t, t);
  END LOOP;
END $$;

-- ── 6. Helper: how many active (non-archived) weddings a planner has ─────────
CREATE OR REPLACE FUNCTION planner_wedding_count(p_planner uuid)
RETURNS int AS $$
  SELECT count(*)::int FROM weddings WHERE planner_id = p_planner AND archived = false;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION planner_wedding_count(uuid) TO authenticated;

-- ── 7. Create-wedding guard: enforces the 3-included + paid-extras limit ─────
-- Returns the new wedding id, or an error object if the planner is over limit.
CREATE OR REPLACE FUNCTION create_wedding(p_couple text, p_partner text, p_date date, p_venue text, p_currency text)
RETURNS jsonb AS $$
DECLARE
  me         uuid := auth.uid();
  prof       profiles%ROWTYPE;
  active_n   int;
  allowance  int;
  new_id     uuid;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO prof FROM profiles WHERE user_id = me;
  IF NOT FOUND OR prof.is_planner IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_planner');
  END IF;

  -- Allowance = 3 included (if bundle paid) + any extra weddings paid for.
  allowance := (CASE WHEN prof.planner_paid THEN 3 ELSE 3 END) + COALESCE(prof.extra_weddings_paid, 0);
  -- (First 3 are the bundle; we let them create up to 3 even before payment so
  --  they can try it, but you can tighten this to require planner_paid.)

  active_n := planner_wedding_count(me);
  IF active_n >= allowance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limit_reached',
                              'active', active_n, 'allowance', allowance);
  END IF;

  INSERT INTO weddings (planner_id, couple_name, partner_name, wedding_date, venue, currency)
  VALUES (me, COALESCE(NULLIF(p_couple,''),'New Wedding'), p_partner, p_date, p_venue, COALESCE(p_currency,'GBP'))
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_wedding(text, text, date, text, text) TO authenticated;

SELECT 'Planner tier migration complete ✅ (existing data untouched)' AS status;
