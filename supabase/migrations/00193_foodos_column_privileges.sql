-- ============================================================
-- 00193 — FoodOS: la comisión, el estado de Stripe y el costo del menú
--         dejan de ser públicos.
--
-- EL AGUJERO
-- ----------
-- Es el mismo defecto que `00192` cerró en `products`, en dos tablas más.
-- `foodos_restaurants` y `foodos_menu_items` tienen `GRANT SELECT` **a nivel
-- de tabla** para `anon` y `authenticated` (del `ALTER DEFAULT PRIVILEGES` de
-- Supabase, el mecanismo que documenta `00160`). Sus políticas RLS de lectura
-- filtran **filas** —`status = 'active'` para el restaurante,
-- `EXISTS (… r.status = 'active')` para sus platillos—, y RLS no filtra
-- columnas. Con la llave anónima que viaja en el navegador bastaba
--
--     GET /rest/v1/foodos_restaurants?select=platform_fee_percent
--     GET /rest/v1/foodos_restaurants?select=stripe_account_id
--     GET /rest/v1/foodos_menu_items?select=cost
--
-- para leer, de **cualquier restaurante activo**: la comisión que le cobramos,
-- su cuenta Express y el costo de cada platillo de su menú. Los tres se
-- comprobaron con sonda anónima (`200` con fila) antes de escribir esto.
--
-- LA REGLA
-- --------
-- Lista blanca, no lista negra: `REVOKE SELECT (columna)` sobre un `GRANT
-- SELECT` de tabla es **inerte** (Postgres subsume el privilegio de columna en
-- el de tabla), y con lista blanca cualquier columna que se añada mañana nace
-- privada. La lista vive en **`src/lib/foodos-columns.ts`** porque el código la
-- necesita para pedirla, y `src/lib/foodos-columns.contract.test.ts` compara
-- las dos para que no puedan divergir.
--
-- SOLO SE TOCA `SELECT`
-- ---------------------
-- A diferencia de `00192`, aquí **no** se revocan `INSERT`/`UPDATE`/`DELETE`:
-- el dueño del restaurante sí escribe estas tablas con el cliente de sesión, y
-- `00160` ya había acotado `UPDATE` de `foodos_restaurants` a 18 columnas
-- concretas. Revocar aquí la escritura desharía ese trabajo y rompería el
-- panel. Se revoca y se vuelve a conceder **únicamente la lectura**.
--
-- DOS CONJUNTOS, Y UNA EXCEPCIÓN QUE SORPRENDE
-- ---------------------------------------------
--   · **Públicas**: las lee el storefront con la llave anónima.
--   · **De `service_role`**: las lee el panel con el cliente de servicio,
--     después de que `requireFoodosAuth()` autorice y con la consulta acotada
--     al restaurante autorizado (`getConnectStatus`, `loadOwnedRestaurant`,
--     `getFoodosPanelData`, `listMenuItems`, `syncWhatsAppCatalog`,
--     `sendCatalogToCustomer`, `getMostradorData`, `getMesasData`,
--     `getRestaurantConnectStatus`).
--
-- Y `foodos_restaurants.user_id`, que **es pública aunque no lo parezca**: no es
-- una decisión de comodidad, es que Postgres la necesita para **evaluar** las
-- políticas RLS. 67 políticas del esquema son de dueño (`auth.uid() = user_id`,
-- o un `EXISTS` que entra a `foodos_restaurants` por `user_id`) y están
-- declaradas con rol `{public}`. Para un visitante anónimo `auth.uid()` es
-- `NULL`, así que nunca dan filas — pero igual se evalúan, y evaluarlas exige
-- leer la columna. La primera versión de este archivo la revocaba y el
-- resultado fue `42501 permission denied for table foodos_restaurants` en
-- `GET /rest/v1/foodos_menu_items`: la tienda pública se quedaba sin menú.
--
-- Acotar esas 67 políticas a `{authenticated}` es semánticamente neutro, pero
-- toca 54 tablas —`orders`, `profiles` y `wallets` incluidas— y el premio es
-- esconder un UUID que **no es una credencial** (no se puede iniciar sesión con
-- él; RLS resuelve `auth.uid()` desde el JWT). No compensa, y la guarda de
-- abajo lo afirma en positivo para que nadie lo «limpie» otra vez.
--
-- Las columnas que sí importan —`platform_fee_percent`, los `stripe_*`, la
-- moderación y `foodos_menu_items.cost`— **no** participan en ninguna política
-- (verificado: cero coincidencias), así que se quedan privadas sin efecto
-- colateral.
--
-- `transfer_clabe` / `transfer_bank` / `transfer_beneficiary` **sí son
-- públicas a propósito**: el storefront las pinta para que el comensal pague
-- por transferencia SPEI. No son una fuga, son el mecanismo de cobro.
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

-- ── foodos_restaurants ────────────────────────────────────────
-- El privilegio de tabla va primero: mientras exista, cualquier REVOKE de
-- columna que se escriba después es decorativo.
REVOKE SELECT ON public.foodos_restaurants FROM PUBLIC;
REVOKE SELECT ON public.foodos_restaurants FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  name,
  slug,
  logo_url,
  description,
  collection_id,
  status,
  currency,
  timezone,
  theme_color,
  tagline,
  about,
  seo_keywords,
  google_business_url,
  app_short_name,
  app_background_color,
  meta_pixel_id,
  tiktok_pixel_id,
  transfer_clabe,
  transfer_bank,
  transfer_beneficiary,
  created_at,
  updated_at
) ON public.foodos_restaurants TO anon;

-- La misma lista para `authenticated`: la única diferencia entre los dos roles
-- en esta tabla es la escritura, que no se toca aquí.
GRANT SELECT (
  id,
  user_id,
  name,
  slug,
  logo_url,
  description,
  collection_id,
  status,
  currency,
  timezone,
  theme_color,
  tagline,
  about,
  seo_keywords,
  google_business_url,
  app_short_name,
  app_background_color,
  meta_pixel_id,
  tiktok_pixel_id,
  transfer_clabe,
  transfer_bank,
  transfer_beneficiary,
  created_at,
  updated_at
) ON public.foodos_restaurants TO authenticated;

-- ── foodos_menu_items ─────────────────────────────────────────
REVOKE SELECT ON public.foodos_menu_items FROM PUBLIC;
REVOKE SELECT ON public.foodos_menu_items FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  category_id,
  name,
  description,
  price,
  image_url,
  is_featured,
  is_available,
  tags,
  sort_order,
  whatsapp_visible,
  whatsapp_position,
  created_at
) ON public.foodos_menu_items TO anon, authenticated;

-- `service_role` conserva la tabla completa (el panel lee `cost`, los
-- `stripe_*` y `platform_fee_percent`, y escribe).
GRANT SELECT ON public.foodos_restaurants TO service_role;
GRANT SELECT ON public.foodos_menu_items TO service_role;

-- RLS sigue siendo la primera capa (filtra filas); esto reafirma que nadie la
-- apagó de paso.
ALTER TABLE public.foodos_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_menu_items ENABLE ROW LEVEL SECURITY;

-- Guarda ruidosa: si el privilegio no quedó donde dice el comentario, la
-- migración falla en vez de dejar el agujero abierto en silencio. Ya cazó una
-- versión de este archivo que metía `user_id` en el conjunto de `service_role`.
DO $guard$
DECLARE
  v_col TEXT;
  v_fuga TEXT[] := ARRAY[]::TEXT[];
  v_falta TEXT[] := ARRAY[]::TEXT[];
  v_privadas_r CONSTANT TEXT[] := ARRAY['stripe_account_id', 'stripe_charges_enabled', 'stripe_payouts_enabled', 'stripe_details_submitted', 'stripe_requirements_due', 'stripe_onboarded_at', 'platform_fee_percent', 'submitted_at', 'review_note', 'reviewed_at', 'reviewed_by'];
  v_publicas_r CONSTANT TEXT[] := ARRAY['id', 'user_id', 'name', 'slug', 'logo_url', 'description', 'collection_id', 'status', 'currency', 'timezone', 'theme_color', 'tagline', 'about', 'seo_keywords', 'google_business_url', 'app_short_name', 'app_background_color', 'meta_pixel_id', 'tiktok_pixel_id', 'transfer_clabe', 'transfer_bank', 'transfer_beneficiary', 'created_at', 'updated_at'];
  v_privadas_i CONSTANT TEXT[] := ARRAY['cost'];
  v_publicas_i CONSTANT TEXT[] := ARRAY['id', 'restaurant_id', 'category_id', 'name', 'description', 'price', 'image_url', 'is_featured', 'is_available', 'tags', 'sort_order', 'whatsapp_visible', 'whatsapp_position', 'created_at'];
BEGIN
  -- Lo de `service_role` no puede verlo ni anon ni authenticated.
  FOREACH v_col IN ARRAY v_privadas_r LOOP
    IF has_column_privilege('anon', 'public.foodos_restaurants', v_col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.foodos_restaurants', v_col, 'SELECT') THEN
      v_fuga := v_fuga || ('restaurants.' || v_col);
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY v_privadas_i LOOP
    IF has_column_privilege('anon', 'public.foodos_menu_items', v_col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.foodos_menu_items', v_col, 'SELECT') THEN
      v_fuga := v_fuga || ('menu_items.' || v_col);
    END IF;
  END LOOP;

  -- `user_id` debe seguir siendo legible por anon: 67 políticas RLS la leen
  -- para poder evaluarse. Si alguien la «limpia» por parecer sensible, la
  -- tienda pública se queda sin menú con 42501. Se afirma en positivo.
  IF NOT has_column_privilege('anon', 'public.foodos_restaurants', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION '00193: anon perdio user_id y con el las 67 politicas RLS que lo leen';
  END IF;

  FOREACH v_col IN ARRAY v_publicas_r LOOP
    IF NOT has_column_privilege('anon', 'public.foodos_restaurants', v_col, 'SELECT') THEN
      v_falta := v_falta || ('restaurants.' || v_col);
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY v_publicas_i LOOP
    IF NOT has_column_privilege('anon', 'public.foodos_menu_items', v_col, 'SELECT') THEN
      v_falta := v_falta || ('menu_items.' || v_col);
    END IF;
  END LOOP;

  IF array_length(v_fuga, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00193: anon/authenticated todavia pueden leer %', v_fuga;
  END IF;
  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00193: la superficie publica perdio acceso a %', v_falta;
  END IF;

  IF has_table_privilege('anon', 'public.foodos_restaurants', 'SELECT')
     OR has_table_privilege('anon', 'public.foodos_menu_items', 'SELECT') THEN
    RAISE EXCEPTION '00193: anon conserva SELECT a nivel de tabla en FoodOS';
  END IF;

  -- El dueño sigue pudiendo escribir su menú (00160 ya acotó el de restaurants).
  IF NOT has_table_privilege('authenticated', 'public.foodos_menu_items', 'UPDATE') THEN
    RAISE EXCEPTION '00193: authenticated perdio UPDATE en foodos_menu_items';
  END IF;

  RAISE NOTICE '00193: restaurants % publicas (user_id incluida por RLS); menu_items % publicas; SELECT de tabla revocado.',
    array_length(v_publicas_r, 1), array_length(v_publicas_i, 1);
END $guard$;
