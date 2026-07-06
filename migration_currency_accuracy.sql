-- ═══════════════════════════════════════════════════════════════
-- WeddingLedger — Currency Accuracy Migration
-- Fixes: entering LKR 100,000 showing back as LKR 99,998
--
-- Cause: amounts were stored ONLY as GBP rounded to 2 decimals,
-- so converting back to LKR lost precision (and drifted whenever
-- the live exchange rate moved).
--
-- Fix: store the EXACT amount the user typed + its currency,
-- alongside a higher-precision GBP value. The app now shows the
-- typed amount verbatim when viewing in the same currency.
--
-- Run this ENTIRE file once in Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Widen GBP precision (2dp → 6dp) so conversions barely drift
ALTER TABLE payments ALTER COLUMN amount     TYPE numeric(16,6);
ALTER TABLE vendors  ALTER COLUMN total_cost TYPE numeric(16,6);
ALTER TABLE vendors  ALTER COLUMN due_amount TYPE numeric(16,6);

-- 2. Store the exact typed amount + currency per row
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS amount_original numeric(16,2),
  ADD COLUMN IF NOT EXISTS currency        text NOT NULL DEFAULT '';

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS total_cost_original numeric(16,2),
  ADD COLUMN IF NOT EXISTS due_amount_original numeric(16,2),
  ADD COLUMN IF NOT EXISTS currency            text NOT NULL DEFAULT '';

SELECT 'Currency accuracy migration complete ✅' AS status;

-- ═══════════════════════════════════════════════════════════════
-- 3. OPTIONAL BACKFILL for YOUR existing data (entered in LKR)
--
-- Old rows can't know exactly what you typed, but since you
-- entered round LKR amounts, rounding to the nearest LKR 100
-- recovers them perfectly (99,998.27 → 100,000).
--
-- ⚠ Replace YOUR_USER_ID below with your own user id first —
--    find it with:  SELECT user_id, name1, name2 FROM profiles;
-- ⚠ Only run this for YOUR rows. Other users may have entered
--    amounts in a different currency.
--
-- Uncomment (remove the /* and */) and run:
-- ═══════════════════════════════════════════════════════════════
/*
UPDATE payments
SET amount_original = ROUND(amount * 446.82 / 100) * 100,
    currency = 'LKR'
WHERE user_id = 'YOUR_USER_ID' AND currency = '';

UPDATE vendors
SET total_cost_original = ROUND(total_cost * 446.82 / 100) * 100,
    due_amount_original = CASE WHEN due_amount IS NULL THEN NULL
                               ELSE ROUND(due_amount * 446.82 / 100) * 100 END,
    currency = 'LKR'
WHERE user_id = 'YOUR_USER_ID' AND currency = '' AND total_cost > 0;
*/
