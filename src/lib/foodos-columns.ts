/**
 * Columnas de FoodOS que la superficie **pública** puede leer.
 *
 * POR QUÉ EXISTE ESTA LISTA
 * -------------------------
 * `foodos_restaurants` y `foodos_menu_items` tenían `GRANT SELECT` **a nivel de
 * tabla** para `anon` y `authenticated` (del `ALTER DEFAULT PRIVILEGES` de
 * Supabase, el mecanismo que documenta `00160`). Sus políticas RLS de lectura
 * son de **fila** (`status = 'active'` para el restaurante, y
 * `EXISTS (… r.status = 'active')` para sus platillos), y RLS filtra filas,
 * **no columnas**. Con la llave anónima que viaja en el navegador bastaba
 *
 *     GET /rest/v1/foodos_restaurants?select=platform_fee_percent
 *     GET /rest/v1/foodos_menu_items?select=cost
 *
 * para leer, de **cualquier restaurante activo**: la comisión que le cobramos,
 * su estado de Stripe y el costo de cada platillo de su menú. `00192` cerró el
 * caso gemelo en `products`; esto cierra los dos de FoodOS.
 *
 * POR QUÉ ES LISTA BLANCA
 * -----------------------
 * `REVOKE SELECT (columna)` sobre un `GRANT SELECT` de tabla es **inerte**
 * (Postgres subsume el privilegio de columna en el de tabla). Y al revés: con
 * lista blanca, cualquier columna que se añada mañana a estas tablas nace
 * **privada**. El default es el seguro.
 *
 * QUÉ SE QUEDA FUERA, Y QUIÉN LO LEE ENTONCES
 * -------------------------------------------
 * | Columna | Motivo | Quién la lee |
 * | --- | --- | --- |
 * | `foodos_menu_items.cost` | Costo del platillo: revela el margen del restaurante | Panel (`getFoodosPanelData`, `listMenuItems`), vía `service_role` |
 * | `foodos_restaurants.stripe_*` (6) | Estado de la cuenta Express | `connect-actions.ts`, vía `service_role` |
 * | `foodos_restaurants.platform_fee_percent` | **Nuestra comisión**: es precio nuestro | `connect-actions.ts` y el panel admin, vía `service_role` |
 * | `foodos_restaurants.review_note` / `reviewed_at` / `reviewed_by` / `submitted_at` | Moderación interna | Panel del dueño, vía `service_role` |
 *
 * `foodos_restaurants.user_id` es un caso aparte: **no** es pública, pero
 * `authenticated` **sí** la necesita, porque `loadOwnRestaurantId`
 * (`src/lib/foodos-operating.ts`) **filtra** por ella para resolver qué
 * restaurante opera el usuario, y filtrar exige privilegio de `SELECT` sobre la
 * columna. Se concede solo a `authenticated`; `anon` no la ve.
 *
 * `transfer_clabe` / `transfer_bank` / `transfer_beneficiary` **sí son
 * públicas a propósito**: el storefront las muestra en la pantalla de éxito
 * para que el comensal pague por transferencia SPEI (`src/app/r/[slug]/storefront.tsx`,
 * `_components/success-screen.tsx`). No son una fuga, son el mecanismo de cobro.
 *
 * El contrato `src/lib/foodos-columns.contract.test.ts` compara estas listas
 * con el `GRANT` de `00193` y vigila que ningún lector sin `service_role` pida
 * una columna privada.
 */
export const PUBLIC_FOODOS_RESTAURANT_SELECT =
  "id, user_id, name, slug, logo_url, description, collection_id, status, currency, timezone, theme_color, tagline, about, seo_keywords, google_business_url, app_short_name, app_background_color, meta_pixel_id, tiktok_pixel_id, transfer_clabe, transfer_bank, transfer_beneficiary, created_at, updated_at" as const

export const PUBLIC_FOODOS_RESTAURANT_COLUMNS = PUBLIC_FOODOS_RESTAURANT_SELECT.split(", ")

export const PUBLIC_FOODOS_MENU_ITEM_SELECT =
  "id, restaurant_id, category_id, name, description, price, image_url, is_featured, is_available, tags, sort_order, whatsapp_visible, whatsapp_position, created_at" as const

export const PUBLIC_FOODOS_MENU_ITEM_COLUMNS = PUBLIC_FOODOS_MENU_ITEM_SELECT.split(", ")

/** Las que `00193` deja para `service_role`. Se exporta para poder afirmarlo. */
export const PRIVATE_FOODOS_RESTAURANT_COLUMNS = [
  "stripe_account_id",
  "stripe_charges_enabled",
  "stripe_payouts_enabled",
  "stripe_details_submitted",
  "stripe_requirements_due",
  "stripe_onboarded_at",
  "platform_fee_percent",
  "submitted_at",
  "review_note",
  "reviewed_at",
  "reviewed_by",
] as const

/**
 * `user_id` es pública **a propósito**, y es la excepción que más cuesta creer.
 *
 * No es una decisión de comodidad: `anon` **necesita** `SELECT` sobre esta
 * columna para que Postgres pueda **evaluar** las políticas RLS. 67 políticas
 * del esquema son del tipo «dueño» (`auth.uid() = user_id`, o un `EXISTS` que
 * entra a `foodos_restaurants` por `user_id`) y están declaradas con rol
 * `{public}`. Para un visitante anónimo `auth.uid()` es `NULL`, así que esas
 * políticas nunca dan filas — pero **igual se evalúan**, y evaluarlas exige
 * leer la columna. Sin el privilegio, PostgREST devuelve
 * `42501 permission denied for table foodos_restaurants` y la tienda pública se
 * queda sin menú: se comprobó, es el fallo exacto que produjo la primera
 * versión de `00193`.
 *
 * La alternativa —acotar esas 67 políticas a `{authenticated}`— es
 * semánticamente neutra pero toca 54 tablas, incluidas `orders`, `profiles` y
 * `wallets`: es un rediseño del modelo de seguridad entero, y el beneficio es
 * esconder un UUID que **no es una credencial** (no se puede iniciar sesión con
 * él; RLS resuelve `auth.uid()` desde el JWT). No compensa.
 *
 * Las columnas que sí importan —`platform_fee_percent`, los `stripe_*`, la
 * moderación y `foodos_menu_items.cost`— **no** participan en ninguna política
 * (verificado: cero coincidencias), así que se quedan privadas sin efecto
 * colateral.
 */
export const PRIVATE_FOODOS_MENU_ITEM_COLUMNS = ["cost"] as const
