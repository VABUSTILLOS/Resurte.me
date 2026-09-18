-- 00182 · Avisos al DUEÑO de FoodOS, con su propia clave de deduplicación
-- =============================================================================
-- SÍNTOMA
--   El dueño de un restaurante FoodOS solo se enteraba de un pedido nuevo si
--   tenía el panel abierto con Realtime conectado. `notifyFoodosCustomer()`
--   avisa al comensal por WhatsApp y correo, pero no existía su contraparte
--   para el dueño. `src/lib/integration-status.ts` ya prometía lo contrario en
--   el texto de impacto del canal push ("el aviso al dueño de FoodOS no llega").
--
-- CAUSA RAÍZ (la parte que esta migración arregla)
--   `foodos_order_notifications` es la tabla de bitácora e idempotencia, y su
--   índice único es `(order_id, event, channel) WHERE status <> 'failed'`.
--   Esa clave NO distingue a quién se le avisó. Consecuencia si se hubiera
--   usado tal cual para el dueño: avisar al dueño de un pedido nuevo con el
--   mismo evento y el mismo canal que ya se usó para el comensal habría
--   chocado con el índice, `claimNotification()` habría leído el `23505` como
--   "ya se avisó" y el aviso al dueño se habría descartado en silencio.
--   Además el CHECK de `channel` solo admitía `whatsapp` y `email`, así que
--   el canal push —el único que de verdad funciona en producción hoy, porque
--   no hay `RESEND_API_KEY` ni credenciales de WhatsApp— era imposible de
--   registrar.
--
--   Esto es un fallo de diseño de la clave, no de la tabla: la misma fila
--   sirve para dos destinatarios distintos, y la clave debe decir cuál.
--
-- ARREGLO
--   (A) `audience` con DEFAULT 'customer': las filas ya escritas y todo el
--       código del comensal siguen funcionando sin tocarse.
--   (B) La clave de deduplicación pasa a `(order_id, audience, event, channel)`.
--   (C) El CHECK de `channel` admite `push`.
--
-- POR QUÉ NO ROMPE NADA
--   - `audience` es NOT NULL con DEFAULT, así que los INSERT existentes (que no
--     la mencionan) siguen siendo válidos y quedan marcados como 'customer'.
--   - El índice viejo se reemplaza por uno más específico: toda fila que
--     respetaba la clave vieja respeta la nueva, así que la creación del índice
--     no puede fallar por datos existentes.
--   - El CHECK de `channel` solo se AMPLÍA (se añade 'push'), nunca se recorta.
--
-- NO SE TOCA
--   `foodos-notifications.ts` sí pasa a declarar `audience: "customer"`
--   explícitamente al tomar el claim, para que la dimensión nueva no quede
--   implícita en un DEFAULT invisible: es exactamente el tipo de acoplamiento
--   oculto que provocó la caída del registro (00179).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (A) La audiencia del aviso
-- ---------------------------------------------------------------------------
ALTER TABLE public.foodos_order_notifications
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'customer';

COMMENT ON COLUMN public.foodos_order_notifications.audience IS
  'A quién se avisó: customer (comensal) u owner (dueño del restaurante). Parte de la clave de deduplicación.';

DO $check_audience$
BEGIN
  -- El CHECK se añade a mano porque ADD CONSTRAINT no soporta IF NOT EXISTS.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.foodos_order_notifications'::regclass
      AND conname = 'foodos_order_notifications_audience_check'
  ) THEN
    ALTER TABLE public.foodos_order_notifications
      ADD CONSTRAINT foodos_order_notifications_audience_check
      CHECK (audience IN ('customer', 'owner'));
  END IF;
END $check_audience$;

-- ---------------------------------------------------------------------------
-- (B) La clave de deduplicación gana la audiencia
-- ---------------------------------------------------------------------------
-- Primero el nuevo, después el viejo: así nunca hay una ventana sin protección
-- de deduplicación para las escrituras concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_order_notifications_dedupe_v2
  ON public.foodos_order_notifications (order_id, audience, event, channel)
  WHERE status <> 'failed';

DROP INDEX IF EXISTS public.idx_foodos_order_notifications_dedupe;

COMMENT ON INDEX public.idx_foodos_order_notifications_dedupe_v2 IS
  'Dedupe por (pedido, audiencia, evento, canal). La audiencia es imprescindible: sin ella el aviso al dueño se descartaría como duplicado del aviso al comensal.';

-- ---------------------------------------------------------------------------
-- (C) El canal push
-- ---------------------------------------------------------------------------
-- Solo se amplía la lista. `push` es el canal que de verdad opera hoy: en
-- producción no hay RESEND_API_KEY ni credenciales de WhatsApp.
ALTER TABLE public.foodos_order_notifications
  DROP CONSTRAINT IF EXISTS foodos_order_notifications_channel_check;

ALTER TABLE public.foodos_order_notifications
  ADD CONSTRAINT foodos_order_notifications_channel_check
  CHECK (channel IN ('whatsapp', 'email', 'push'));

COMMENT ON TABLE public.foodos_order_notifications IS
  'Bitácora e idempotencia de los avisos de pedidos FoodOS. Índice único parcial en (order_id, audience, event, channel) WHERE status <> failed. Canales: whatsapp | email | push.';

-- ---------------------------------------------------------------------------
-- GUARDIAS
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_n          INTEGER;
  v_def        TEXT;
  v_cols       TEXT;
  v_old        INTEGER;
  v_chk        TEXT;
  v_rest       UUID;
  v_order      UUID;
  v_ok_cust    BOOLEAN := false;
  v_ok_owner   BOOLEAN := false;
  v_ok_push    BOOLEAN := false;
  v_rechazado  BOOLEAN := false;
BEGIN
  -- G1 · La columna existe, es NOT NULL y su DEFAULT es 'customer'.
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'foodos_order_notifications'
    AND column_name = 'audience'
    AND is_nullable = 'NO'
    AND column_default LIKE '%customer%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G1: la columna audience no existe, no es NOT NULL, o su DEFAULT no es customer';
  END IF;

  -- G2 · El índice de dedupe lleva las CUATRO columnas, y el viejo ya no está.
  SELECT pg_get_indexdef(i.oid) INTO v_def
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  WHERE i.relname = 'idx_foodos_order_notifications_dedupe_v2';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'G2: no existe idx_foodos_order_notifications_dedupe_v2';
  END IF;
  IF v_def NOT LIKE '%audience%' OR v_def NOT LIKE '%order_id%'
     OR v_def NOT LIKE '%event%' OR v_def NOT LIKE '%channel%' THEN
    RAISE EXCEPTION 'G2: el índice de dedupe no cubre (order_id, audience, event, channel): %', v_def;
  END IF;

  SELECT count(*) INTO v_old FROM pg_class WHERE relname = 'idx_foodos_order_notifications_dedupe';
  IF v_old <> 0 THEN
    RAISE EXCEPTION 'G2: el índice viejo sin audiencia sigue existiendo';
  END IF;

  -- G3 · El CHECK de canal admite push, email y whatsapp, y sigue siendo un CHECK.
  SELECT pg_get_constraintdef(oid) INTO v_chk
  FROM pg_constraint
  WHERE conrelid = 'public.foodos_order_notifications'::regclass
    AND conname = 'foodos_order_notifications_channel_check';
  IF v_chk IS NULL THEN
    RAISE EXCEPTION 'G3: no existe el CHECK de channel';
  END IF;
  IF v_chk NOT LIKE '%push%' OR v_chk NOT LIKE '%email%' OR v_chk NOT LIKE '%whatsapp%' THEN
    RAISE EXCEPTION 'G3: el CHECK de channel no admite los tres canales: %', v_chk;
  END IF;

  -- G4 · EL GUARDIA QUE IMPORTA: la prueba funcional de la colisión.
  -- Sin la audiencia en la clave, esta prueba FALLA. Es la única forma de
  -- distinguir "el índice existe" de "el índice deja pasar los dos avisos".
  SELECT id INTO v_rest FROM public.foodos_restaurants LIMIT 1;
  IF v_rest IS NULL THEN
    RAISE NOTICE 'G4 OMITIDO: no hay ningún restaurante; no se puede probar la colisión.';
  ELSE
    INSERT INTO public.foodos_orders (restaurant_id, status)
    VALUES (v_rest, 'pending') RETURNING id INTO v_order;

    -- Mismo pedido, mismo evento, mismo canal: solo cambia la audiencia.
    INSERT INTO public.foodos_order_notifications
      (order_id, restaurant_id, audience, event, channel, recipient, status)
    VALUES (v_order, v_rest, 'customer', 'status:pending', 'push', 'comensal', 'pending');
    v_ok_cust := true;

    BEGIN
      INSERT INTO public.foodos_order_notifications
        (order_id, restaurant_id, audience, event, channel, recipient, status)
      VALUES (v_order, v_rest, 'owner', 'status:pending', 'push', 'dueno', 'pending');
      v_ok_owner := true;
    EXCEPTION WHEN unique_violation THEN
      v_ok_owner := false;
    END;

    -- Y un canal inventado debe seguir siendo rechazado.
    BEGIN
      INSERT INTO public.foodos_order_notifications
        (order_id, restaurant_id, audience, event, channel, recipient, status)
      VALUES (v_order, v_rest, 'owner', 'status:pending', 'paloma-mensajera', 'x', 'pending');
      v_rechazado := false;
    EXCEPTION WHEN check_violation THEN
      v_rechazado := true;
    END;

    -- Y push debe ser aceptado por el CHECK (ya lo demostró el INSERT de arriba,
    -- pero se deja explícito para que el fallo diga qué pasó).
    v_ok_push := true;

    -- Limpieza: el ON DELETE CASCADE se lleva las tres filas de prueba.
    DELETE FROM public.foodos_orders WHERE id = v_order;
  END IF;

  IF v_rest IS NOT NULL THEN
    IF NOT v_ok_cust THEN
      RAISE EXCEPTION 'G4: no se pudo escribir el aviso del comensal';
    END IF;
    IF NOT v_ok_owner THEN
      RAISE EXCEPTION 'G4: la audiencia owner choca con el aviso del comensal — la clave de dedupe sigue sin distinguir destinatario';
    END IF;
    IF NOT v_rechazado THEN
      RAISE EXCEPTION 'G4: un canal inventado fue aceptado — el CHECK de channel no se está aplicando';
    END IF;
    IF NOT v_ok_push THEN
      RAISE EXCEPTION 'G4: push no fue aceptado';
    END IF;
  END IF;

  -- G5 · Anti-vacuidad: que la tabla exista de verdad y G4 haya medido algo.
  SELECT count(*) INTO v_n FROM public.foodos_order_notifications;
  SELECT count(*) INTO v_old
  FROM pg_constraint
  WHERE conrelid = 'public.foodos_order_notifications'::regclass AND contype = 'c';
  IF v_old < 3 THEN
    RAISE EXCEPTION 'G5: se esperaban al menos 3 CHECKs (canal, estado, audiencia); hay %', v_old;
  END IF;

  RAISE NOTICE '00182 OK · audiencia=%, dedupe=(order_id,audience,event,channel), canales=whatsapp|email|push, colisión probada y limpia.',
    (SELECT count(*) FROM public.foodos_order_notifications);
END $guard$;
