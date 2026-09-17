-- ============================================================
-- 00151: Solicitudes de servicio — el canje deja de ser un débito huérfano
--
-- QUÉ ESTABA MAL
--   `redeem_service()` debitaba créditos reales y creaba una fila en
--   `redemptions`… que nadie leía nunca. No existía cola de trabajo, ni
--   responsable, ni fecha compromiso, ni evidencia de entrega, ni forma de
--   avanzar el estado. Los tres estados (`pending|completed|cancelled`) se
--   quedaban en `pending` para siempre porque ninguna superficie ni función
--   los movía.
--
--   Peor: `CheckoutFlowScreen` paso 2 pide nombre, Google Maps, redes y notas
--   "para que el servicio realmente funcione", y el POST sólo enviaba
--   `service_id`. El brief se descartaba en el cliente. Y el paso 3 prometía
--   "te avisaremos en cada paso del proceso" cuando no había proceso.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   1. `redemptions` pasa a ser una solicitud con ciclo de vida real:
--      brief, responsable, fecha compromiso (SLA), evidencia de entrega y
--      marcas de tiempo por estado.
--   2. `redemption_events`: bitácora de la solicitud, visible para el cliente
--      (es la que sostiene la promesa "te avisaremos en cada paso").
--   3. `advance_redemption()`: ÚNICA fuente de verdad de las transiciones.
--      Valida la matriz, sella timestamps, escribe el evento y —si se cancela
--      antes de entregar— devuelve los créditos. Nadie más mueve `status`.
--   4. `reward_services.sla_days`: el compromiso de entrega se declara en el
--      catálogo, no se inventa en el código.
--   5. Guardas de regresión.
--
-- RENOMBRE DE ESTADOS
--   `pending` → `requested`, `completed` → `delivered`. Producción tenía 0
--   filas en `redemptions` al escribir esto, así que la conversión es
--   trivialmente segura; se deja igualmente escrita para no depender de eso.
--
-- INVARIANTE DE DINERO
--   Cancelar ANTES de entregar devuelve los créditos. Siempre, sin bandera
--   opcional: no hay caso legítimo en que el cliente pague y no reciba nada.
--   Cancelar algo ya entregado no devuelve nada. `refunded_at` hace el
--   reverso idempotente.
-- ============================================================

-- ============================================================
-- 1. CICLO DE VIDA DE LA SOLICITUD
-- ============================================================

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS brief            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_to      TEXT,
  ADD COLUMN IF NOT EXISTS due_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason    TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_url  TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_note TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.redemptions.brief IS
  'Respuestas del cliente en el paso 2 del canje: nombre del restaurante, Google Maps, redes sociales y notas.';
COMMENT ON COLUMN public.redemptions.assigned_to IS
  'Responsable humano del servicio (nombre del equipo). Null = sin asignar.';
COMMENT ON COLUMN public.redemptions.due_at IS
  'Fecha compromiso de entrega, calculada al crear la solicitud desde reward_services.sla_days.';
COMMENT ON COLUMN public.redemptions.refunded_at IS
  'Cuándo se devolvieron los créditos por una cancelación. No nulo = ya devueltos (idempotencia).';
COMMENT ON COLUMN public.redemptions.deliverable_url IS
  'Enlace al entregable (carpeta de fotos, campaña, sitio). Es la evidencia de entrega.';

-- Renombrar los estados a algo que describa el trabajo real.
ALTER TABLE public.redemptions DROP CONSTRAINT IF EXISTS redemptions_status_check;

UPDATE public.redemptions SET status = 'requested' WHERE status = 'pending';
UPDATE public.redemptions SET status = 'delivered' WHERE status = 'completed';

ALTER TABLE public.redemptions
  ADD CONSTRAINT redemptions_status_check
  CHECK (status IN ('requested', 'in_progress', 'delivered', 'cancelled'));

ALTER TABLE public.redemptions ALTER COLUMN status SET DEFAULT 'requested';

-- Cola de trabajo: pendientes por fecha compromiso (lo que se ve en /admin).
CREATE INDEX IF NOT EXISTS idx_redemptions_queue
  ON public.redemptions (status, due_at)
  WHERE status IN ('requested', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_redemptions_service ON public.redemptions (service_id);

-- ============================================================
-- 2. BITÁCORA DE LA SOLICITUD (timeline del cliente)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.redemption_events (
  id            BIGSERIAL PRIMARY KEY,
  redemption_id BIGINT NOT NULL REFERENCES public.redemptions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  note          TEXT,
  actor         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.redemption_events IS
  'Timeline de una solicitud de servicio: cada transición de estado o cambio de responsable/evidencia. Lo ve el cliente en /recompensas.';

CREATE INDEX IF NOT EXISTS idx_redemption_events_request
  ON public.redemption_events (redemption_id, created_at);

ALTER TABLE public.redemption_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own redemption events' AND tablename = 'redemption_events'
  ) THEN
    CREATE POLICY "Users can view own redemption events" ON public.redemption_events
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.redemptions r
          WHERE r.id = public.redemption_events.redemption_id
            AND r.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- ============================================================
-- 3. SLA POR SERVICIO
-- ============================================================

ALTER TABLE public.reward_services
  ADD COLUMN IF NOT EXISTS sla_days INTEGER NOT NULL DEFAULT 14;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reward_services_sla_days_check'
      AND conrelid = 'public.reward_services'::regclass
  ) THEN
    ALTER TABLE public.reward_services
      ADD CONSTRAINT reward_services_sla_days_check
      CHECK (sla_days > 0 AND sla_days <= 180);
  END IF;
END;
$$;

COMMENT ON COLUMN public.reward_services.sla_days IS
  'Días compromiso de entrega desde que el cliente canjea el servicio. Se copia a redemptions.due_at.';

-- Compromisos por defecto según la naturaleza del servicio.
UPDATE public.reward_services SET sla_days = 14 WHERE category = 'presencia'  AND sla_days = 14;
UPDATE public.reward_services SET sla_days = 21 WHERE category = 'trafico'    AND sla_days = 14;
UPDATE public.reward_services SET sla_days = 30 WHERE category = 'infraestructura' AND sla_days = 14;

-- ============================================================
-- 4. ALTA: fecha compromiso + primer evento
-- ============================================================

-- BEFORE INSERT: hereda el SLA del catálogo. Vive en un trigger para que
-- cualquier camino de alta (hoy sólo redeem_service, mañana el que sea)
-- obtenga la fecha compromiso sin duplicar la lógica.
CREATE OR REPLACE FUNCTION public.set_redemption_due_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sla INTEGER;
BEGIN
  IF NEW.due_at IS NULL THEN
    SELECT rs.sla_days INTO v_sla
    FROM public.reward_services rs
    WHERE rs.id = NEW.service_id;

    NEW.due_at := now() + make_interval(days => COALESCE(v_sla, 14));
  END IF;

  NEW.status_updated_at := COALESCE(NEW.status_updated_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_redemption_due_at ON public.redemptions;
CREATE TRIGGER trg_redemption_due_at
  BEFORE INSERT ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.set_redemption_due_at();

-- AFTER INSERT: la solicitud nace con su primer evento, así el timeline del
-- cliente nunca aparece vacío y la bitácora no depende de quién insertó.
CREATE OR REPLACE FUNCTION public.log_redemption_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.redemption_events (redemption_id, status, note, actor)
  VALUES (NEW.id, NEW.status, 'Solicitud recibida', 'Sistema');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_redemption_created_event ON public.redemptions;
CREATE TRIGGER trg_redemption_created_event
  AFTER INSERT ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.log_redemption_created();

-- ============================================================
-- 5. advance_redemption() — única fuente de verdad de las transiciones
-- ============================================================

CREATE OR REPLACE FUNCTION public.advance_redemption(
  p_id               BIGINT,
  p_status           TEXT    DEFAULT NULL,
  p_actor            TEXT    DEFAULT NULL,
  p_note             TEXT    DEFAULT NULL,
  p_assigned_to      TEXT    DEFAULT NULL,
  p_deliverable_url  TEXT    DEFAULT NULL,
  p_deliverable_note TEXT    DEFAULT NULL
)
RETURNS TABLE (
  ok         BOOLEAN,
  new_status TEXT,
  refunded   BOOLEAN,
  error_msg  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r        public.redemptions%ROWTYPE;
  v_allowed  TEXT[];
  v_status   TEXT;
  v_wallet   BIGINT;
  v_refunded BOOLEAN := false;
BEGIN
  ok := false;
  new_status := NULL;
  refunded := false;
  error_msg := NULL;

  IF p_id IS NULL THEN
    error_msg := 'Solicitud inválida';
    RETURN NEXT;
    RETURN;
  END IF;

  -- FOR UPDATE: dos administradores moviendo la misma solicitud se serializan.
  SELECT * INTO v_r FROM public.redemptions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    error_msg := 'Solicitud no encontrada';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_status IS NOT NULL THEN
    IF p_status NOT IN ('requested', 'in_progress', 'delivered', 'cancelled') THEN
      error_msg := 'Estado desconocido: ' || p_status;
      RETURN NEXT;
      RETURN;
    END IF;

    -- Matriz de transiciones. `delivered` y `cancelled` son terminales:
    -- una entrega no se deshace (se cancela el servicio, no la historia) y
    -- una cancelación ya devolvió los créditos.
    IF v_r.status = 'requested' THEN
      v_allowed := ARRAY['in_progress', 'cancelled'];
    ELSIF v_r.status = 'in_progress' THEN
      v_allowed := ARRAY['delivered', 'cancelled'];
    ELSE
      v_allowed := ARRAY[]::TEXT[];
    END IF;

    IF p_status IS DISTINCT FROM v_r.status AND NOT (p_status = ANY (v_allowed)) THEN
      error_msg := format('Transición inválida: %s → %s', v_r.status, p_status);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  v_status := COALESCE(p_status, v_r.status);

  -- ── Devolución de créditos ──
  -- Cancelar antes de entregar devuelve los créditos. No hay bandera para
  -- desactivarlo: cobrar y no entregar no es un caso de negocio válido.
  -- `refunded_at IS NULL` + el estado de origen lo hacen idempotente.
  IF v_status = 'cancelled'
     AND v_r.status IN ('requested', 'in_progress')
     AND v_r.refunded_at IS NULL THEN

    INSERT INTO public.wallets (user_id, balance_credits)
    VALUES (v_r.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT id INTO v_wallet FROM public.wallets WHERE user_id = v_r.user_id FOR UPDATE;

    INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
    VALUES (v_wallet, v_r.cost_credits, 'Reverso canje: ' || v_r.service_name, NULL);

    UPDATE public.wallets
    SET balance_credits = balance_credits + v_r.cost_credits,
        updated_at = now()
    WHERE id = v_wallet;

    v_refunded := true;
  END IF;

  UPDATE public.redemptions r SET
    status            = v_status,
    assigned_to       = COALESCE(p_assigned_to, r.assigned_to),
    deliverable_url   = COALESCE(p_deliverable_url, r.deliverable_url),
    deliverable_note  = COALESCE(p_deliverable_note, r.deliverable_note),
    cancel_reason     = CASE WHEN v_status = 'cancelled' THEN COALESCE(p_note, r.cancel_reason) ELSE r.cancel_reason END,
    refunded_at       = CASE WHEN v_refunded THEN now() ELSE r.refunded_at END,
    started_at        = CASE WHEN v_status = 'in_progress' AND r.started_at IS NULL THEN now() ELSE r.started_at END,
    delivered_at      = CASE WHEN v_status = 'delivered'   AND r.delivered_at IS NULL THEN now() ELSE r.delivered_at END,
    cancelled_at      = CASE WHEN v_status = 'cancelled'   AND r.cancelled_at IS NULL THEN now() ELSE r.cancelled_at END,
    status_updated_at = CASE WHEN v_status IS DISTINCT FROM r.status THEN now() ELSE r.status_updated_at END,
    updated_at        = now()
  WHERE r.id = p_id;

  -- ── Bitácora ──
  IF v_status IS DISTINCT FROM v_r.status THEN
    INSERT INTO public.redemption_events (redemption_id, status, note, actor)
    VALUES (p_id, v_status, p_note, p_actor);
  ELSIF p_note IS NOT NULL OR p_assigned_to IS NOT NULL
        OR p_deliverable_url IS NOT NULL OR p_deliverable_note IS NOT NULL THEN
    -- Cambio de metadatos sin transición (asignar responsable, adjuntar
    -- entregable): también deja rastro, con el estado que no cambió.
    INSERT INTO public.redemption_events (redemption_id, status, note, actor)
    VALUES (p_id, v_r.status, COALESCE(p_note, 'Actualización de la solicitud'), p_actor);
  END IF;

  ok := true;
  new_status := v_status;
  refunded := v_refunded;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Avanza una solicitud de servicio. Única fuente de verdad de las transiciones (requested → in_progress → delivered, con cancelled desde las dos primeras). Sella timestamps, escribe en redemption_events y, al cancelar antes de entregar, devuelve los créditos al monedero. Idempotente por refunded_at.';

-- ============================================================
-- 6. ACL — sólo service_role
-- ============================================================

REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 7. GUARDAS DE REGRESIÓN
-- ============================================================

DO $$
DECLARE
  v_missing TEXT;
BEGIN
  -- 7.1 Toda transición de estado pasa por advance_redemption. Si alguien
  --     vuelve a escribir `status` a mano en otra función, la matriz deja de
  --     ser la única fuente de verdad.
  SELECT string_agg(DISTINCT p.proname, ', ')
  INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL (
    SELECT regexp_replace(regexp_replace(p.prosrc, '''[^'']*''', '', 'gn'), '--.*', '', 'gn') AS body
  ) s
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname <> 'advance_redemption'
    AND s.body ~* 'UPDATE[[:space:]]+public\.redemptions'
    AND s.body ~* 'status[[:space:]]*=';

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Guard 7.1: otra función escribe redemptions.status: %', v_missing;
  END IF;

  -- 7.2 El check de estado debe aceptar los cuatro estados del ciclo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'redemptions_status_check'
      AND conrelid = 'public.redemptions'::regclass
      AND pg_get_constraintdef(oid) LIKE '%in_progress%'
      AND pg_get_constraintdef(oid) LIKE '%delivered%'
  ) THEN
    RAISE EXCEPTION 'Guard 7.2: redemptions_status_check no cubre el ciclo completo';
  END IF;

  -- 7.3 La bitácora del cliente no puede quedar sin RLS.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'redemption_events' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Guard 7.3: redemption_events sin RLS';
  END IF;

  -- 7.4 advance_redemption es RETURNS TABLE: si pierde el RETURN NEXT,
  --     devuelve 0 filas y el llamador reporta fallo DESPUÉS de haber
  --     devuelto los créditos. (Mismo defecto que 00149 arregló en
  --     redeem_service.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'advance_redemption'
      AND p.prosrc ~* '\mRETURN[[:space:]]+NEXT\M'
  ) THEN
    RAISE EXCEPTION 'Guard 7.4: advance_redemption no emite fila (RETURN NEXT ausente)';
  END IF;
END;
$$;
