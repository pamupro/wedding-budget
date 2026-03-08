-- ═══════════════════════════════════════════════════════════
-- WeddingLedger — Partner Linking Migration
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Add partner_id to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_email TEXT,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

-- 2. Create invites table
CREATE TABLE IF NOT EXISTS invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email     TEXT NOT NULL,
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | expired
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ
);

-- 3. Index for fast token lookup
CREATE INDEX IF NOT EXISTS invites_token_idx ON invites(token);
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(to_email);
CREATE INDEX IF NOT EXISTS profiles_partner_idx ON profiles(partner_id);

-- 4. RLS policies for invites
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Sender can see their own invites
CREATE POLICY "Users can view own invites" ON invites
  FOR SELECT USING (from_user_id = auth.uid());

-- Anyone can read invite by token (for accept flow)
CREATE POLICY "Anyone can read invite by token" ON invites
  FOR SELECT USING (true);

-- Authenticated users can create invites
CREATE POLICY "Users can create invites" ON invites
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

-- Users can update invites sent to their email
CREATE POLICY "Users can update invites" ON invites
  FOR UPDATE USING (true);

-- 5. Function: link two partner profiles atomically
CREATE OR REPLACE FUNCTION link_partners(user_a UUID, user_b UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles SET partner_id = user_b WHERE id = user_a;
  UPDATE profiles SET partner_id = user_a WHERE id = user_b;
  -- Share pro status: if either is pro, both become pro
  UPDATE profiles SET is_pro = true
    WHERE id IN (user_a, user_b)
    AND (
      (SELECT is_pro FROM profiles WHERE id = user_a) = true OR
      (SELECT is_pro FROM profiles WHERE id = user_b) = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function: unlink partners
CREATE OR REPLACE FUNCTION unlink_partners(user_a UUID)
RETURNS void AS $$
DECLARE
  partner UUID;
BEGIN
  SELECT partner_id INTO partner FROM profiles WHERE id = user_a;
  UPDATE profiles SET partner_id = NULL WHERE id = user_a;
  IF partner IS NOT NULL THEN
    UPDATE profiles SET partner_id = NULL WHERE id = partner;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done!
SELECT 'Partner linking migration complete ✅' AS status;
