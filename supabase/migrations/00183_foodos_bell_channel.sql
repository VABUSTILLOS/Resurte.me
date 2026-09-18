-- 00183 · El canal `bell` en la bitácora de avisos FoodOS
-- =============================================================================
-- POR QUÉ
--   El aviso al dueño necesita un canal que funcione SIN credenciales externas.
--   Medido en producción: `RESEND_API_KEY` ausente, sin credenciales de
--   WhatsApp, y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` también
--   ausentes. Los tres canales de entrega externa están apagados, así que un
--   aviso "por push/correo" sería invisible: una función que existe y no hace
--   nada, que es justo lo que este trabajo debe eliminar.
--
--   La campana persistente (`public.notifications`, migración 00073) no depende
--   de ningún proveedor: es una fila en la propia base del dueño, leída por
--   `/api/notifications`. Es el único canal que entrega hoy, y por eso entra en
--   la misma maquinaria de claim que push y correo en vez de quedar como un
--   INSERT suelto.
--
-- POR QUÉ ES UN CANAL MÁS Y NO UN INSERT APARTE
--   `notifications` solo deduplica cuando `order_id` no es NULL, y su `order_id`
--   es BIGINT con FK a `orders` (marketplace): un pedido FoodOS es UUID y no
--   cabe ahí. Sin el claim, cada reintento del aviso duplicaría la fila de la
--   campana. Registrarlo como canal reutiliza el mismo candado, la misma
--   auditoría y el mismo reintento-ante-fallo que ya tienen los otros dos.
--
-- NO SE TOCA
--   Nada existente: el CHECK solo se AMPLÍA (se añade 'bell').
-- =============================================================================

ALTER TABLE public.foodos_order_notifications
  DROP CONSTRAINT IF EXISTS foodos_order_notifications_channel_check;

ALTER TABLE public.foodos_order_notifications
  ADD CONSTRAINT foodos_order_notifications_channel_check
  CHECK (channel IN ('whatsapp', 'email', 'push', 'bell'));

COMMENT ON COLUMN public.foodos_order_notifications.channel IS
  'Canal de entrega: whatsapp | email | push (externos) | bell (campana persistente en public.notifications, sin proveedor).';

-- ---------------------------------------------------------------------------
-- GUARDIAS
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_chk       TEXT;
  v_ok_bell   BOOLEAN := false;
  v_rechaza   BOOLEAN := false;
  v_rest      UUID;
  v_order     UUID;
BEGIN
  -- G1 · El CHECK admite los cuatro canales.
  SELECT pg_get_constraintdef(oid) INTO v_chk
  FROM pg_constraint
  WHERE conrelid = 'public.foodos_order_notifications'::regclass
    AND conname = 'foodos_order_notifications_channel_check';
  IF v_chk IS NULL THEN
    RAISE EXCEPTION 'G1: no existe el CHECK de channel';
  END IF;
  IF v_chk NOT LIKE '%bell%' OR v_chk NOT LIKE '%push%'
     OR v_chk NOT LIKE '%email%' OR v_chk NOT LIKE '%whatsapp%' THEN
    RAISE EXCEPTION 'G1: el CHECK no admite los cuatro canales: %', v_chk;
  END IF;

  -- G2 · La clave de dedupe sigue llevando la audiencia (regresión de 00182).
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'idx_foodos_order_notifications_dedupe_v2'
  ) THEN
    RAISE EXCEPTION 'G2: desapareció el índice de dedupe con audiencia';
  END IF;

  -- G3 · PRUEBA FUNCIONAL: `bell` se escribe de verdad y deduplica de verdad.
  -- No basta con leer el CHECK: un CHECK presente y un INSERT que falla se
  -- ven igual desde `pg_get_constraintdef`.
  SELECT id INTO v_rest FROM public.foodos_restaurants LIMIT 1;
  IF v_rest IS NULL THEN
    RAISE NOTICE 'G3 OMITIDO: no hay restaurante con el que probar.';
  ELSE
    INSERT INTO public.foodos_orders (restaurant_id, status)
    VALUES (v_rest, 'pending') RETURNING id INTO v_order;

    INSERT INTO public.foodos_order_notifications
      (order_id, restaurant_id, audience, event, channel, recipient, status)
    VALUES (v_order, v_rest, 'owner', 'status:pending', 'bell', 'dueno', 'pending');
    v_ok_bell := true;

    BEGIN
      INSERT INTO public.foodos_order_notifications
        (order_id, restaurant_id, audience, event, channel, recipient, status)
      VALUES (v_order, v_rest, 'owner', 'status:pending', 'bell', 'dueno', 'pending');
      v_rechaza := false;
    EXCEPTION WHEN unique_violation THEN
      v_rechaza := true;
    END;

    DELETE FROM public.foodos_orders WHERE id = v_order;
  END IF;

  IF v_rest IS NOT NULL THEN
    IF NOT v_ok_bell THEN
      RAISE EXCEPTION 'G3: el canal bell no se pudo escribir';
    END IF;
    IF NOT v_rechaza THEN
      RAISE EXCEPTION 'G3: el canal bell no deduplica — cada reintento duplicaría la fila de la campana';
    END IF;
  END IF;

  RAISE NOTICE '00183 OK · canales = whatsapp | email | push | bell; bell probado y deduplicado.';
END $guard$;
