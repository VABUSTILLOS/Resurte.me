-- ============================================================
-- Resurte.me — Sistema de Referidos
-- Cada usuario obtiene un código único de referido.
-- Al registrarse con un código, se vincula al referidor.
-- Cuando el referido hace su primera compra ≥ $2,500 MXN,
-- el referidor recibe $100 créditos Resurte.
-- ============================================================

-- 1. Columnas en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.referral_code IS 'Código único de referido del usuario (ej: RESU-A3F9B2)';
COMMENT ON COLUMN profiles.referred_by   IS 'UUID del usuario que refirió a este usuario';

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by   ON profiles(referred_by);

-- 2. Función para generar código de referido único
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'RESU-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    SELECT EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- 3. Trigger para asignar referral_code automáticamente al crear perfil
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_referral_code ON profiles;

CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_referral_code();

-- 4. Asignar códigos a usuarios existentes que no tengan uno
UPDATE profiles SET referral_code = generate_referral_code() WHERE referral_code IS NULL;

-- 5. Función para procesar la recompensa por referido
-- Se ejecuta cuando una orden pasa a 'confirmed' (primera compra del referido)
CREATE OR REPLACE FUNCTION process_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
  v_order_count INTEGER;
  v_wallet_id BIGINT;
  v_reward_amount NUMERIC(10,2) := 100.00; -- $100 MXN de recompensa
BEGIN
  -- Solo procesar cuando status cambia a 'confirmed'
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Verificar que el usuario fue referido
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = NEW.user_id;
  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar que sea la primera compra del referido
  SELECT COUNT(*) INTO v_order_count FROM orders
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND status IN ('confirmed', 'preparing', 'out_for_delivery', 'delivered');

  IF v_order_count > 0 THEN
    RETURN NEW; -- No es primera compra, no premiar
  END IF;

  -- Asegurar que el monedero del referidor existe
  INSERT INTO wallets (user_id, balance_credits)
  VALUES (v_referrer_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_referrer_id;

  -- Registrar transacción de recompensa
  INSERT INTO wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (
    v_wallet_id,
    v_reward_amount,
    'Recompensa por referido — Usuario #' || NEW.user_id::TEXT,
    NEW.id
  );

  -- Actualizar saldo
  UPDATE wallets
  SET balance_credits = balance_credits + v_reward_amount,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_reward ON orders;

CREATE TRIGGER trg_referral_reward
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_referral_reward();

COMMENT ON TRIGGER trg_referral_reward ON orders
  IS 'Cuando una orden se confirma y es la primera compra de un usuario referido, da $100 MXN al referidor.';
