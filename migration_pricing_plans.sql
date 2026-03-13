-- Fix: settings table requires user_id, use your admin user_id as platform owner
-- Your admin user_id is: a151e7e9-25db-4d03-9a17-1ddcf8aa53a2

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key='sub_price_monthly' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2') THEN
    UPDATE settings SET value='4.99' WHERE key='sub_price_monthly' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2';
  ELSE
    INSERT INTO settings (key, value, user_id) VALUES ('sub_price_monthly', '4.99', 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2');
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key='sub_price_bundle' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2') THEN
    UPDATE settings SET value='15.00' WHERE key='sub_price_bundle' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2';
  ELSE
    INSERT INTO settings (key, value, user_id) VALUES ('sub_price_bundle', '15.00', 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='paypal_plan_id_monthly' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2') THEN
    INSERT INTO settings (key, value, user_id) VALUES ('paypal_plan_id_monthly', '', 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='paypal_plan_id_bundle' AND user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2') THEN
    INSERT INTO settings (key, value, user_id) VALUES ('paypal_plan_id_bundle', '', 'a151e7e9-25db-4d03-9a17-1ddcf8aa53a2');
  END IF;
END $$;

SELECT key, value FROM settings 
WHERE user_id='a151e7e9-25db-4d03-9a17-1ddcf8aa53a2' 
AND key IN ('sub_price_monthly','sub_price_bundle','paypal_plan_id_monthly','paypal_plan_id_bundle','sub_price','paypal_plan_id')
ORDER BY key;
