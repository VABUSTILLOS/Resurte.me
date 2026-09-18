-- 00164_panel_entries_conflict_safe.sql
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- ==========================
-- `00055_panel_entries.sql` documenta que "un (dueño, tool, collection_slug)
-- tiene A LO SUMO una fila" y que el PUT hace delete + insert. Las dos
-- afirmaciones eran aspiracionales, no garantizadas:
--
--  1. NO existía ningún índice único sobre (dueño, tool, collection_slug),
--     así que "a lo sumo una fila" era falso en cuanto dos peticiones se
--     solapaban. El PUT del route hacía `.delete()` y luego `.insert()` en
--     DOS viajes de red independientes: dos escrituras concurrentes podían
--     borrar las dos y luego insertar las dos → dos filas para la misma
--     clave. El GET lo tapaba con `.order("created_at").limit(1)`, que lee
--     una fila arbitraria de las dos.
--
--  2. El PUT era replace-all sin ninguna comprobación de versión: el
--     cliente subía el valor completo calculado sobre una base que podía
--     estar obsoleta. Con dos dispositivos (dos cajeros, dos tablets) eso
--     pierde trabajo en silencio. La secuencia real:
--       t=0ms   Tablet A edita una línea      → push programado a t=800ms
--       t=400ms Tablet B edita OTRA línea     → push, servidor = V_B
--       t=800ms Tablet A sube V_A (calculada antes de V_B)
--               → servidor = V_A: el cambio de B desaparece
--       Tablet B recibe el evento Realtime, aplica V_A y su usuario ve
--       su propia edición revertirse. No es solo silencioso: parece un bug.
--
-- ESTE ARCHIVO CIERRA LAS DOS COSAS:
--   A. Índices únicos parciales → la unicidad deja de ser una promesa.
--   B. `panel_entry_put(...)`: upsert ATÓMICO con precondición de versión.
--      Si la versión base que manda el cliente no es la vigente, NO
--      escribe: devuelve `applied = false` junto con el valor vigente.
--      El cliente hace merge (src/lib/panel-merge.ts) y reintenta con la
--      versión fresca. Así ninguna de las dos partes pierde lo que la otra
--      tenía, y un conflicto real se puede anunciar en vez de sobrescribir.
--
-- `use-synced-rows.ts` (tabla `panel_rows`) NO necesita esto: ya manda
-- cada entidad como fila con `client_id` idempotente y diffea por id.
-- El problema es específico de `panel_entries`, que guarda el valor
-- completo de la clave.
--
-- Idempotente: se puede volver a aplicar sin efecto (dedupe no-op,
-- CREATE UNIQUE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Dedupe previo. Necesario para poder crear el índice único si algún
--    entorno ya acumuló filas duplicadas por la carrera del delete+insert.
--    Sobrevive la fila con `updated_at` más reciente; a igualdad de
--    `updated_at` (mismo instante), la de `created_at` más reciente, y si
--    tampoco, la de `id` mayor — para que el resultado sea determinista y
--    el script repetible.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, guest_token, tool, collection_slug
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.panel_entries
)
DELETE FROM public.panel_entries p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Unicidad real. Índices PARCIALES porque `user_id` y `guest_token` son
--    mutuamente excluyentes y nullables: un índice único total sobre
--    (user_id, tool, collection_slug) no serviría, porque en Postgres los
--    NULL no colisionan entre sí y las filas de invitado (user_id NULL)
--    quedarían todas fuera de la restricción.
--    Estos dos índices hacen que el `ON CONFLICT` del RPC sea inferible.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_panel_entries_user
  ON public.panel_entries (user_id, tool, collection_slug)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_panel_entries_guest
  ON public.panel_entries (guest_token, tool, collection_slug)
  WHERE guest_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. El PUT atómico con precondición de versión.
--
--    `p_base_updated_at` es la versión que el cliente cree vigente (la que
--    le devolvió el GET o el PUT anterior). NULL = "no comprobar" (primer
--    push de una clave, o migración desde localStorage-only): en ese caso
--    escribe sin más, que es el comportamiento histórico.
--
--    OJO con la serialización: la comparación es de igualdad exacta sobre
--    `timestamptz`, que en Postgres tiene precisión de microsegundo. Quien
--    llame a esta función debe pasar la cadena que devolvió el servidor
--    TAL CUAL. Reconstruirla con `new Date(x).toISOString()` la trunca a
--    milisegundos y la comparación falla siempre → conflicto perpetuo.
--
--    `clock_timestamp()` y no `now()`: `now()` es constante dentro de una
--    transacción, así que dos escrituras en la misma transacción (o dos
--    push seguidos del mismo cliente antes del commit) recibirían la misma
--    versión y la segunda pasaría la precondición de la primera.
--
--    SECURITY DEFINER + EXECUTE solo a `service_role`: la ruta usa el
--    cliente de servicio y es la única que valida `canWriteEntry` y el
--    tamaño del payload. Exponerla a `anon`/`authenticated` daría una vía
--    de escritura que se salta esas comprobaciones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.panel_entry_put(
  p_user_id UUID,
  p_guest_token UUID,
  p_tool TEXT,
  p_collection TEXT,
  p_payload JSONB,
  p_base_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (applied BOOLEAN, value JSONB, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_row public.panel_entries%ROWTYPE;
  v_n INTEGER;
BEGIN
  -- Exactamente un dueño. Sin esto, un llamador con los dos NULL podría
  -- escribir filas que no cumplen `panel_entries_owner_chk` (que lo
  -- rechazaría igual, pero con un error de constraint en vez de uno claro).
  IF (p_user_id IS NULL) = (p_guest_token IS NULL) THEN
    RAISE EXCEPTION 'panel_entry_put: se requiere exactamente uno de p_user_id / p_guest_token'
      USING ERRCODE = '22023';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.panel_entries (user_id, guest_token, tool, collection_slug, payload, updated_at)
    VALUES (p_user_id, NULL, p_tool, p_collection, p_payload, v_now)
    ON CONFLICT (user_id, tool, collection_slug) WHERE user_id IS NOT NULL
    DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = v_now
     WHERE p_base_updated_at IS NULL
        OR panel_entries.updated_at = p_base_updated_at;
  ELSE
    INSERT INTO public.panel_entries (user_id, guest_token, tool, collection_slug, payload, updated_at)
    VALUES (NULL, p_guest_token, p_tool, p_collection, p_payload, v_now)
    ON CONFLICT (guest_token, tool, collection_slug) WHERE guest_token IS NOT NULL
    DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = v_now
     WHERE p_base_updated_at IS NULL
        OR panel_entries.updated_at = p_base_updated_at;
  END IF;

  -- ROW_COUNT > 0 ⟺ se insertó o se actualizó. Si la precondición del
  -- DO UPDATE no se cumplió, la fila se descarta y ROW_COUNT es 0.
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RETURN QUERY SELECT TRUE, p_payload, v_now;
    RETURN;
  END IF;

  -- Conflicto: devolver la fila vigente para que el cliente pueda hacer merge.
  SELECT * INTO v_row
    FROM public.panel_entries pe
   WHERE pe.tool = p_tool
     AND pe.collection_slug = p_collection
     AND ((p_user_id IS NOT NULL AND pe.user_id = p_user_id)
       OR (p_guest_token IS NOT NULL AND pe.guest_token = p_guest_token))
   LIMIT 1;

  IF NOT FOUND THEN
    -- La fila desapareció entre el INSERT y este SELECT (borrado
    -- concurrente). No hay versión vigente que devolver; el llamador debe
    -- reintentar sin precondición.
    RETURN QUERY SELECT FALSE, NULL::JSONB, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, v_row.payload, v_row.updated_at;
END;
$fn$;

REVOKE ALL ON FUNCTION public.panel_entry_put(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.panel_entry_put(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.panel_entry_put(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) IS
  'Upsert atómico de panel_entries con precondición de versión. applied=false + valor vigente cuando p_base_updated_at no coincide: el cliente hace merge y reintenta (ver src/lib/panel-merge.ts). Solo service_role.';

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. Autocomprobación. Falla el archivo entero si el esquema no quedó como
--    se describe arriba. Usa el mismo truco que 00160/00162: acumula un
--    log en TEXT y lo lanza con RAISE EXCEPTION (dentro de un DO, así que
--    no deja rastro si pasa).
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_n INTEGER;
  v_r TEXT := '';
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'panel_entries'
     AND indexname = 'uq_panel_entries_user';
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK uq_panel_entries_user' ELSE 'FALTA uq_panel_entries_user' END || E'\n';

  SELECT count(*) INTO v_n
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'panel_entries'
     AND indexname = 'uq_panel_entries_guest';
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK uq_panel_entries_guest' ELSE 'FALTA uq_panel_entries_guest' END || E'\n';

  SELECT count(*) INTO v_n
    FROM pg_index
    JOIN pg_class c ON c.oid = pg_index.indexrelid
   WHERE c.relname = 'uq_panel_entries_user' AND pg_index.indisunique;
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK user es UNIQUE' ELSE 'FALLO user no es UNIQUE' END || E'\n';

  SELECT count(*) INTO v_n
    FROM pg_index
    JOIN pg_class c ON c.oid = pg_index.indexrelid
   WHERE c.relname = 'uq_panel_entries_guest' AND pg_index.indisunique;
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK guest es UNIQUE' ELSE 'FALLO guest no es UNIQUE' END || E'\n';

  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'panel_entry_put';
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK panel_entry_put existe' ELSE 'FALTA panel_entry_put' END || E'\n';

  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'panel_entry_put' AND p.prosecdef;
  v_r := v_r || CASE WHEN v_n = 1 THEN 'OK panel_entry_put es SECURITY DEFINER' ELSE 'FALLO panel_entry_put no es SECURITY DEFINER' END || E'\n';

  SELECT count(*) INTO v_n
    FROM (SELECT 1 FROM public.panel_entries
           GROUP BY user_id, guest_token, tool, collection_slug
          HAVING count(*) > 1) d;
  v_r := v_r || CASE WHEN v_n = 0 THEN 'OK sin duplicados' ELSE 'FALLO quedan ' || v_n || ' claves duplicadas' END || E'\n';

  IF v_r LIKE '%FALTA%' OR v_r LIKE '%FALLO%' THEN
    RAISE EXCEPTION E'AUTocomprobación 00164:\n%', v_r;
  END IF;
END;
$guard$;
