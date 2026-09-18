-- ===========================================================================
-- 00168 — Moderación de restaurantes FoodOS (E.3)
-- ===========================================================================
--
-- EL DEFECTO QUE CIERRA
--
-- `foodos_restaurants.status` es la única puerta del micrositio público
-- `/r/[slug]`: la política "Public restaurants" expone `status = 'active'` y
-- `fetchPublicRestaurantBySlug` filtra por lo mismo. Publicar es, por tanto,
-- exactamente escribir `status = 'active'`.
--
-- Y hasta este archivo eso lo podía hacer el dueño con un solo PATCH:
--
--   * `00023_foodos.sql:181` crea la política
--     `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
--   * `00160_foodos_restaurant_column_privileges.sql:70` incluye `status` en la
--     lista blanca de columnas que `authenticated` puede actualizar, y su guarda
--     (línea 127) *exige* que siga ahí.
--   * `setRestaurantStatus` (`src/app/panel/foodos/actions.ts:261`) alternaba
--     `active` ↔ `paused` sin más.
--
-- Es decir: cualquiera con una cuenta podía poner un restaurante en el
-- marketplace público sin que Resurte.me lo hubiera visto nunca. No es un
-- agujero de datos —no se filtra nada— sino de **control editorial**: la
-- portada pública y el marketplace aceptaban contenido que nadie revisó, con
-- el nombre, las fotos y los precios que el dueño quisiera, y con el aval
-- implícito de aparecer en el catálogo.
--
-- LA MÁQUINA DE ESTADOS
--
--   draft ──(dueño: solicita)──▶ pending_review ──(admin: aprueba)──▶ active
--     ▲                                │                                │
--     └──────(admin: rechaza)──────────┘      (dueño o admin)──▶ paused ─┘
--                                                                   │
--                                              (dueño: re-solicita)──┘
--
-- `draft` y `pending_review` y `paused` NO son públicos. `active` sí.
--
-- LA REGLA, EN UNA LÍNEA
--
--   **Sólo un administrador puede poner `status = 'active'`.**
--
-- Y como el estado no se puede mover sin motivo, un rechazo **exige** un
-- motivo escrito: es lo único que el dueño va a leer, y sin él la moderación
-- es una puerta cerrada sin timbre.
--
-- POR QUÉ UN TRIGGER Y NO UN `REVOKE UPDATE (status)`
--
-- Quitarle al dueño el privilegio de columna sobre `status` obligaría a un RPC
-- para cada transición suya (solicitar, retirar, pausar), y `00160` congeló
-- justamente lo contrario: su guarda exige que `status` siga siendo escribible
-- por `authenticated`. Además el privilegio no bastaría: `is_admin()` lee
-- `profiles.role`, y el dueño sigue siendo el dueño de su fila.
--
-- El trigger es la misma forma que `00162` usó para el autorreferido, y tiene
-- una ventaja decisiva: **un trigger BEFORE puede escribir columnas que el
-- invocador no tiene privilegio de tocar**. Eso es lo que permite sellar
-- `submitted_at` y limpiar el bloque de revisión en la misma sentencia del
-- dueño, sin concederle ni una columna más.
--
-- LO QUE NO SE TOCA Y POR QUÉ
--
--   1. La política "Owner manages restaurants" se queda como está. El dueño
--      sigue editando su restaurante entero; lo único que pierde es la llave
--      de publicación.
--   2. La lista blanca de `00160` se queda como está —incluido `status`—, para
--      no romper su guarda ni la de `00167`.
--   3. La política "Public restaurants" (`USING (status = 'active')`) no
--      cambia: sigue siendo la única lectura anónima y sigue siendo correcta.
--   4. No se concede a `anon`/`authenticated` ninguna de las tres columnas
--      nuevas (`review_note`, `reviewed_at`, `reviewed_by`): son el registro
--      de la decisión de Resurte.me, no un campo del dueño. Sin privilegio de
--      columna, ni siquiera se pueden nombrar en un PATCH.
--   5. `foodos_menu_items` y `foodos_branches` no se tocan. La precondición de
--      publicación (≥1 platillo) se comprueba en el RPC, no con un trigger
--      sobre las hijas: un restaurante ya publicado puede quedarse sin
--      platillos sin que eso lo despublique, y forzar lo contrario haría que
--      borrar un platillo tirara la página pública.
--
--      Las sucursales NO son una precondición, y la razón es la producción:
--      el único restaurante publicado ("Mr Fresh") está `active` con 0
--      sucursales y 1 platillo. Exigir una sucursal habría bloqueado una
--      situación que el producto ya acepta —y habría dejado a ese restaurante
--      imposible de re-aprobar si alguna vez se pausaba. La cola de moderación
--      devuelve el conteo de sucursales para que el admin lo vea y decida; una
--      precondición que contradice los datos reales no es rigor, es una
--      trampa.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas de revisión
-- ---------------------------------------------------------------------------
-- `submitted_at` es del dueño (lo sella el trigger); `review_*` son del admin.
ALTER TABLE public.foodos_restaurants
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note  TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.foodos_restaurants.submitted_at IS
  'Cuándo el dueño pidió la revisión. Lo sella el trigger, no el cliente.';
COMMENT ON COLUMN public.foodos_restaurants.review_note IS
  'Motivo de la última decisión. Sólo lo escribe foodos_restaurant_review().';
COMMENT ON COLUMN public.foodos_restaurants.reviewed_at IS
  'Cuándo se decidió. Sólo lo escribe foodos_restaurant_review().';
COMMENT ON COLUMN public.foodos_restaurants.reviewed_by IS
  'Quién decidió. Sólo lo escribe foodos_restaurant_review().';

-- ---------------------------------------------------------------------------
-- 2. El estado sólo puede ser uno de los cuatro
-- ---------------------------------------------------------------------------
-- Se añade `NOT VALID` a propósito: una fila histórica con un valor inesperado
-- no debe impedir que la migración se aplique. La restricción ya protege las
-- escrituras nuevas, y el bloque de abajo la valida sola en cuanto no quede
-- ninguna fila fuera de la lista. `ADD CONSTRAINT` no admite `IF NOT EXISTS`,
-- así que la idempotencia va por `pg_constraint`.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.foodos_restaurants'::regclass
      AND conname  = 'foodos_restaurants_status_check'
  ) THEN
    ALTER TABLE public.foodos_restaurants
      ADD CONSTRAINT foodos_restaurants_status_check
      CHECK (status IN ('draft', 'pending_review', 'active', 'paused'))
      NOT VALID;
  END IF;
END $constraint$;

DO $validate$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.foodos_restaurants
  WHERE status NOT IN ('draft', 'pending_review', 'active', 'paused');

  IF v_bad = 0 THEN
    ALTER TABLE public.foodos_restaurants
      VALIDATE CONSTRAINT foodos_restaurants_status_check;
  ELSE
    RAISE NOTICE
      'Quedan % restaurante(s) con un status fuera de la lista. La restricción queda NOT VALID (ya bloquea escrituras nuevas) y se validará sola en la próxima ejecución de esta migración.',
      v_bad;
  END IF;
END $validate$;

-- La cola de revisión se lee por estado y es pequeña; el índice parcial evita
-- que el ORDER BY recorra toda la tabla cuando haya miles de restaurantes.
CREATE INDEX IF NOT EXISTS idx_foodos_restaurants_pending_review
  ON public.foodos_restaurants (submitted_at)
  WHERE status = 'pending_review';

-- ---------------------------------------------------------------------------
-- 3. El guard: sólo un administrador publica
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foodos_restaurant_moderation_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_is_admin    BOOLEAN;
  v_resubmitted BOOLEAN := FALSE;
BEGIN
  -- Sello de la solicitud. Va ANTES del corte por falta de sesión para que
  -- también se selle cuando escribe el service_role (importaciones, soporte).
  --
  -- Al re-solicitar se borra el bloque de revisión anterior: si el motivo del
  -- rechazo se quedara pegado, el dueño vería "falta el menú" mientras espera
  -- una aprobación nueva y no sabría si ya lo arregló. Se marca
  -- `v_resubmitted` para que la comprobación de columnas de más abajo no
  -- confunda esta limpieza —que la hace el trigger— con una escritura del
  -- cliente.
  IF NEW.status = 'pending_review'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending_review') THEN
    NEW.submitted_at := pg_catalog.now();
    NEW.review_note  := NULL;
    NEW.reviewed_at  := NULL;
    NEW.reviewed_by  := NULL;
    v_resubmitted    := TRUE;
  END IF;

  -- Sin sesión de usuario (service_role, postgres, migraciones) este guard no
  -- opina. La ruta admin ya pasó por requireAdmin() y el RPC comprueba el
  -- actor contra `profiles.role`; aquí no hay `auth.uid()` contra el que
  -- comparar. Ojo: `auth.uid()` NO es NULL dentro de una función SECURITY
  -- DEFINER invocada por un usuario —sigue leyendo el JWT—, así que este corte
  -- no es un agujero: es el caso "no hay usuario".
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.is_admin();

  IF v_is_admin IS NOT TRUE THEN
    -- Publicar es una decisión de Resurte.me. Se permite editar un restaurante
    -- ya activo (la condición `IS DISTINCT FROM 'active'` deja pasar un UPDATE
    -- que no mueve el estado), pero no llegar a `active`.
    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
      RAISE EXCEPTION
        'Sólo un administrador puede publicar un restaurante. Solicita la revisión y quedará en «pending_review».'
        USING ERRCODE = '42501';
    END IF;

    -- Los campos de revisión son el registro de la decisión, no un campo del
    -- dueño. Se comparan contra OLD para no castigar un UPDATE que los deja
    -- como estaban (el cliente manda sólo las columnas que edita, pero un
    -- `select("*")` + `update(row)` completo también es legal).
    IF NOT v_resubmitted THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.review_note IS NOT NULL
           OR NEW.reviewed_at IS NOT NULL
           OR NEW.reviewed_by IS NOT NULL THEN
          RAISE EXCEPTION
            'Los campos de revisión los escribe Resurte.me, no el dueño.'
            USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.review_note IS DISTINCT FROM OLD.review_note
         OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
         OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
        RAISE EXCEPTION
          'Los campos de revisión los escribe Resurte.me, no el dueño.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foodos_restaurant_moderation_guard ON public.foodos_restaurants;
CREATE TRIGGER foodos_restaurant_moderation_guard
  BEFORE INSERT OR UPDATE ON public.foodos_restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.foodos_restaurant_moderation_guard();

-- ---------------------------------------------------------------------------
-- 4. La decisión del administrador
-- ---------------------------------------------------------------------------
-- `p_actor` viaja explícito porque el cliente de la ruta admin es el
-- service_role y `auth.uid()` sería NULL: la comprobación no puede ser
-- `is_admin()`. Es el mismo patrón que `record_foodos_payout` (00157).
--
-- La precondición de publicación (≥1 platillo) vive aquí y no en
-- el formulario porque un formulario no es una garantía: es la diferencia
-- entre aprobar un restaurante y publicar una página vacía.
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
  v_decision   TEXT := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_decision, '')));
  v_reason     TEXT := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_reason, '')), '');
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
-- 5. La cola de revisión, en una sola lectura
-- ---------------------------------------------------------------------------
-- Sin esto, la pantalla admin tendría que pedir los conteos de sucursales y
-- platillos restaurante por restaurante (N+1) para saber si aprobar tiene
-- sentido. Aquí se calculan en la misma consulta.
CREATE OR REPLACE FUNCTION public.foodos_review_queue()
RETURNS TABLE (
  restaurant_id UUID,
  name          TEXT,
  slug          TEXT,
  status        TEXT,
  owner_email   TEXT,
  branches      INTEGER,
  menu_items    INTEGER,
  submitted_at  TIMESTAMPTZ,
  review_note   TEXT,
  reviewed_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    r.id,
    r.name,
    r.slug,
    r.status,
    u.email::TEXT,
    (SELECT count(*)::INTEGER FROM public.foodos_branches   b WHERE b.restaurant_id = r.id),
    (SELECT count(*)::INTEGER FROM public.foodos_menu_items m WHERE m.restaurant_id = r.id),
    r.submitted_at,
    r.review_note,
    r.reviewed_at
  FROM public.foodos_restaurants r
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.status IN ('pending_review', 'active', 'paused')
     OR (r.status = 'draft' AND r.reviewed_at IS NOT NULL)
  ORDER BY (r.status = 'pending_review') DESC, r.submitted_at DESC NULLS LAST, r.updated_at DESC;
$$;

COMMENT ON FUNCTION public.foodos_review_queue() IS
  'Cola de moderación FoodOS con los conteos que deciden si un restaurante se puede publicar.';

-- ---------------------------------------------------------------------------
-- 6. Privilegios
-- ---------------------------------------------------------------------------
-- Ninguna de las dos funciones es para el cliente: las llama la ruta admin con
-- el service_role, que ya comprobó `requireAdmin()`. Sin estos REVOKE quedarían
-- ejecutables por `anon` y `authenticated` (el defecto de `pg_default_acl` que
-- cerró 00165, y el motivo de que este archivo lo repita).
REVOKE ALL ON FUNCTION public.foodos_restaurant_review(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_review_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_restaurant_moderation_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foodos_restaurant_review(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.foodos_review_queue() TO service_role;

-- Las columnas de revisión no se conceden a nadie más que al dueño de la tabla.
REVOKE UPDATE (review_note, reviewed_at, reviewed_by, submitted_at)
  ON public.foodos_restaurants FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. Autocomprobación
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Las tres funciones existen y son del tipo esperado.
  IF to_regprocedure('public.foodos_restaurant_review(uuid,text,text,uuid)') IS NULL THEN
    v_bad := v_bad || 'falta foodos_restaurant_review';
  END IF;
  IF to_regprocedure('public.foodos_review_queue()') IS NULL THEN
    v_bad := v_bad || 'falta foodos_review_queue';
  END IF;
  IF to_regprocedure('public.foodos_restaurant_moderation_guard()') IS NULL THEN
    v_bad := v_bad || 'falta el guard';
  END IF;

  -- 2. El trigger está armado, en INSERT y en UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.foodos_restaurants'::regclass
      AND tgname  = 'foodos_restaurant_moderation_guard'
      AND NOT tgisinternal
  ) THEN
    v_bad := v_bad || 'el trigger no está armado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.foodos_restaurants'::regclass
      AND tgname  = 'foodos_restaurant_moderation_guard'
      AND (tgtype & 4) = 4      -- INSERT
      AND (tgtype & 16) = 16    -- UPDATE
  ) THEN
    v_bad := v_bad || 'el trigger no cubre INSERT + UPDATE';
  END IF;

  -- 3. El estado no puede salirse de la lista.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.foodos_restaurants'::regclass
      AND conname  = 'foodos_restaurants_status_check'
  ) THEN
    v_bad := v_bad || 'falta la restricción de status';
  END IF;

  -- 4. Las columnas de revisión NO son escribibles por el cliente.
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'review_note', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.foodos_restaurants', 'reviewed_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.foodos_restaurants', 'reviewed_by', 'UPDATE') THEN
    v_bad := v_bad || 'las columnas de revisión quedaron escribibles por authenticated';
  END IF;

  -- 5. El dueño NO perdió lo que sí debe poder hacer: `00160` exige que
  --    `status` siga siendo actualizable, y su guarda abortaría si no lo fuera.
  IF NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'status', 'UPDATE') THEN
    v_bad := v_bad || 'el dueño perdió UPDATE(status) y 00160 abortaría';
  END IF;

  -- 6. Ni una de las dos funciones nuevas quedó ejecutable por el cliente.
  IF has_function_privilege('anon', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE') THEN
    v_bad := v_bad || 'foodos_restaurant_review quedó ejecutable por el cliente';
  END IF;
  IF has_function_privilege('anon', 'public.foodos_review_queue()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.foodos_review_queue()', 'EXECUTE') THEN
    v_bad := v_bad || 'foodos_review_queue quedó ejecutable por el cliente';
  END IF;

  -- 7. El service_role sí puede llamarlas (la ruta admin depende de eso).
  IF NOT has_function_privilege('service_role', 'public.foodos_restaurant_review(uuid,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.foodos_review_queue()', 'EXECUTE') THEN
    v_bad := v_bad || 'el service_role no puede llamar las funciones nuevas';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'VALIDACION 00168 FALLÓ: %', array_to_string(v_bad, ' | ');
  END IF;

  RAISE NOTICE 'VALIDACION 00168 OK — moderación FoodOS activa: sólo un admin publica.';
END $guard$;
