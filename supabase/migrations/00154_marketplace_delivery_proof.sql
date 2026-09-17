-- ============================================================
-- 00154: Comprobante de entrega del marketplace
--
-- El problema: cuando un pedido del marketplace pasaba a `delivered`,
-- no quedaba NINGÚN artefacto de la entrega. La única prueba era el
-- `status` que un admin acababa de escribir a mano. En un mercado
-- mayorista eso deja la disputa más común —"no me llegó" / "me llegó
-- incompleto"— sin respuesta posible: no hay foto, no hay hora, no hay
-- quién. Cero referencias en el repo antes de esta migración.
--
-- Decisiones explícitas:
--
--  1. Se guarda la RUTA, no una URL. El bucket `entregas` es privado
--     (00125) y no tiene políticas para anon/authenticated, así que una
--     URL guardada en la base o apunta a un objeto inaccesible o exige
--     volver público el bucket — es decir, publicar para siempre la foto
--     de la entrega de cada restaurante. La URL se firma al leer, con
--     vida de una hora.
--
--  2. Se reutiliza el bucket `entregas` en vez de crear uno nuevo. Es el
--     mismo tipo de objeto con el mismo modelo de privacidad y ya está
--     en producción; un bucket por feature multiplica las superficies de
--     permisos sin ganar nada. Las rutas del marketplace viven bajo el
--     prefijo `marketplace/` para no chocar con las de FoodOS, que usan
--     `<restaurant_id>/<order_id>/`.
--
--  3. Un comprobante por pedido, no una tabla de fotos. La evidencia que
--     resuelve la disputa es "así se entregó, a esta hora"; una colección
--     es una feature que nadie pidió. Si algún día hace falta, la tabla
--     nueva convive con estas columnas.
--
--  4. NO bloquea cerrar el pedido. Mismo criterio que el PIN y la foto de
--     FoodOS (00125): la foto respalda, no autoriza. Exigirla dejaría
--     pedidos imposibles de cerrar cuando la cámara falla o el cliente
--     firma en papel, y el admin acabaría subiendo una foto falsa para
--     desbloquearse. Se avisa en la interfaz, no se impone en la base.
-- ============================================================

-- ── 1. Columnas de evidencia ────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS delivery_proof_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_proof_note TEXT;

COMMENT ON COLUMN public.orders.delivery_proof_path IS
  'Ruta en el bucket privado `entregas`, prefijo `marketplace/`. Se firma al leer: nunca se guarda una URL.';
COMMENT ON COLUMN public.orders.delivery_proof_at IS
  'Cuándo se subió el comprobante. Distinto de `updated_at`: la evidencia no cambia cuando el pedido cambia.';
COMMENT ON COLUMN public.orders.delivery_proof_note IS
  'Nota del repartidor o del admin sobre la entrega (quién recibió, incidencias).';

-- ── 2. Los tres van juntos o no va ninguno ──────────────────
-- Un comprobante sin fecha no se puede situar en el tiempo, y una nota
-- sin comprobante es un comentario huérfano. La base impone la
-- coherencia para que no dependa de que la ruta recuerde escribir las
-- tres columnas.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_proof_coherent_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_proof_coherent_check
  CHECK (
    (delivery_proof_path IS NULL AND delivery_proof_at IS NULL AND delivery_proof_note IS NULL)
    OR (delivery_proof_path IS NOT NULL AND delivery_proof_at IS NOT NULL)
  );

-- ── 3. Guard de regresión ───────────────────────────────────
-- Falla la migración en vez de dejar la superficie a medias: si el bucket
-- se volvió público, guardar una ruta ya no protege nada y el diseño de
-- "firmar al leer" sería una mentira.
DO $guard_proof$
DECLARE
  v_public BOOLEAN;
  v_missing TEXT[];
BEGIN
  SELECT ARRAY(
    SELECT c.name
    FROM (VALUES
      ('delivery_proof_path'),
      ('delivery_proof_at'),
      ('delivery_proof_note')
    ) AS c(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = 'orders'
        AND col.column_name = c.name
    )
  ) INTO v_missing;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan columnas de comprobante en orders: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT b.public INTO v_public
  FROM storage.buckets b
  WHERE b.id = 'entregas';

  IF v_public IS NULL THEN
    RAISE EXCEPTION
      'El bucket `entregas` no existe: el comprobante no tendría dónde guardarse (ver 00125)';
  END IF;

  IF v_public THEN
    RAISE EXCEPTION
      'El bucket `entregas` es público: guardar solo la ruta dejaría la foto de entrega de cada restaurante expuesta sin firmar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_proof_coherent_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    RAISE EXCEPTION 'No se creó orders_delivery_proof_coherent_check';
  END IF;
END
$guard_proof$;
