-- ═══════════════════════════════════════════════════════════
-- WeddingLedger — Accept-Invite Fix
-- Problem: the invited partner can't read the sender's profile
-- (RLS blocks reading other users' profiles), so linking failed.
-- Fix: one SECURITY DEFINER function that does the whole accept
-- server-side using the invite token — no cross-profile reads needed
-- from the client.
-- Run this in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_invite(p_token TEXT)
RETURNS jsonb AS $$
DECLARE
  inv           invites%ROWTYPE;
  me            UUID := auth.uid();       -- the logged-in invited partner
  my_profile    UUID;
  their_profile UUID;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Look up the invite by token
  SELECT * INTO inv FROM invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_already_used');
  END IF;

  -- Can't accept your own invite
  IF inv.from_user_id = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_accept_own_invite');
  END IF;

  -- Resolve both profile ids (function is SECURITY DEFINER so it may read all profiles)
  SELECT id INTO my_profile    FROM profiles WHERE user_id = me;
  SELECT id INTO their_profile FROM profiles WHERE user_id = inv.from_user_id;

  IF my_profile IS NULL OR their_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  -- Link both ways
  UPDATE profiles SET partner_id = their_profile WHERE id = my_profile;
  UPDATE profiles SET partner_id = my_profile    WHERE id = their_profile;

  -- Share Pro: if either is Pro, both become Pro
  IF EXISTS (SELECT 1 FROM profiles WHERE id IN (my_profile, their_profile) AND is_pro = true) THEN
    UPDATE profiles SET is_pro = true WHERE id IN (my_profile, their_profile);
  END IF;

  -- Mark the invite accepted
  UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE token = p_token;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION accept_invite(TEXT) TO authenticated;

SELECT 'accept_invite function ready ✅' AS status;
-- ═══════════════════════════════════════════════════════════
-- WeddingLedger — Shared Partner Data + Google email backfill
-- Run this whole file in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- ── PART A: Backfill missing emails on profiles (Google signups) ──
-- Google users had no email saved on their profile row; copy it from auth.users.
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '');

-- ── PART B: Shared data owner ──
-- When two partners link, ALL their data (vendors, guests, payments, settings,
-- tasks) should resolve to ONE owner: the account created first. We expose a
-- function the app calls to find "whose data do I read/write?".

CREATE OR REPLACE FUNCTION data_owner_for(p_user UUID)
RETURNS UUID AS $$
DECLARE
  my_prof     profiles%ROWTYPE;
  partner_uid UUID;
  my_created  TIMESTAMPTZ;
  their_created TIMESTAMPTZ;
BEGIN
  SELECT * INTO my_prof FROM profiles WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN p_user; END IF;
  IF my_prof.partner_id IS NULL THEN RETURN p_user; END IF;

  -- partner's user_id + created_at
  SELECT user_id, created_at INTO partner_uid, their_created
  FROM profiles WHERE id = my_prof.partner_id;
  IF partner_uid IS NULL THEN RETURN p_user; END IF;

  my_created := my_prof.created_at;
  -- The earlier-created account owns the shared data (stable + deterministic)
  IF their_created < my_created THEN
    RETURN partner_uid;
  ELSE
    RETURN p_user;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION data_owner_for(UUID) TO authenticated;

-- ── PART C: RLS so a partner can read/write the shared owner's rows ──
-- Helper: is p_owner either me, or my linked partner's data owner?
CREATE OR REPLACE FUNCTION can_access(p_owner UUID)
RETURNS BOOLEAN AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN false; END IF;
  IF p_owner = me THEN RETURN true; END IF;
  -- allowed if p_owner is the shared data owner for me
  RETURN p_owner = data_owner_for(me);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION can_access(UUID) TO authenticated;

-- Apply partner-aware policies to each data table.
-- (Existing owner-only policies stay; these ADD partner access.)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','payments','guests','settings','tasks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_partner_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_partner_all ON %I FOR ALL TO authenticated
         USING (can_access(user_id)) WITH CHECK (can_access(user_id))', t, t);
  END LOOP;
END $$;

SELECT 'Shared data + email backfill complete ✅' AS status;
