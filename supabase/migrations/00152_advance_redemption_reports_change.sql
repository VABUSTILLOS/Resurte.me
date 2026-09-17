-- ============================================================
-- 00152: advance_redemption() distingue "lo hice" de "ya estaba así"
--
-- POR QUÉ
--   En la prueba funcional de 00151, cancelar dos veces la MISMA solicitud
--   devolvía `ok = true` las dos veces. El dinero estaba a salvo (el guard
--   `refunded_at IS NULL` impidió el doble reverso, verificado: 1 solo
--   movimiento), pero el llamador no podía saber si había pasado algo.
--
--   Eso importa por dos razones concretas:
--     · La bitácora de administración registraría una cancelación que nunca
--       ocurrió (un doble clic produce dos renglones de auditoría).
--     · Un reintento de red se ve idéntico a una operación nueva.
--
--   La semántica correcta no es rechazar el reintento —eso convertiría un
--   doble clic en un error alarmante para algo que sí quedó bien— sino
--   responder "ya estaba en ese estado" de forma explícita.
--
-- QUÉ CAMBIA
--   `advance_redemption` gana un cuarto campo de salida `changed`:
--     ok = true, changed = true   → la transición se aplicó
--     ok = true, changed = false  → ya estaba en ese estado; nada que hacer
--     ok = false                  → transición inválida o solicitud no hallada
--
--   Como cambia el tipo de retorno, hay que soltar la función; el DROP se
--   lleva los privilegios, así que se vuelven a otorgar aquí abajo.
-- ============================================================

DROP FUNCTION IF EXISTS public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
  changed    BOOLEAN,
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
  v_changed  BOOLEAN := false;
BEGIN
  ok := false;
  new_status := NULL;
  changed := false;
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

    -- Repetir el MISMO estado no es un error: es un reintento idempotente.
    -- Sale por `changed = false` más abajo, sin escribir evento ni bitácora.
    IF p_status IS DISTINCT FROM v_r.status AND NOT (p_status = ANY (v_allowed)) THEN
      error_msg := format('Transición inválida: %s → %s', v_r.status, p_status);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  v_status := COALESCE(p_status, v_r.status);
  v_changed := v_status IS DISTINCT FROM v_r.status;

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
    status_updated_at = CASE WHEN v_changed THEN now() ELSE r.status_updated_at END,
    updated_at        = now()
  WHERE r.id = p_id;

  -- ── Bitácora ──
  -- Sólo se escribe cuando algo cambió de verdad: un reintento idempotente
  -- no debe llenar el timeline del cliente con pasos que no ocurrieron.
  IF v_changed THEN
    INSERT INTO public.redemption_events (redemption_id, status, note, actor)
    VALUES (p_id, v_status, p_note, p_actor);
  ELSIF p_note IS NOT NULL OR p_assigned_to IS NOT NULL
        OR p_deliverable_url IS NOT NULL OR p_deliverable_note IS NOT NULL THEN
    INSERT INTO public.redemption_events (redemption_id, status, note, actor)
    VALUES (p_id, v_r.status, COALESCE(p_note, 'Actualización de la solicitud'), p_actor);
  END IF;

  ok := true;
  new_status := v_status;
  changed := v_changed;
  refunded := v_refunded;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Avanza una solicitud de servicio. Única fuente de verdad de las transiciones (requested → in_progress → delivered, con cancelled desde las dos primeras). Sella timestamps, escribe en redemption_events y, al cancelar antes de entregar, devuelve los créditos al monedero. Idempotente: repetir el estado actual devuelve ok=true con changed=false y no escribe nada.';

-- ============================================================
-- ACL — el DROP se llevó los privilegios; se vuelven a otorgar.
-- ============================================================

REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- GUARDAS
-- ============================================================

DO $$
BEGIN
  -- El ACL se re-otorgó de verdad (un DROP + CREATE lo deja abierto por
  -- defecto si alguien olvida el REVOKE).
  IF has_function_privilege('anon', 'public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Guard: advance_redemption quedó ejecutable por anon/authenticated';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.advance_redemption(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Guard: service_role perdió EXECUTE sobre advance_redemption';
  END IF;

  -- RETURNS TABLE sin RETURN NEXT devuelve 0 filas (defecto que 00149 arregló
  -- en redeem_service): el llamador vería un fallo después de mover dinero.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'advance_redemption'
      AND p.prosrc ~* '\mRETURN[[:space:]]+NEXT\M'
  ) THEN
    RAISE EXCEPTION 'Guard: advance_redemption no emite fila (RETURN NEXT ausente)';
  END IF;

  -- `changed` debe existir en el tipo de retorno.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'advance_redemption'
      AND pg_get_function_result(p.oid) LIKE '%changed%'
  ) THEN
    RAISE EXCEPTION 'Guard: advance_redemption perdió el campo changed';
  END IF;
END;
$$;
