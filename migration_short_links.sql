-- ═══════════════════════════════════════════════════════════════
-- WeddingLedger — Short RSVP Links Migration
-- Adds a unique 6-character code per guest so RSVP links become
--   https://your-domain.com/HXc554
-- instead of
--   .../wedding.html?slug=chamo-pamu&gid=18d23d6e-...
--
-- Run this ENTIRE file once in Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Column + uniqueness
ALTER TABLE guests ADD COLUMN IF NOT EXISTS link_code text;
CREATE UNIQUE INDEX IF NOT EXISTS guests_link_code_idx
  ON guests(link_code) WHERE link_code IS NOT NULL;

-- 2. Generate codes for ALL existing guests (6-char, no confusing
--    characters like 0/O or 1/l/I), with collision retry
DO $$
DECLARE
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  g record;
  code text;
  tries int;
BEGIN
  FOR g IN SELECT id FROM guests WHERE link_code IS NULL LOOP
    tries := 0;
    LOOP
      code := '';
      FOR i IN 1..6 LOOP
        code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
      END LOOP;
      BEGIN
        UPDATE guests SET link_code = code WHERE id = g.id;
        EXIT;  -- success
      EXCEPTION WHEN unique_violation THEN
        tries := tries + 1;
        IF tries > 5 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

SELECT count(*) AS guests_with_short_links FROM guests WHERE link_code IS NOT NULL;
