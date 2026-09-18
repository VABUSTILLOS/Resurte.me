-- ============================================================
-- 00167 — RLS: `email_logs` sin RLS y tres políticas de WhatsApp
--         incondicionales para `anon`.
--
-- Cierra los agujeros que dejó el barrido de RLS sobre las 110 tablas de
-- `public`. Los dos primeros eran **explotables ahora mismo** con la llave
-- publicable, la que viaja en el bundle del navegador; el tercero sólo se
-- dispara en un entorno reconstruido desde las migraciones.
--
-- ------------------------------------------------------------
-- Hallazgo 1 — `email_logs` con RLS apagado (CRÍTICO)
-- ------------------------------------------------------------
-- `email_logs` es la única tabla de la aplicación (no de PostGIS) con
-- `relrowsecurity = false`. Su `relacl` era
--
--   {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- Es decir: sin RLS y con `arwdDxtm` (SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) para `anon`. En un esquema
-- expuesto a PostgREST, "sin RLS" significa "sin gate": los privilegios de
-- tabla son el único control, y estaban concedidos.
--
-- Verificado contra producción (sólo conteos, sin leer datos):
--   POST /rest/v1/email_logs {} → HTTP 400, `23502 null value in column
--   "email_to"`. La petición **pasó el gate de RLS/privilegios** y sólo la
--   frenó el NOT NULL. Si el gate la hubiera rechazado, el código habría sido
--   `42501`.
--
-- Qué exponía: `email_to` (correos de clientes), `user_id`, `order_id` y
-- `metadata`. Y, más grave que la lectura, la **escritura**: `email_logs` es
-- el ledger de deduplicación de `order-emails.ts` y `email-workflows.ts`
-- (dedupe por `order_id` + `email_type`). Un anónimo podía
--
--   * insertar filas falsas para **suprimir** correos legítimos (el dedupe
--     cree que ya se enviaron), y
--   * borrar filas para **provocar reenvíos** de correos transaccionales.
--
-- No es una fuga hipotética: es un amplificador de spam y una forma de
-- silenciar avisos de pedido.
--
-- Por qué se apagó: el RLS nunca se activó en la migración que la creó, y el
-- `ALTER DEFAULT PRIVILEGES` de la relación le puso `arwdDxtm` a `anon` y
-- `authenticated` al nacer (ver 00166: se corrigió el default ACL de
-- **funciones**, no el de tablas — y el de tablas **no se debe tocar**, ver
-- "Decisión" abajo).
--
-- ------------------------------------------------------------
-- Hallazgo 2 — tres políticas incondicionales para `anon` (CRÍTICO)
-- ------------------------------------------------------------
-- `whatsapp_messages`, `whatsapp_automations` y `whatsapp_templates` tienen
-- RLS **encendido**, y por eso se habían dado por buenas. Pero cada una tenía
-- **una sola** política, con el nombre delator:
--
--   tabla                  política                                cmd  roles     qual   with_check
--   whatsapp_messages      "Messages managed by service role"      ALL  {public}  true   (null)
--   whatsapp_automations   "Automations managed by service role"   ALL  {public}  true   (null)
--   whatsapp_templates     "Templates managed by service role"     ALL  {public}  true   (null)
--
-- El autor quiso escribir `TO service_role` y omitió el `TO`. Sin `TO`, la
-- política aplica a `PUBLIC` — que incluye a `anon`. Y con `qual = true` y
-- `with_check` nulo, PostgreSQL usa `qual` también como `WITH CHECK`: la
-- política es `USING (true) WITH CHECK (true)` para todo el mundo.
--
-- "RLS encendido" no es la garantía; **la garantía es que las políticas
-- restrinjan**. Una política incondicional sobre una tabla con `arwdDxtm` para
-- `anon` es equivalente a no tener RLS.
--
-- Verificado contra producción (sólo conteos y un INSERT no destructivo):
--   GET  /rest/v1/whatsapp_messages?select=id&limit=0    → 206, Content-Range */54
--   GET  /rest/v1/whatsapp_automations?select=id&limit=0 → 206, Content-Range */6
--   POST /rest/v1/whatsapp_messages {} → HTTP 400, `23502 null value in column
--        "from_number"`  → la inserción pasó el gate y sólo la frenó el NOT NULL.
--
-- Qué exponía `whatsapp_messages` (54 filas): `from_number` y `from_digits`
-- (teléfonos de clientes), `content` (cuerpo de los mensajes), `order_id`,
-- `product_id`. `whatsapp_automations` (6 filas) expone `config`, que es
-- jsonb libre. `whatsapp_templates` estaba vacía (0 filas) pero igual de
-- escribible.
--
-- ------------------------------------------------------------
-- Hallazgo 3 — cuatro tablas con RLS fuera del control de versiones
-- ------------------------------------------------------------
-- `bump_rules`, `bump_affinity`, `leads` y `order_upsells` tienen RLS
-- **encendido en producción** (y cero políticas, así que hoy son deny-all y no
-- filtran nada)… pero **ninguna migración lo enciende**. Su RLS se activó fuera
-- de banda, a mano.
--
-- Eso significa que el estado de producción **no es reproducible**: en un
-- entorno reconstruido desde las migraciones —`supabase db reset`, un staging
-- nuevo, una restauración tras un desastre— las cuatro nacen con RLS apagado y
-- con el `anon=arwdDxtm` heredado del default ACL. Es exactamente el agujero
-- de `email_logs` (hallazgo 1), pero diferido: no se ve en producción, se ve
-- cuando más duele.
--
-- El hallazgo salió de comparar el texto de las 110 migraciones contra el
-- catálogo de producción. Es la razón de que el invariante quede congelado en
-- un contract test estático (`src/lib/rls-coverage.contract.test.ts`): si una
-- migración futura crea una tabla y no enciende su RLS, el test falla en CI,
-- no en el próximo `db reset`.
--
-- ------------------------------------------------------------
-- La reparación
-- ------------------------------------------------------------
-- (A) `email_logs`: encender RLS y revocar todo a los roles de cliente.
--     Sin políticas ⇒ deny-all para `anon`/`authenticated`.
-- (B) Las tres políticas de WhatsApp: devolverles el `TO service_role` que
--     su nombre ya prometía, y revocar los privilegios de cliente.
-- (C) Barrido: quitar `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` de
--     todas las tablas de `public` a los roles de cliente.
-- (D) Las cuatro tablas del hallazgo 3: encender RLS en la migración, para
--     que el set de migraciones vuelva a ser la fuente de verdad.
--
-- **Nada de esto rompe la aplicación.** Barridos los 15 puntos de uso de las
-- cuatro tablas (`src/app/admin/actions.ts`, `src/lib/workflows.ts`,
-- `src/lib/crm-conversation.ts`, `src/lib/crm-sequences-engine.ts`,
-- `src/lib/whatsapp-automations-engine.ts`, `src/lib/order-emails.ts`,
-- `src/lib/email-workflows.ts`, `src/lib/reorder-reminders.ts`,
-- `src/app/api/whatsapp/*`, `src/app/api/admin/email-logs`, …): **todos** usan
-- `createServiceClient()`. Cero usan el cliente de navegador
-- (`src/lib/supabase/client.ts`). `service_role` tiene `BYPASSRLS`, así que no
-- le afecta ni el RLS ni el `REVOKE`.
--
-- ------------------------------------------------------------
-- Decisión — qué NO se toca, y por qué
-- ------------------------------------------------------------
-- 1. **No se revoca el default ACL de tablas.** Las 109 tablas restantes
--    conservan su `anon=arwdDxtm` heredado. Es vestigial (el RLS es el gate en
--    todas ellas, y el barrido lo confirmó tabla por tabla), pero es
--    **load-bearing**: `00160` y `00162` dependen del `GRANT` a nivel de tabla
--    para que sus `REVOKE UPDATE (columna)` tengan sentido, y `anon` necesita
--    escribir en los caminos de invitado (`foodos_orders`, `orders`,
--    `order_items`, `addresses`). Quitar el default ACL aquí rompería el
--    checkout de invitado y la lista blanca de columnas.
--    El control correcto es **RLS + políticas restrictivas**, no los grants.
--    Por eso el invariante queda congelado en
--    `src/lib/rls-coverage.contract.test.ts`, que falla si aparece una tabla
--    nueva sin `ENABLE ROW LEVEL SECURITY` o una política de escritura
--    incondicional para un rol de cliente.
-- 2. **No se revoca `INSERT`/`UPDATE`/`DELETE` a `anon` en las tablas con RLS
--    y cero políticas** (`leads`, `crm_*`, `whatsapp_sync_*`, `delivery_drivers`,
--    …). Esos grants son inertes hoy, así que revocarlos no gana seguridad
--    ahora, y sí crea una trampa: una migración futura que añada la política
--    esperando el grant heredado fallaría en silencio. Se deja como está y se
--    documenta.
-- 3. **No se fuerza RLS en `email_logs`** (`FORCE ROW LEVEL SECURITY`).
--    `FORCE` afectaría también al dueño (`postgres`), y `pg_dump` /
--    `supabase db diff` corren como `postgres` con `row_security = off`: un
--    volcado que toque `email_logs` abortaría con "query would be affected by
--    row-level security". No aporta protección contra los roles de cliente
--    (no son el dueño) y sí puede romper respaldos. Se deja sin forzar.
-- 4. **No hay `supabase/tests/*.sql`.** El proyecto no tiene ese directorio ni
--    `supabase test db` en CI. El invariante vive en
--    `src/lib/rls-coverage.contract.test.ts`, en el idioma que el repo ya usa
--    para sus 20+ contract tests estáticos.
--
-- ------------------------------------------------------------
-- Residual aceptado — `spatial_ref_sys`
-- ------------------------------------------------------------
-- `spatial_ref_sys` (catálogo SRID de PostGIS) tiene RLS apagado y
-- `anon=arwdDxtm`, igual que `email_logs`. **No se puede reparar desde una
-- migración**: su dueño y su grantor es `supabase_admin`, y el rol con el que
-- corren las migraciones (`postgres`) no es superusuario ni miembro de
-- `supabase_admin`:
--
--   pg_has_role('postgres','supabase_admin','MEMBER') → false
--   SET LOCAL ROLE supabase_admin                     → 42501
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY         → 42501 (no es el dueño)
--   REVOKE ... FROM anon                              → no-op **silencioso**
--
-- Ese último punto es el que engaña: el `REVOKE` no lanza error, sólo emite un
-- WARNING que el cliente no ve, y el privilegio sigue ahí. Por eso la guarda
-- de abajo **comprueba** el privilegio en vez de confiar en que el `REVOKE`
-- haya funcionado.
--
-- Impacto real: es integridad, no confidencialidad. Un anónimo podría
-- reescribir `proj4text`/`srtext` de un SRID y corromper las conversiones de
-- coordenadas (zonas de reparto). Riesgo bajo y acotado, pero real y no
-- nuestro. **Acción de seguimiento, fuera del alcance de una migración:**
-- pedir a Supabase soporte que revoque la escritura de `anon`/`authenticated`
-- sobre `public.spatial_ref_sys`, o confirmar que su endurecimiento de
-- plataforma ya lo cubre. Queda registrado en `docs/OPS.md`.
-- ============================================================

-- ------------------------------------------------------------
-- (A) `email_logs` — encender RLS y cerrar la tabla a los clientes.
-- ------------------------------------------------------------
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- No se vuelve a conceder nada a `anon` ni a `authenticated`, a propósito.
-- Los cinco consumidores usan el service role; si algún día hace falta que un
-- usuario autenticado lea su propio historial de correos, hay que añadir **la
-- política y el GRANT en la misma migración**, no reabrir la tabla entera.
REVOKE ALL ON TABLE public.email_logs FROM anon, authenticated;

-- ------------------------------------------------------------
-- (B) Las tres políticas incondicionales de WhatsApp.
-- ------------------------------------------------------------
-- `ALTER POLICY ... TO` conserva el nombre y la expresión y sólo corrige el
-- alcance: es exactamente el `TO service_role` que el nombre ya declaraba.
-- `service_role` tiene BYPASSRLS, así que el cambio es inerte para la
-- aplicación y deja el catálogo diciendo la verdad.
ALTER POLICY "Messages managed by service role"    ON public.whatsapp_messages    TO service_role;
ALTER POLICY "Automations managed by service role" ON public.whatsapp_automations TO service_role;
ALTER POLICY "Templates managed by service role"   ON public.whatsapp_templates   TO service_role;

REVOKE ALL ON TABLE public.whatsapp_messages    FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_automations FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_templates   FROM anon, authenticated;

-- ------------------------------------------------------------
-- (C) Barrido de privilegios de esquema en todas las tablas.
-- ------------------------------------------------------------
-- `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` no los necesita ningún rol
-- de cliente en ninguna tabla de esta aplicación: `TRUNCATE` es un borrado
-- total que **no dispara RLS** (por eso el default ACL lo hacía tan peligroso
-- y por eso no basta con "RLS encendido"), y los otros tres son de DDL.
-- Quitarlos es un no-op de comportamiento y elimina un riesgo latente.
--
-- `ON ALL TABLES` no falla en `spatial_ref_sys`: PostgreSQL emite un WARNING
-- por tabla y continúa. Es intencional que no abortemos aquí.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ------------------------------------------------------------
-- (D) Las cuatro tablas cuyo RLS vivía sólo en producción.
-- ------------------------------------------------------------
-- Idempotente: en producción no cambia nada (ya estaba encendido); en un
-- entorno reconstruido desde las migraciones es lo que evita que nazcan
-- expuestas. Se quedan **sin políticas**, igual que en producción: el único
-- canal de escritura es `service_role` desde una ruta de servidor.
ALTER TABLE public.bump_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bump_affinity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_upsells  ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Guardas: comprueban el **estado**, no que el DDL se haya ejecutado.
-- ------------------------------------------------------------
DO $guard$
DECLARE
  v_n     INTEGER;
  v_bad   TEXT;
  v_role  TEXT;
  v_cmd   TEXT;
  v_tabla TEXT;
BEGIN
  -- 1. `email_logs` con RLS encendido y sin forzar (ver Decisión #3).
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_logs'::regclass) THEN
    RAISE EXCEPTION 'email_logs sigue con RLS apagado';
  END IF;
  IF (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.email_logs'::regclass) THEN
    RAISE EXCEPTION 'email_logs quedó con FORCE RLS; rompería pg_dump (ver Decisión #3)';
  END IF;

  -- 2. Ningún rol de cliente conserva privilegio alguno sobre las cuatro
  --    tablas reparadas. `service_role` no se comprueba aquí porque tiene
  --    BYPASSRLS y conserva sus grants.
  FOREACH v_tabla IN ARRAY ARRAY[
    'email_logs', 'whatsapp_messages', 'whatsapp_automations', 'whatsapp_templates'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_cmd IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ] LOOP
        IF has_table_privilege(v_role, 'public.' || v_tabla, v_cmd) THEN
          RAISE EXCEPTION '% conserva % sobre %', v_role, v_cmd, v_tabla;
        END IF;
      END LOOP;
    END LOOP;

    -- El service role es el único escritor: si perdiera el acceso, la
    -- aplicación dejaría de enviar correos y de registrar WhatsApp.
    IF NOT has_table_privilege('service_role', 'public.' || v_tabla, 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.' || v_tabla, 'INSERT') THEN
      RAISE EXCEPTION 'service_role perdió SELECT/INSERT sobre %', v_tabla;
    END IF;
  END LOOP;

  -- 3. Las tres políticas ya no alcanzan a ningún rol de cliente.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('whatsapp_messages', 'whatsapp_automations', 'whatsapp_templates')
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'quedan % políticas visibles a roles de cliente en las tablas de WhatsApp', v_n;
  END IF;

  -- 4. La invariante de fondo: **ninguna** política de escritura de `public`
  --    puede ser incondicional para un rol de cliente. Éste es el detector de
  --    recurrencia del hallazgo 2; habría fallado con las tres políticas
  --    originales. Se exige expresión no trivial en `qual` y en `with_check`.
  SELECT string_agg(DISTINCT tablename || ' (' || policyname || ')', ', ' ORDER BY tablename || ' (' || policyname || ')')
    INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
     AND coalesce(qual, 'true') = 'true'
     AND (with_check IS NULL OR with_check = 'true');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'políticas de escritura incondicionales para roles de cliente: %', v_bad;
  END IF;

  -- 5. Canario. Las políticas de escritura con alcance de cliente son
  --    legítimas y numerosas (todas las `auth.uid()` del panel y del
  --    storefront). Si el conteo cae, la consulta de arriba dejó de mirar
  --    donde debe y su "0 hallazgos" sería un falso negativo.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n < 60 THEN
    RAISE EXCEPTION 'canario: sólo % políticas de escritura con alcance de cliente, se esperaban >= 60', v_n;
  END IF;

  -- 6. Residual documentado. Se informa, no se falla: no está en nuestras
  --    manos (ver el bloque "Residual aceptado" de la cabecera).
  IF has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT') THEN
    RAISE NOTICE '00167: residual aceptado — `anon` conserva escritura sobre public.spatial_ref_sys (dueño supabase_admin; no revocable desde migraciones).';
  ELSE
    RAISE NOTICE '00167: spatial_ref_sys ya no es escribible por `anon`; el residual quedó cerrado.';
  END IF;

  -- 7. Hallazgo 3: las cuatro tablas cuyo RLS vivía sólo en producción.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('bump_rules', 'bump_affinity', 'leads', 'order_upsells')
     AND NOT c.relrowsecurity;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'estas tablas quedaron sin RLS y no son reproducibles desde las migraciones: %', v_bad;
  END IF;

  RAISE NOTICE '00167: email_logs cerrado, 3 políticas de WhatsApp acotadas a service_role, 4 tablas recuperadas al control de versiones, barrido aplicado (% políticas de escritura de cliente revisadas).', v_n;
END $guard$;
