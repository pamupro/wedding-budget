-- ═══════════════════════════════════════════════════════════════
-- WeddingLedger — MASTER REPAIR & LOCKDOWN (safe to run repeatedly)
--
-- Run this ONE file and the database reaches the correct final
-- state, regardless of which earlier migrations ran or failed.
-- It adapts to your actual table columns, so it cannot fail the
-- way the previous lockdown file could.
-- ═══════════════════════════════════════════════════════════════

-- ── A. Admin flag + helper ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.is_admin FROM profiles p WHERE p.user_id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- Dedicated admin account (skips quietly if the auth user isn't there)
DO $$
DECLARE admin_uid uuid;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@wedding-ledger.com';
  IF admin_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE user_id = admin_uid) THEN
      UPDATE profiles SET is_admin = true WHERE user_id = admin_uid;
    ELSE
      INSERT INTO profiles (user_id, name1, is_admin) VALUES (admin_uid, 'Admin', true);
    END IF;
    -- personal account loses admin so only dedicated credentials work
    UPDATE profiles SET is_admin = false
    WHERE user_id = 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2';
  END IF;
END $$;

-- ── B. Admin console read/manage policies ──
DROP POLICY IF EXISTS admin_read_profiles   ON profiles;
CREATE POLICY admin_read_profiles   ON profiles FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_write_profiles  ON profiles;
CREATE POLICY admin_write_profiles  ON profiles FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_read_settings   ON settings;
CREATE POLICY admin_read_settings   ON settings FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_write_settings  ON settings;
CREATE POLICY admin_write_settings  ON settings FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_insert_settings ON settings;
CREATE POLICY admin_insert_settings ON settings FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS admin_read_vendors    ON vendors;
CREATE POLICY admin_read_vendors    ON vendors  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_read_tasks      ON tasks;
CREATE POLICY admin_read_tasks      ON tasks    FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS admin_read_payments   ON payments;
CREATE POLICY admin_read_payments   ON payments FOR SELECT TO authenticated USING (is_admin());

-- ── C. Support tickets (live chat) ──
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  name        text, email text, subject text, message text,
  status      text NOT NULL DEFAULT 'open',
  admin_reply text, replied_at timestamptz, source text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at  timestamptz,
  ADD COLUMN IF NOT EXISTS source      text;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_insert_any   ON support_tickets;
CREATE POLICY tickets_insert_any   ON support_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS tickets_read_own     ON support_tickets;
CREATE POLICY tickets_read_own     ON support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS tickets_admin_read   ON support_tickets;
CREATE POLICY tickets_admin_read   ON support_tickets FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS tickets_admin_update ON support_tickets;
CREATE POLICY tickets_admin_update ON support_tickets FOR UPDATE TO authenticated USING (is_admin());

-- ── D. Safe public profile view — built from YOUR actual columns ──
DO $$
DECLARE
  wanted text[] := ARRAY['user_id','name1','name2','wedding_date','page_slug','gallery_photos','page_message'];
  cols text := '';
  c text;
BEGIN
  FOREACH c IN ARRAY wanted LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name=c) THEN
      IF cols <> '' THEN cols := cols || ', '; END IF;
      cols := cols || quote_ident(c);
    END IF;
  END LOOP;
  EXECUTE 'DROP VIEW IF EXISTS public_profiles';
  EXECUTE format('CREATE VIEW public_profiles AS SELECT %s FROM profiles', cols);
  EXECUTE 'GRANT SELECT ON public_profiles TO anon, authenticated';
END $$;

-- ── E. Share page snapshot (server-validated) ──
CREATE OR REPLACE FUNCTION share_snapshot(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_enabled text;
BEGIN
  SELECT user_id INTO v_uid FROM settings WHERE key='share_token' AND value=p_token LIMIT 1;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO v_enabled FROM settings WHERE user_id=v_uid AND key='share_enabled';
  IF v_enabled IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'name1',        (SELECT name1 FROM profiles WHERE user_id=v_uid),
    'name2',        (SELECT name2 FROM profiles WHERE user_id=v_uid),
    'wedding_date', (SELECT wedding_date FROM profiles WHERE user_id=v_uid),
    'spend_limit',  (SELECT value FROM settings WHERE user_id=v_uid AND key='spend_limit'),
    'permissions',  (SELECT value FROM settings WHERE user_id=v_uid AND key='share_permissions'),
    'vendors',  COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at)    FROM vendors  v WHERE v.user_id=v_uid), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.payment_date)  FROM payments p WHERE p.user_id=v_uid), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION share_snapshot(text) FROM public;
GRANT EXECUTE ON FUNCTION share_snapshot(text) TO anon, authenticated;

-- ── F. Short-link resolver ──
CREATE OR REPLACE FUNCTION rsvp_lookup(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('gid', g.id, 'slug', p.page_slug)
  FROM guests g JOIN profiles p ON p.user_id = g.user_id
  WHERE g.link_code = p_code LIMIT 1
$$;
REVOKE ALL ON FUNCTION rsvp_lookup(text) FROM public;
GRANT EXECUTE ON FUNCTION rsvp_lookup(text) TO anon, authenticated;

-- ── G. RSVP guest fetch ──
CREATE OR REPLACE FUNCTION rsvp_get_guest(p_gid uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(g) - 'user_id' - 'link_code' - 'created_at' - 'group_label'
  FROM guests g WHERE g.id = p_gid
$$;
REVOKE ALL ON FUNCTION rsvp_get_guest(uuid) FROM public;
GRANT EXECUTE ON FUNCTION rsvp_get_guest(uuid) TO anon, authenticated;

-- ── H. RSVP submit (update linked guest / create new, identity protected) ──
CREATE OR REPLACE FUNCTION rsvp_submit(p_gid uuid, p_slug text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_id uuid;
  k text; v jsonb; col record;
  sets text := '';
  merged jsonb := '{}'::jsonb;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(p_data,'{}'::jsonb)) LOOP
    IF k NOT IN ('id','user_id','link_code','created_at','group_label')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='guests' AND column_name=k) THEN
      merged := merged || jsonb_build_object(k, v);
    END IF;
  END LOOP;

  IF p_gid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM guests WHERE id = p_gid) THEN RETURN NULL; END IF;
    FOR col IN SELECT c.column_name, c.data_type
               FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name='guests'
                 AND merged ? c.column_name LOOP
      IF sets <> '' THEN sets := sets || ', '; END IF;
      IF col.data_type = 'jsonb' THEN
        sets := sets || format('%I = ($1->%L)', col.column_name, col.column_name);
      ELSE
        sets := sets || format('%I = (($1->>%L))::%s', col.column_name, col.column_name,
                 CASE WHEN col.data_type IN ('USER-DEFINED','ARRAY') THEN 'text' ELSE col.data_type END);
      END IF;
    END LOOP;
    IF sets = '' THEN RETURN p_gid; END IF;
    EXECUTE format('UPDATE guests SET %s WHERE id = $2', sets) USING merged, p_gid;
    RETURN p_gid;
  ELSE
    SELECT user_id INTO v_uid FROM profiles WHERE page_slug = p_slug LIMIT 1;
    IF v_uid IS NULL THEN RETURN NULL; END IF;
    INSERT INTO guests
      SELECT (jsonb_populate_record(NULL::guests,
              merged || jsonb_build_object('user_id', v_uid,
                                           'id', gen_random_uuid(),
                                           'created_at', now()))).*
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION rsvp_submit(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION rsvp_submit(uuid, text, jsonb) TO anon, authenticated;

-- ── I. Public config keys the wedding/home pages may read ──
DROP POLICY IF EXISTS settings_public_config ON settings;
CREATE POLICY settings_public_config ON settings
  FOR SELECT TO anon
  USING (key IN ('menu_config','invitation_config','sub_price_monthly','sub_price_bundle'));

-- ── J. Close the open doors ──
DROP POLICY IF EXISTS "profiles_share_read" ON profiles;
DROP POLICY IF EXISTS "vendors_share_read"  ON vendors;
DROP POLICY IF EXISTS "payments_share_read" ON payments;
DROP POLICY IF EXISTS "settings_share_read" ON settings;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='guests' LOOP
    EXECUTE format('DROP POLICY %I ON guests', pol.policyname);
  END LOOP;
END $$;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY guests_own ON guests
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY guests_admin_read ON guests
  FOR SELECT TO authenticated USING (is_admin());

-- ── K. Sanity report ──
SELECT
  (SELECT count(*) FROM profiles)                                        AS profiles,
  (SELECT count(*) FROM guests)                                          AS guests,
  (SELECT count(*) FROM profiles WHERE is_admin)                         AS admins,
  (SELECT count(*) FROM pg_proc WHERE proname IN
     ('share_snapshot','rsvp_lookup','rsvp_get_guest','rsvp_submit'))    AS rpc_functions,
  'REPAIR COMPLETE ✅'                                                   AS status;
