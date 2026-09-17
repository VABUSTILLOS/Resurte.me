-- ============================================================
-- 00127: Wallet — configuración de la tarjeta en el programa de lealtad
--
-- La tarjeta (migración 00126) es una fotografía del saldo, pero *qué*
-- recompensa anuncia es decisión del restaurante. Esa configuración vive en
-- `foodos_loyalty_programs` y no en la tabla de pases: el programa ya es la
-- fuente única del valor del punto, así que la recompensa va con él.
--
-- Decisiones:
--   1. `wallet_enabled` nace en `true`: emitir la tarjeta no cuesta nada y sin
--      certificados la de respaldo es la web con QR. Solo se apaga a propósito.
--   2. `reward_points` NULL = el restaurante no anunció recompensa. La tarjeta
--      se emite igual (con el saldo) pero sin barra de progreso: una barra sin
--      texto no comunica nada.
--   3. La recompensa se **copia** al pase al emitirlo (00126 ya guarda
--      `reward_label`/`reward_threshold`). Cambiarla aquí no reescribe las
--      tarjetas ya instaladas; se refrescan al reemitir, que es exactamente
--      el contrato de "fotografía, no consulta viva".
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.foodos_loyalty_programs
  ADD COLUMN IF NOT EXISTS wallet_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reward_points  INTEGER,
  ADD COLUMN IF NOT EXISTS reward_label   TEXT;

-- Una recompensa de 0 puntos no es una recompensa.
ALTER TABLE public.foodos_loyalty_programs
  DROP CONSTRAINT IF EXISTS foodos_loyalty_programs_reward_points_check;
ALTER TABLE public.foodos_loyalty_programs
  ADD CONSTRAINT foodos_loyalty_programs_reward_points_check
  CHECK (reward_points IS NULL OR reward_points > 0);

COMMENT ON COLUMN public.foodos_loyalty_programs.wallet_enabled IS
  'Si el restaurante ofrece la tarjeta de lealtad instalable (Apple/Google/web).';
COMMENT ON COLUMN public.foodos_loyalty_programs.reward_points IS
  'Puntos que desbloquean la recompensa anunciada en la tarjeta. NULL = sin recompensa.';
COMMENT ON COLUMN public.foodos_loyalty_programs.reward_label IS
  'Qué se lleva el comensal al juntar `reward_points` (ej. "Café gratis").';
