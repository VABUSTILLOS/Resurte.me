-- ===========================================================================
-- 00181 — Arreglo de `foodos_restaurant_review()`: COALESCE/NULLIF cualificados
-- ===========================================================================
--
-- SÍNTOMA
--   La única puerta a `status = 'active'` de FoodOS no se podía cruzar nunca.
--   `POST /rest/v1/rpc/foodos_restaurant_review` devolvía, con el service_role:
--       HTTP 404  {"code":"42883",
--                  "message":"function pg_catalog.coalesce(text, unknown) does not exist"}
--   Es decir: la pantalla de moderación de `/admin/foodos/restaurantes` estaba
--   construida sobre una función que fallaba el 100 % de las veces. Publicar un
--   restaurante era imposible por cualquier vía.
--
-- CAUSA RAÍZ
--   `COALESCE`, `NULLIF`, `GREATEST` y `LEAST` NO son funciones de `pg_catalog`:
--   son construcciones de la gramática SQL (`CoalesceExpr`, `NullIfExpr`). Se
--   resuelven al analizar la consulta, sin búsqueda de nombres, así que
--   cualificarlas con un esquema las convierte en una llamada a una función
--   inexistente. Medido en este proyecto:
--       pg_catalog.btrim(text)      -> btrim(text)      (existe)
--       pg_catalog.lower(text)      -> lower(text)      (existe)
--       pg_catalog.now()            -> now()            (existe)
--       pg_catalog.coalesce(text,text) -> NO_EXISTE
--       pg_catalog.nullif(text,text)   -> NO_EXISTE
--       pg_catalog.greatest(text,text) -> NO_EXISTE
--       pg_catalog.least(text,text)    -> NO_EXISTE
--       INVOCAR pg_catalog.coalesce -> 42883
--       INVOCAR pg_catalog.nullif   -> 42883
--
--   `00168` escribió su bloque DECLARE con la regla «con `search_path = ''`, todo
--   se cualifica» llevada un paso de más: cualificó también la sintaxis. Las dos
--   primeras sentencias del DECLARE son las que fallan, y fallan ANTES de la
--   comprobación de administrador, así que el error que veía el cliente no tenía
--   nada que ver con la regla que se estaba protegiendo.
--
-- POR QUÉ NINGUNA GUARDA LO DETECTÓ (la lección)
--   Las 7 guardas de `00168` comprobaban EXISTENCIA (`to_regprocedure`),
--   PRIVILEGIOS (`has_function_privilege`) y la forma del trigger. Ninguna
--   INVOCABA la función. Una guarda que sólo pregunta «¿está ahí?» no distingue
--   «está bien» de «está roto». Este archivo cierra ese hueco con dos sondas
--   funcionales que llaman a la RPC de verdad.
--
-- ARREGLO
--   `coalesce(...)` y `nullif(...)` sin cualificar. Al ser gramática, funcionan
--   con `search_path = ''` igual que `CASE`. Todo lo demás se conserva: la
--   función queda idéntica a la de `00168` salvo esas dos expresiones.
--
-- NOTA PARA UN `db reset`
--   `00168` se deja intacto a propósito: es historia aplicada y el replay
--   `00168` → `00181` produce el estado correcto. No reintroduzcas su bloque
--   DECLARE tal cual en una migración nueva.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.foodos_restaurant_review(
  p_restaurant_id UUID,
  p_decision      TEXT,
  p_reason        TEXT,
  p_actor         UUID
)
RETURNS public.foodos_restaurants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- COALESCE y NULLIF son gramática, no funciones: NO se cualifican. Hacerlo
  -- produce 42883 y rompe la función entera antes de mirar quién llama.
  v_decision   TEXT := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason     TEXT := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_restaurant public.foodos_restaurants;
  v_branches   INTEGER;
  v_items      INTEGER;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Sólo un administrador puede revisar un restaurante.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.foodos_restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante % no existe.', p_restaurant_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_decision = 'approve' THEN
    IF v_restaurant.status NOT IN ('pending_review', 'paused') THEN
      RAISE EXCEPTION
        'No se puede aprobar un restaurante en estado «%»: sólo desde «pending_review» o «paused».',
        v_restaurant.status;
    END IF;

    SELECT count(*) INTO v_branches FROM public.foodos_branches    WHERE restaurant_id = p_restaurant_id;
    SELECT count(*) INTO v_items    FROM public.foodos_menu_items  WHERE restaurant_id = p_restaurant_id;

    -- Sólo los platillos bloquean. Una página sin un solo platillo no es un
    -- restaurante, es una promesa. Las sucursales se informan en el mensaje y
    -- se ven en la cola; el admin decide.
    IF v_items = 0 THEN
      RAISE EXCEPTION
        'No se puede publicar: el restaurante no tiene ningún platillo. Publicarlo dejaría una página vacía en el marketplace (sucursales: %).',
        v_branches;
    END IF;

    UPDATE public.foodos_restaurants
       SET status      = 'active',
           review_note = v_reason,
           reviewed_at = pg_catalog.now(),
           reviewed_by = p_actor,
           updated_at  = pg_catalog.now()
     WHERE id = p_restaurant_id
     RETURNING * INTO v_restaurant;

  ELSIF v_decision = 'reject' THEN
    IF v_restaurant.status <> 'pending_review' THEN
      RAISE EXCEPTION
        'Sólo se puede rechazar una solicitud pendiente (estado actual «%»).',
        v_restaurant.status;
    END IF;
    -- Un rechazo sin motivo deja al dueño sin nada que arreglar. Es la
    -- diferencia entre moderar y cerrar la puerta.
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Un rechazo necesita un motivo: es lo único que el dueño va a leer.';
    END IF;

    UPDATE public.foodos_restaurants
       SET status      = 'draft',
           review_note = v_reason,
           reviewed_at = pg_catalog.now(),
           reviewed_by = p_actor,
           updated_at  = pg_catalog.now()
     WHERE id = p_restaurant_id
     RETURNING * INTO v_restaurant;

  ELSIF v_decision = 'suspend' THEN
    IF v_restaurant.status <> 'active' THEN
      RAISE EXCEPTION
        'Sólo se puede suspender un restaurante publicado (estado actual «%»).',
        v_restaurant.status;
    END IF;

    UPDATE public.foodos_restaurants
       SET status      = 'paused',
           review_note = v_reason,
           reviewed_at = pg_catalog.now(),
           reviewed_by = p_actor,
           updated_at  = pg_catalog.now()
     WHERE id = p_restaurant_id
     RETURNING * INTO v_restaurant;

  ELSE
    RAISE EXCEPTION
      'Decisión desconocida: «%». Usa approve, reject o suspend.', p_decision;
  END IF;

  RETURN v_restaurant;
END;
$$;

COMMENT ON FUNCTION public.foodos_restaurant_review(UUID, TEXT, TEXT, UUID) IS
  'Decide la publicación de un restaurante FoodOS. Único camino a status = active.';

-- ---------------------------------------------------------------------------
-- Privilegios: `CREATE OR REPLACE` conserva la ACL, pero se vuelve a afirmar
-- para que este archivo sea autosuficiente y para que un `db reset` no dependa
-- de que `00168` haya corrido bien.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.foodos_restaurant_review(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foodos_restaurant_review(UUID, TEXT, TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Autocomprobación — con dos sondas FUNCIONALES, que es lo que faltaba.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_bad     TEXT := '';
  v_src     TEXT;
  v_admin   UUID;
  v_dummy   UUID := '00000000-0000-0000-0000-0000000000ff';
  v_n_fns   INTEGER;
  v_estado  TEXT;
BEGIN
  -- 1. El texto de la función ya no cualifica sintaxis.
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = 'public.foodos_restaurant_review(uuid,text,text,uuid)'::regprocedure;

  IF v_src IS NULL THEN
    v_bad := v_bad || 'no se pudo leer el cuerpo de la función | ';
  ELSIF v_src ~* 'pg_catalog\.(coalesce|nullif|greatest|least)' THEN
    v_bad := v_bad || 'el cuerpo sigue cualificando sintaxis (coalesce/nullif/greatest/least) | ';
  END IF;

  -- 2. GUARDA DE CLASE: ninguna función de `public` puede cualificar sintaxis.
  --    Sin esto, el mismo error puede volver por otra migración y nadie lo vería
  --    hasta que un cliente lo ejecutara.
  SELECT count(*) INTO v_n_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~* 'pg_catalog\.(coalesce|nullif|greatest|least)';

  IF v_n_fns > 0 THEN
    v_bad := v_bad || 'hay ' || v_n_fns || ' función(es) en public que cualifican sintaxis | ';
  END IF;

  -- 3. ANTI-VACUIDAD: si el barrido no ve ninguna función, la guarda 2 mide el
  --    vacío y no prueba nada.
  SELECT count(*) INTO v_n_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f';

  IF v_n_fns < 20 THEN
    v_bad := v_bad || 'el barrido sólo ve ' || v_n_fns || ' funciones: la guarda 2 no prueba nada | ';
  END IF;

  -- 4. SONDA FUNCIONAL A — la que habría cazado el bug.
  --    Un actor NULL tiene que salir con 42501 (la comprobación de admin). Si el
  --    DECLARE estuviera roto, el 42883 ocurriría ANTES y veríamos otro código.
  --    Es de sólo lectura: se aborta antes de cualquier UPDATE.
  BEGIN
    PERFORM public.foodos_restaurant_review(v_dummy, 'approve', NULL, NULL);
    v_bad := v_bad || 'la sonda A no abortó (un actor NULL no puede revisar) | ';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        v_bad := v_bad || 'la sonda A devolvió ' || SQLSTATE || ' en vez de 42501 (' || SQLERRM || ') | ';
      END IF;
  END;

  -- 5. SONDA FUNCIONAL B — con un admin real y un restaurante inexistente.
  --    Recorre DECLARE + comprobación de admin + SELECT ... FOR UPDATE y muere en
  --    P0002 sin escribir nada.
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE NOTICE '00181: no hay ningún admin en producción; la sonda B se omite.';
  ELSE
    BEGIN
      PERFORM public.foodos_restaurant_review(v_dummy, 'approve', '  motivo  ', v_admin);
      v_bad := v_bad || 'la sonda B no abortó con un restaurante inexistente | ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLSTATE <> 'P0002' THEN
          v_bad := v_bad || 'la sonda B devolvió ' || SQLSTATE || ' en vez de P0002 (' || SQLERRM || ') | ';
        END IF;
    END;

    -- 6. SONDA FUNCIONAL C — llega hasta la rama ELSE, que es la que demuestra
    --    que `v_decision`/`v_reason` se calcularon de verdad (incluido el NULLIF).
    SELECT status INTO v_estado
    FROM public.foodos_restaurants ORDER BY created_at LIMIT 1;

    IF v_estado IS NOT NULL THEN
      BEGIN
        PERFORM public.foodos_restaurant_review(
          (SELECT id FROM public.foodos_restaurants ORDER BY created_at LIMIT 1),
          'zz_decision_inventada', '   ', v_admin);
        v_bad := v_bad || 'la sonda C no abortó con una decisión inventada | ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLSTATE <> 'P0001' OR SQLERRM NOT LIKE '%Decisión desconocida%' THEN
            v_bad := v_bad || 'la sonda C devolvió ' || SQLSTATE || ': ' || SQLERRM || ' | ';
          END IF;
      END;
    END IF;
  END IF;

  -- 7. Privilegios: el cliente no puede llamarla, el service_role sí.
  IF has_function_privilege('anon', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE') THEN
    v_bad := v_bad || 'la función quedó ejecutable por el cliente | ';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE') THEN
    v_bad := v_bad || 'el service_role perdió EXECUTE | ';
  END IF;

  -- 8. Lo que 00168 montó sigue en pie.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.foodos_restaurants'::regclass
      AND tgname = 'foodos_restaurant_moderation_guard' AND NOT tgisinternal
  ) THEN
    v_bad := v_bad || 'el trigger de moderación desapareció | ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.foodos_restaurants'::regclass
      AND conname = 'foodos_restaurants_status_check'
  ) THEN
    v_bad := v_bad || 'la restricción de status desapareció | ';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'VALIDACION 00181 FALLÓ: %', v_bad;
  END IF;

  RAISE NOTICE 'VALIDACION 00181 OK — foodos_restaurant_review() se puede invocar: sondas A/B/C pasaron.';
END $guard$;
