-- Add two-plan pricing to settings table
-- Safe version - works even without unique constraint

-- Monthly plan price
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key='sub_price_monthly' AND user_id IS NULL) THEN
    UPDATE settings SET value='4.99' WHERE key='sub_price_monthly' AND user_id IS NULL;
  ELSE
    INSERT INTO settings (key, value, user_id) VALUES ('sub_price_monthly', '4.99', NULL);
  END IF;
END $$;

-- Bundle price
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key='sub_price_bundle' AND user_id IS NULL) THEN
    UPDATE settings SET value='15.00' WHERE key='sub_price_bundle' AND user_id IS NULL;
  ELSE
    INSERT INTO settings (key, value, user_id) VALUES ('sub_price_bundle', '15.00', NULL);
  END IF;
END $$;

-- Monthly PayPal Plan ID (empty - set via admin panel)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='paypal_plan_id_monthly' AND user_id IS NULL) THEN
    INSERT INTO settings (key, value, user_id) VALUES ('paypal_plan_id_monthly', '', NULL);
  END IF;
END $$;

-- Bundle PayPal Plan ID (empty - set via admin panel)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key='paypal_plan_id_bundle' AND user_id IS NULL) THEN
    INSERT INTO settings (key, value, user_id) VALUES ('paypal_plan_id_bundle', '', NULL);
  END IF;
END $$;

-- Verify
SELECT key, value FROM settings WHERE user_id IS NULL ORDER BY key;
