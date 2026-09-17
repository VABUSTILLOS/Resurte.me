-- ============================================================
-- 00125: Flotilla — vista del repartidor y prueba de entrega
--
-- Cierra el resto de la Fase 4. Tres decisiones explícitas:
--
--  1. El repartidor NO tiene cuenta ni sesión en Resurte. Abre un
--     enlace con un `access_token` de capacidad (mismo patrón que el
--     id UUID del tracking público). El token es por repartidor, se
--     puede rotar y no da acceso a nada más que sus entregas.
--
--  2. La prueba de entrega es un PIN de 4 dígitos que viaja con el
--     pedido: el comensal lo ve en su tracking y el repartidor lo
--     teclea al entregar. Es la verificación barata que funciona sin
--     hardware. La foto es opcional y va a un bucket privado.
--
--  3. La cancelación lleva motivo. Es distinta de `failed`: cancelar
--     es una decisión del restaurante (cliente no contesta, se
--     arrepintió); fallar es un incidente en la calle.
-- ============================================================

-- ── 1. Prueba de entrega y cancelación ──────────────────────
ALTER TABLE public.foodos_deliveries
  ADD COLUMN IF NOT EXISTS proof_pin       TEXT,
  ADD COLUMN IF NOT EXISTS proof_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS proof_verified  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proof_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason   TEXT;

-- El PIN es exactamente 4 dígitos. Se permite NULL porque los pedidos
-- creados antes de esta migración no lo tienen.
ALTER TABLE public.foodos_deliveries
  DROP CONSTRAINT IF EXISTS foodos_deliveries_proof_pin_check;
ALTER TABLE public.foodos_deliveries
  ADD CONSTRAINT foodos_deliveries_proof_pin_check
  CHECK (proof_pin IS NULL OR proof_pin ~ '^[0-9]{4}$');

COMMENT ON COLUMN public.foodos_deliveries.proof_pin IS
  'PIN de 4 dígitos que el comensal muestra y el repartidor teclea al entregar.';
COMMENT ON COLUMN public.foodos_deliveries.proof_photo_path IS
  'Ruta en el bucket privado `entregas`. Opcional: no bloquea la entrega.';
COMMENT ON COLUMN public.foodos_deliveries.proof_verified IS
  'true cuando la entrega se cerró con el PIN correcto.';
COMMENT ON COLUMN public.foodos_deliveries.cancel_reason IS
  'Motivo de cancelación (decisión del restaurante), distinto de failed_reason.';

-- ── 2. Token de capacidad del repartidor ────────────────────
-- Se genera a demanda desde el panel (no se rellena aquí) porque la
-- generación aleatoria vive en Node, no en SQL.
ALTER TABLE public.foodos_couriers
  ADD COLUMN IF NOT EXISTS access_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_couriers_token
  ON public.foodos_couriers (access_token)
  WHERE access_token IS NOT NULL;

COMMENT ON COLUMN public.foodos_couriers.access_token IS
  'Capability token del enlace móvil del repartidor. NULL = sin enlace activo.';

-- ── 3. Bucket privado para las fotos de entrega ─────────────
-- Igual que `comprobantes`: sin políticas para anon/authenticated.
-- La sube el route handler del repartidor con la service key y el
-- panel la lee con URLs firmadas generadas en el servidor.
INSERT INTO storage.buckets (id, name, public)
VALUES ('entregas', 'entregas', false)
ON CONFLICT (id) DO NOTHING;

-- ── 4. RLS ──────────────────────────────────────────────────
-- El repartidor entra por route handlers con la service key, así que
-- no necesita políticas. Solo se añade la lectura de las columnas
-- nuevas para el dueño: la política de `foodos_deliveries` ya cubre
-- SELECT/UPDATE del dueño, y la de `foodos_couriers` ya es FOR ALL,
-- de modo que `access_token` queda visible y gestionable por el
-- dueño sin cambios adicionales.
