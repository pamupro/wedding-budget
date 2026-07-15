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
