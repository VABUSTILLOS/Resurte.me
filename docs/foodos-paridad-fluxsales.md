# Paridad FoodOS ↔ FluxSales

Roadmap para incorporar a FoodOS las capacidades de [fluxsales.co](https://fluxsales.co)
("el sistema operativo con IA para restaurantes"): sitio con IA + SEO local,
pedidos directos sin comisión, Flotilla de reparto on-demand, lealtad con
Wallet, marketing automatizado y Mesero IA por WhatsApp.

**No se construye un producto paralelo.** Se extiende FoodOS y las capacidades
nuevas se **desbloquean por nivel de compra en el marketplace**, no por
suscripción.

## Modelo de desbloqueo

Sin cobro. El nivel del dueño del restaurante se gana comprando en el
marketplace (migración `00029`: semanas calificantes de ≥ $2,500 MXN, hora de
México, semana ISO). Fuente única: `src/lib/wallet-progress.ts`
(`computeWeekProgress`). La lógica **no se duplica**.

| Nivel | Requisito | Desbloquea |
|---|---|---|
| **Verde** | 0 semanas | FoodOS base: menú, pedidos, QR, KDS, cupones, propina, SPEI, lealtad por puntos, reseñas, WhatsApp catálogo, tracking |
| **Plata** | 2 semanas | Marketing IA |
| **Oro** | 3 semanas | Flotilla |
| **Diamante** | 4 semanas | Mesero IA, Wallet, app/PWA de marca, sitio IA + SEO local, POS, catering |

## Estado

### ✅ Fase 0 — Entitlements por nivel

Fundación, sin dependencias externas.

- `src/lib/foodos-entitlements.ts` — módulo **puro**: mapa `feature → nivel
  mínimo`, catálogo con claves i18n, `earnedTierFromOrders`, `effectiveTier`,
  `summarizeEntitlements`. Sin deps de React ni de servidor.
- `src/lib/foodos-tier.ts` — capa **server-only**: `getRestaurantEntitlements`,
  `getMyEntitlements` (`cache()`), `FoodosFeatureLockedError` y
  `requireFoodosFeature` (gate de server actions).
- `src/components/panel/foodos/` — `entitlements-context.tsx`
  (`useEntitlements()`), `nivel-badge.tsx`, `nivel-gate.tsx` (variantes `page`
  e `inline`), `nivel-card.tsx` (tarjeta de nivel en el hub).
- Gate en dos capas: **UI** (`ToolGrid` bloquea con overlay y CTA de nivel) y
  **servidor** (`requireFoodosFeature` en `src/app/panel/foodos/actions.ts`).
  El gate de rol (`canAccessTool`) sigue aplicando además.
- Migración `00120_foodos_entitlements.sql` — tabla
  `foodos_entitlement_overrides` (excepción manual de admin con motivo y
  caducidad). El nivel se **computa en vivo**; la tabla solo guarda excepciones.

**Contrato de gate:** escrituras lanzan (`requireFoodosFeature`), lecturas
degradan (`return []`), para que la pantalla muestre su propio estado bloqueado
en vez de un error de servidor. El gate corre **antes** de `requireAuth()`, así
que sin nivel no se toca la base ni se resuelve la sesión.

### ✅ Fase 1 — Capa de IA compartida

Base de Mesero IA (Fase 2), Marketing IA (Fase 3) y sitio IA (Fase 6).

- `src/lib/ai/llm.ts` — `generateText()` y `chatCompletionRaw()`. Resolutor
  único de proveedores, en orden: **OmniRoute → OpenAI → Kie.ai**. Antes esta
  resolución estaba duplicada en `src/lib/agente/llm.ts`; ahora ese archivo es
  un envoltorio delgado sobre `chatCompletionRaw`.
- `src/lib/ai/budget.ts` + migración `00121_foodos_ai_usage.sql` — presupuesto
  de tokens por restaurante/día, con reserva **atómica** antes de llamar al
  modelo (`foodos_ai_reserve`) y liquidación con el consumo real después
  (`foodos_ai_settle`).
- `fallbackTemplates` — copy determinista para `mesero_reply`, `campaign_copy`
  y `menu_description`, interpolando `{variables}` del contexto.

**Contrato:** `generateText` **nunca lanza** y siempre devuelve texto. Si no hay
credenciales, si `AI_ENABLED=false`, si se agotó el presupuesto o si el
proveedor falla, devuelve la plantilla con `source: "template"` y un `reason`
(`disabled` | `unconfigured` | `budget` | `error`). El comensal nunca ve un
error de IA.

**Guardarraíles:** `AI_ENABLED` (kill switch), `AI_TIMEOUT_MS` (12 s),
`AI_MAX_RETRIES` (1), `AI_DAILY_TOKEN_CAP` (60 000). Se reintentan 429 y 5xx;
un 400/401/403 no se reintenta. El contador es **best-effort**: si Supabase
falla, se permite la llamada (mejor gastar unos tokens que dejar a un comensal
sin respuesta).

### ✅ Fase 2 — Mesero IA (nivel Diamante)

Un mesero que atiende WhatsApp 24/7 y arma el pedido completo: catálogo,
cantidades, entrega o recolección, dirección, nombre y confirmación.

- `src/lib/foodos-ai-wa/state-machine.ts` — máquina de estados **pura** (sin
  red, sin Supabase, sin LLM). Entra `(sesión, texto, menú, config)`, sale
  `(estado, borrador, respuesta, acción)`. Hace **imposible** que el modelo
  invente un precio: los precios salen del menú real.
- `src/lib/foodos-ai-wa/polish.ts` — el **único** lugar donde el LLM reescribe
  el tono, y solo si el turno es `rephraseable`. Descarta la reescritura si
  introduce cifras nuevas, si excede 700 caracteres o si viene vacía.
- `src/lib/foodos-ai-wa/context.ts` — carga restaurante, menú, categorías y
  ajustes (`foodos_ai_settings`) en una sola pasada.
- `src/lib/foodos-ai-wa/orchestrator.ts` — `handleMeseroMessage()`: guardas de
  handoff, horario y tope diario de respuestas; persiste cada mensaje; confirma
  y crea el pedido; envía por WhatsApp con la config del restaurante.
- Migración `00122_foodos_mesero_ia.sql` — `foodos_ai_settings` (activación,
  tono, saludo, handoff, tope diario, solo en horario), `foodos_ai_sessions`
  (estado + borrador + contador diario, una por restaurante/teléfono) y
  `foodos_ai_messages` (bitácora con `source` `llm` | `template`).
- Panel: `/panel/foodos/mesero-ia` con métricas (conversaciones, pedidos,
  conversión, ticket promedio), ajustes, lista de conversaciones con
  tomar/reanudar, y un **simulador** que corre la máquina de estados real sin
  red. El inbox (`/panel/foodos/inbox`) marca qué conversaciones lleva la IA y
  permite tomar el control.

**Contrato:** respuestas con dinero (resumen, confirmación, lista de ítems)
son literales — `rephraseable: false` — y nunca pasan por el modelo. Si el
restaurante no tiene WhatsApp conectado, la IA no responde: se cae al catálogo
automático. Si el modelo falla, se envía el texto determinista.

**Punto de entrada:** `handleFoodosIncoming` en
`src/app/api/whatsapp/webhook/route.ts`, **antes** del catálogo automático y
solo si la IA está activada y la sesión no está en manos de un humano.

### ✅ Fase 3 — Marketing IA (nivel Plata)

Marketing que se decide solo: audiencias calculadas en vivo, tres disparadores
nuevos, prueba A/B, SMS de respaldo y copy generado con IA. Sin billing.

- `src/lib/foodos-rfm.ts` — núcleo **puro** de segmentación RFM. Puntúa recencia,
  frecuencia y gasto por **percentiles relativos de la propia cartera** (no
  umbrales fijos) y mapea el resultado a las 10 audiencias canónicas de
  `FOODOS_AUDIENCE_KEYS`, cada una con su playbook (oferta sugerida, prioridad,
  canal, claves i18n). Las audiencias **se computan en vivo**, no se cachean: no
  hay tabla de segmentos que se quede obsoleta. `SEGMENT_TO_AUDIENCE` mantiene el
  puente con el segmento simple anterior.
- `src/lib/messaging/channel.ts` — enrutamiento puro. `resolveChannel()` decide
  WhatsApp o SMS según capacidades y **opt-in explícito**; el `fallback` a SMS
  solo existe para el canal `both`. `pickVariant()` reparte A/B por hash
  FNV-1a del `customer_id`, así que la variante de un cliente es **estable entre
  corridas**; `tallyAbTest()` resume los resultados.
- `src/lib/messaging/sms.ts` — adaptador Twilio detrás de interfaz
  (`SmsAdapter`). `resolveSmsAdapter()` devuelve `null` sin credenciales o con
  `SMS_ENABLED=false`, y entonces el canal SMS simplemente no existe. Nunca
  registra el cuerpo del mensaje ni el teléfono.
- `src/lib/messaging/send.ts` — `sendMarketingMessage()` es el único punto de
  salida y **nunca lanza**. Resuelve las capacidades **una vez por corrida** y
  pasa siempre la config de WhatsApp **del restaurante** (antes el motor usaba
  la config global: bug corregido).
- `src/lib/foodos-ai/copy.ts` — `generateCampaignCopy()` escribe el copy desde un
  brief. Degrada a plantilla si el modelo falla, si excede 500 caracteres o si
  **introduce cifras que el dueño no escribió**; si falta `{link}`, lo añade.
- `src/lib/foodos-campaigns.ts` — motor reescrito: 9 tipos de automatización,
  `fetchTargetCustomers` con audiencia RFM (con precedencia sobre el segmento
  simple), cumpleaños, carrito abandonado y petición de reseña. Los envíos sin
  canal disponible cuentan como **`skipped`**, no como fallidos.
- Migración `00123_foodos_marketing_ia.sql` — extiende `foodos_automations`
  (9 tipos, `message_b`, `ab_test`, `audience`, `channel`), `foodos_customers`
  (`birthday`, `sms_opt_in`) y `foodos_campaigns` (`variant`, `audience`,
  `provider`). **Sin tablas nuevas y sin RLS nueva.**
- Panel: la pestaña Clientes gana la tarjeta **Audiencias** (un clic para lanzar
  una campaña a la audiencia), la tarjeta **Resultados del A/B**, el editor de
  cumpleaños y opt-in por cliente, y el formulario de automatización con
  selector de audiencia, selector de canal y el bloque **Generar con IA**
  (brief + tono). El cron diario (`/api/foodos/campaigns/run`) ya cubre
  cumpleaños y carrito abandonado.

**Contrato:** la IA **no inventa cifras ni enlaces** — descarta su propia salida
si aparece un número o una URL que el dueño no escribió. Sin Twilio configurado,
el SMS desaparece y todo sigue saliendo por WhatsApp. El A/B es determinista por
cliente, no aleatorio por envío.

### ✅ Fase 4 — Flotilla (nivel Oro)

Reparto propio con zonas y tarifas, más un adaptador opcional a Uber Direct.
El repartidor **no tiene cuenta**: entra por un enlace con token de capacidad.

- `src/lib/local-date.ts` — fechas locales compartidas (`dayKeyOf`,
  `minutesOfDay`, `isWithinShift`). Se extrajo de `foodos-rfm.ts` para que la
  logística no dependa del módulo de segmentación de marketing; `foodos-rfm.ts`
  lo re-exporta para no romper a sus consumidores.
- `src/lib/foodos-flotilla.ts` — núcleo **puro** de la Flotilla: máquina de
  estados de la entrega (`pending → assigned → picked_up → delivered`, con
  `failed`/`cancelled` terminales y `canTransitionDelivery()` como única
  autoridad), geometría (`haversineKm`), zonas (`matchZone()` elige el **círculo
  más pequeño** que contiene el punto, con desempate por `sort_order` y nombre),
  tarifa (`resolveDeliveryFee()`), ETA por vehículo, disponibilidad de
  repartidores (`pickCourier()` ordena por carga, luego cupo, luego id) y KPIs
  del día (`summarizeFlotilla()`).
- `src/lib/flotilla/deliveries.ts` — capa de servidor. `quoteDelivery()` es el
  **único** lugar que decide la tarifa de entrega y `ensureDeliveryForOrder()` es
  idempotente (`order_id` es UNIQUE). La tarifa se **copia** en
  `foodos_deliveries.fee`: es un precio congelado, no una referencia viva a la
  zona. `deliverWithPin()` cierra la entrega con el PIN del comensal.
- `src/lib/flotilla/provider.ts` — adaptador de reparto externo (Uber Direct)
  detrás de interfaz, con capacidad de **plataforma** (variables de entorno) y no
  por restaurante. Sin credenciales `resolveDeliveryProvider()` devuelve `null` y
  todo sigue con flotilla propia; el despacho a proveedor **nunca es automático**.
  Token OAuth cacheado en memoria, un solo reintento ante 401, y ni el secreto ni
  el token aparecen en los logs.
- Migraciones `00124_foodos_flotilla.sql` y `00125_foodos_flotilla_reparto.sql` —
  `foodos_couriers` (con `access_token` y su índice único parcial),
  `foodos_delivery_zones`, `foodos_deliveries`, `foodos_delivery_events`, cuatro
  columnas de entrega en `foodos_orders` y el bucket privado `entregas`. RLS con
  el patrón de FoodOS (dueño vía `foodos_restaurants.user_id`, admin vía
  `is_admin()`); el dueño **no inserta entregas a mano**, las crea el productor
  de pedidos.
- Panel `/panel/foodos/flotilla` — KPIs, entregas activas con avance de estado y
  **autoasignación** (elige al repartidor con menos carga y turno abierto), alta
  de repartidores y de zonas, y el **enlace del repartidor** (ver, copiar,
  revocar) con aviso cuando no hay ninguno activo.
- `/reparto/[token]` — vista móvil del repartidor con sus entregas abiertas,
  avance de estado y cierre con PIN más foto opcional de respaldo. El token solo
  abre **sus** entregas: la comprobación de propiedad va en el route handler,
  porque la capa de servidor valida el restaurante, no el repartidor.
- Storefront: el checkout de delivery pide **dirección y notas**, y el tracking
  público (`/r/[slug]/pedido/[id]`) muestra estado, repartidor, ETA, zona y el
  PIN de prueba.

**Contrato:** la tarifa la decide el servidor, nunca el navegador. Un pedido sin
coordenadas cae a la tarifa plana de la sucursal; la distancia y la ETA quedan en
`null` en vez de inventarse. La geolocalización del repartidor es de mejor
esfuerzo. La foto de entrega respalda al PIN, no lo sustituye.

### ✅ Fase 5 — Wallet y ciclo de vida (nivel Diamante)

La tarjeta de lealtad vive en el teléfono del comensal, no en una pestaña del
navegador. Tres formatos con **el mismo diseño**: Apple Wallet, Google Wallet y
tarjeta web.

- `src/lib/foodos-wallet/card.ts` — constructor **puro** del pase. `buildWalletCard()`
  produce la estructura que consumen las tres plataformas (encabezado, saldo,
  valor, recompensa, código de barras QR), así que Apple, Google y la web **no
  pueden divergir**. `normalizeHex()` valida el color de marca y cae al color por
  defecto ante basura: un color inválido invalidaría el pase entero.
  `contrastForeground()` elige texto claro u oscuro para que el saldo se lea
  sobre cualquier color.
- `src/lib/foodos-wallet/passes.ts` — capa de servidor. `ensureWalletPass()` es
  **idempotente** por `(customer_id, platform)` y **conserva el token** en cada
  emisión: reemitir no invalida el QR que el comensal ya guardó.
  `refreshWalletPass()` vuelve a fotografiar el saldo; `listWalletPasses()`,
  `getWalletStats()` y `setWalletPassActive()` alimentan el panel.
  `ensureWebWalletPass()` es la variante best-effort del pipeline de pedidos:
  nunca lanza y nunca bloquea una venta.
- `src/lib/foodos-wallet/apple.ts` / `google.ts` — adaptadores de plataforma con
  capacidad por **variables de entorno**, fail-closed: sin los cinco valores de
  Apple o los tres de Google, `resolveXWallet()` devuelve `null` y los botones
  de "añadir al teléfono" simplemente no aparecen. La tarjeta web sigue
  funcionando. Los PEM aceptan `\n` escapados.
- Migración `00126_foodos_wallet.sql` — `foodos_wallet_passes` con UNIQUE
  `(customer_id, platform)` y UNIQUE por `serial` y por `token`, más la función
  `foodos_sync_wallet_passes()` y su trigger. Migración
  `00127_foodos_wallet_config.sql` — `wallet_enabled`, `reward_points` y
  `reward_label` en `foodos_loyalty_programs`.
- `/r/[slug]/tarjeta/[token]` — tarjeta pública servida por **token de
  capacidad**: el comensal no tiene cuenta. `revalidate = 60`, sin
  `cookies()`/`headers()`; el token no resuelve si el pase está revocado o si el
  slug de la URL no coincide con el del restaurante.
- Panel `/panel/foodos/wallet` — KPIs (total, activos, instalados, web, puntos
  anunciados y su valor), edición de la recompensa con vista previa, emisión
  manual con buscador de clientes y lista de tarjetas emitidas con copiar enlace,
  abrir, refrescar saldo y revocar/reactivar.
- Entrada "Tarjeta de lealtad" en el hub con `feature: "wallet_passes"`.

**El saldo es una fotografía, no una consulta viva.** `foodos_wallet_passes`
guarda `points` y `points_value` copiados. La cadena completa ya existía y no
necesitó código nuevo: `foodos_orders.status → delivered` dispara
`foodos_award_loyalty_on_delivery()` (migración `00081`), que acredita
`foodos_customers.loyalty_points`; el trigger `trg_foodos_sync_wallet_passes`
propaga el saldo a los pases activos. Un pase revocado deja de resolver de
inmediato.

**Emisión automática:** `createFoodosOrder()` pide `customer_id` en el INSERT
(lo asigna el trigger `foodos_upsert_customer_on_order`) y, si el restaurante es
Diamante, emite la tarjeta web. Es **best-effort**: un fallo de emisión se
registra y el pedido sigue su curso.

**Contrato:** la emisión del panel usa **service role** a propósito — la RLS de
`foodos_wallet_passes` solo deja insertar a admin, y el permiso real lo dan el
gate de nivel y la verificación de propiedad del restaurante. La página pública
**no** lleva gate de nivel: es una capability URL, igual que el enlace del
repartidor. Un umbral de recompensa en cero o negativo se guarda como `null` en
vez de anunciar una meta imposible; un umbral sin nombre se rechaza.

### ✅ Fase 6 — App de marca, sitio IA y SEO local (nivel Diamante)

El micrositio deja de ser solo el menú con carrito y se convierte en el sitio del
restaurante: instalable como app, indexable en Google y con contenido que el
dueño genera y aprueba.

- `src/lib/foodos-seo.ts` — núcleo **puro**: manifest PWA, los cuatro bloques de
  datos estructurados, metadatos (`seoTitle`, `seoDescription`, `truncate`) y el
  checklist de Google Business. `truncate()` corta en frontera de palabra cuando
  el espacio está a más de la mitad del límite y cae a corte duro si no: así un
  título largo nunca queda con una palabra cortada a la mitad.
  `safeThemeColor()` solo acepta `#abc`/`#aabbcc` y si no devuelve el verde de
  marca; `manifestIcons()` declara `sizes: "any"` cuando el icono es el logo
  subido, porque no conocemos sus dimensiones reales y declarar `512x512` a
  ciegas hace que Android rechace la instalación.
- `/r/[slug]/manifest.webmanifest` — manifest por restaurante: `id`, `start_url`
  y `scope` en `/r/[slug]`, nombre corto recortado a 12, color de tema del
  restaurante y `orientation: portrait-primary`. `revalidate = 300`. Es
  **público**: gatearlo solo rompería la instalación de la app.
- `/r/[slug]/carta` — página indexable de la carta completa con cuatro JSON-LD
  (`Restaurant`, `Menu`, `FAQPage`, `BreadcrumbList`), sección "Sobre", la carta
  por categorías y las preguntas frecuentes. Sin `cookies()`/`headers()`.
- `/r/[slug]/p/[pageSlug]` — páginas de contenido (sobre, FAQ, platillo). Solo
  sirve lo **publicado**: la RLS anónima filtra los borradores, así que para el
  público un borrador simplemente no existe. `generateStaticParams` prerenderiza
  los primeros 50 restaurantes × 20 páginas.
- `src/lib/foodos-ai/seo.ts` — generadores. `generateAboutText()` y
  `generateDishCopy()` pasan por el modelo con reglas estrictas y **validan la
  salida**: si el texto inventa una cifra que el dueño no declaró, trae un enlace
  o se sale del rango de longitud, se descarta y cae a plantilla determinista.
  `generateFaq()` **no usa el modelo a propósito**: una respuesta inventada sobre
  envíos o pagos se convierte en un cliente reclamando en el mostrador.
- Migración `00128_foodos_sitio_ia.sql` — `tagline`, `about`, `seo_keywords` y
  `google_business_url` en `foodos_restaurants`, más `foodos_seo_pages`
  (`kind`, `slug`, `title`, `summary`, `body`, `faq`, `status`, `source`,
  `generated_at`, `approved_at`) con UNIQUE `(restaurant_id, kind, slug)`, RLS
  (el público lee solo lo publicado) y trigger de `updated_at`.
- `src/lib/foodos-seo-pages.ts` — capa de servidor: `loadSeoProfile()`,
  `listSeoPages()`, `loadPublishedSeoPage()`, `upsertSeoPage()`,
  `setSeoPageStatus()`, `deleteSeoPage()`, `normalizeKeywords()` y
  `saveSeoProfile()`. Todas las lecturas degradan; las escrituras devuelven un
  error legible.
- Panel `/panel/foodos/sitio-ia` — KPIs, los enlaces copiables (sitio, carta,
  manifest) con el cómo-instalar en iOS y Android, el perfil público (frase
  corta, descripción, palabras clave, enlace de Google Business), el checklist de
  Google Business y la lista de páginas con generar / publicar / ocultar / borrar.
- Entrada "Sitio web y app" en el hub con `feature: "sitio_ia"`.

**La IA nunca publica sola.** `upsertSeoPage()` **fuerza** `status: "draft"` y
`approved_at: null` aunque quien llame pida publicar; publicar es
`publishSeoPage()`, el acto explícito del dueño. Y la IA nunca fija precios: el
generador de la ficha del platillo tiene prohibido escribir el precio, así que el
servidor añade el precio real con `formatMoney` y la frase de modalidades
(domicilio / recoger) con los datos de las sucursales.

**El manifest y las páginas ya publicadas son públicos a propósito** — el dueño
aprobó ese contenido y gatearlos solo rompería la instalación de la app. Lo
gateado es generar, editar y publicar.

**Caché por tag propio.** `getPublicSeoData()` usa el tag `foodos-seo` (no
`foodos-public`) para que publicar una página no tire el caché del micrositio de
pedidos, que es el camino caliente. Publicar, ocultar y borrar revalidan las
cuatro cosas: el panel, el tag `foodos-seo`, la ruta pública y el sitemap.

### ✅ Fase 7 — Punto de venta y catering (nivel Diamante)

Dos caminos para vender fuera del mostrador: conectar la caja que el
restaurante ya tiene, y cotizar eventos por volumen. Ninguno de los dos puede
romper la caja si el tercero no responde.

#### Punto de venta

- Migración `00129_foodos_pos.sql` — `foodos_pos_connections` (una fila por
  restaurante y proveedor, UNIQUE `(restaurant_id, provider)`) y
  `foodos_pos_sync_log` (bitácora de sincronizaciones y webhooks), con índices,
  trigger de `updated_at`, RLS de dueño + admin y `COMMENT` en las columnas que
  no se explican solas.
- `src/lib/pos/registry.ts` — el registro de los 6 proveedores
  (`soft_restaurant`, `parrot`, `ncr_aloha`, `toast`, `clip`, `mercado_pago`),
  las capacidades de cada uno (`menu`, `orders`, `webhook`), la validación de
  credenciales campo por campo y `posConnectionView()`, que traduce los hechos
  de la fila a lo que el dueño necesita ver: estado, salud, qué falta, si hay
  secreto y la URL del webhook.
- `src/lib/pos/adapter.ts` — el contrato `PosAdapter` (`validate`, `health`,
  `pullMenu`, `pushOrder`) con la regla de que **ninguna operación lanza**:
  devuelven un `PosErrorCode` (`not_implemented`, `needs_credentials`,
  `unreachable`, `rejected`). `normalizeMenuSnapshot()` acota la entrada del
  proveedor (500 platillos, precios nunca negativos, 8 tags, deduplicado por
  nombre) porque un menú externo es dato de terceros.
- `src/lib/pos/reconcile.ts` — el mapeo de estados externos a los nuestros
  (`STATUS_INDEX` en minúsculas porque el mapa de Toast viene en mayúsculas),
  `planOrderReconcile()` para el webhook y `planMenuSync()`, que **nunca borra**:
  un platillo que solo existe en local se reporta como `onlyLocally` y el dueño
  decide.
- `src/lib/pos/connections.ts` — capa de servidor: `loadPosConnections()` carga
  **siempre los 6** (para que la pantalla no tenga huecos), `getPosWebhookSecret()`
  es fail-closed, y `logPosSync(supabase, restaurantId, entry)` registra cada
  intento.
- `/api/foodos/pos/[provider]/webhook/[restaurantId]` — receptor del webhook.
  El `restaurantId` va en la ruta porque el proveedor no tiene sesión: la URL
  tiene que decir a quién pertenece la conexión. El secreto viaja en
  `x-pos-secret` y se compara con `safeSecretEqual`. Orden: sin secreto
  configurado → 503; secreto incorrecto → 401; estado desconocido → 200 con
  `applied: false` y bitácora `skipped`; pedido ajeno → 404. **No recalcula
  precios**: solo mueve el estado.
- Panel `/panel/foodos/pos` — KPIs, el camino CSV que ya funciona con enlace a
  `/panel/foodos/menu`, los 6 proveedores con su nota de qué falta, la captura
  de credenciales (campos `password` para los secretos), probar / sincronizar /
  rotar secreto / desconectar, la URL del webhook copiable y la bitácora.
- Entrada "Punto de venta" en el hub con `feature: "pos_integraciones"`.

**Ningún adaptador está implementado, y el panel lo dice.** `resolvePosAdapter`
es el punto único de extensión y hoy devuelve `unimplementedPosAdapter`. Fingir
una sincronización produciría un menú desincronizado en silencio, que es peor
que no tener la integración. El camino sin credenciales sigue siendo la
importación CSV del menú.

#### Catering

- Migración `00130_foodos_catering.sql` — `foodos_catering_packages` (precio por
  persona, mínimo y máximo, anticipación, qué incluye) y
  `foodos_catering_requests` (evento, contacto, estado, total, anticipo), con
  índices, triggers, RLS de dueño + admin y lectura pública solo de paquetes
  activos. **Sin políticas anónimas de escritura**: una política anónima de
  `INSERT` dejaría inventar `headcount` y `quoted_total` desde el navegador.
- `src/lib/foodos-catering.ts` — núcleo **puro**: validación de paquetes y
  solicitudes, `quoteCatering()` como única fuente del total,
  `planCateringTransition()` con la máquina de estados y `summarizeCatering()`
  para los KPIs. El helper `numeric()` distingue "no viene" de "vale cero",
  porque `Number("")` es `0` y un campo ausente se colaba como cero.
- `src/lib/foodos-catering-data.ts` — capa de servidor: CRUD de paquetes,
  `createCateringRequest()` (nace en `quoted`, no en `requested`),
  `setCateringRequestStatus()` y `overrideCateringTotal()` para ajustes
  autorizados.
- Panel `/panel/foodos/catering` — KPIs, paquetes con CRUD en línea y
  solicitudes con los botones **derivados de la misma función pura** que valida
  el servidor (`planCateringTransition`, filtrando `ignore`), así que la UI no
  puede inventar una transición.
- Entrada "Catering" en el hub con `feature: "catering"`.

**Una cotización no es una venta.** Una solicitud de catering **no** entra a
`foodos_orders` hasta que el restaurante confirma el evento. El total se congela
al cotizar y se recalcula al volver a cotizar desde `requested`. `completed` y
`cancelled` no se reabren.

### ✅ Fase 8 — Capa comercial y captación

Todo lo que FluxSales vende aparte, aquí viene incluido: la landing que capta al
restaurante, la calculadora que le dice cuánto pierde con las apps de delivery,
el calificador que lo diagnostica antes de hablar con él y el panel de admin que
concede el nivel. **Sin pasarela de cobro**: el acceso se desbloquea con el
nivel, y el nivel se gana comprando.

#### La landing `/restaurantes`

Página pública `force-static` con `revalidate = 3600` — sin `cookies()` ni
`headers()`, así que entra al prerender. Contiene:

1. **Escalón de niveles** renderizado desde `PUBLIC_TIER_LADDER`
   (`src/lib/foodos-entitlements.ts`), que se **deriva** de `TIER_LADDER`
   (`src/lib/wallet-progress.ts`) y de `featuresForTier()`. No es una segunda
   copia del escalón: si el escalón cambia, la landing cambia sola.
2. **Calculadora de comisiones** (`roi-calculator.tsx`, isla cliente).
3. **Calificador** (`lead-qualifier.tsx`, isla cliente) con ancla `#diagnostico`.
4. **Grid de capacidades** generado desde `FOODOS_FEATURE_ORDER`.
5. **Bloque "gratis desde la primera compra"**, FAQ (`<details>`) y CTA a
   WhatsApp.
6. **JSON-LD**: `WebSite` + `Breadcrumb` + `SoftwareApplication` + `FAQPage`.

El texto va en español hardcodeado, igual que `/precios` y
`/negocio/cotizaciones`: son páginas de marketing, no de panel.

#### La calculadora mide comisiones, no cashback

`src/lib/roi-calculator.ts` es puro y tiene 16 tests. Recibe pedidos por semana,
ticket promedio, comisión de la app, % de pedidos a domicilio y el costo propio
de repartir; devuelve la comisión anual, la mensual, la de un solo pedido, el
GMV anual y el ahorro estimado.

Tres decisiones que la separan de la calculadora de `/recompensas`
(`ROICalculatorScreen.tsx`, que mide cashback para el comensal):

- **No promete un nivel de FoodOS.** El nivel se gana comprando, no vendiendo.
- **No modela la comisión de procesamiento de pago**: se paga igual en los dos
  caminos, así que meterla solo ensuciaría la comparación.
- **Muestra ahorro negativo con un aviso** cuando el reparto propio sale más
  caro. Un número incómodo es mejor que una promesa inflada.

El campo de % a domicilio se captura en 0–100 y se divide entre 100 antes de
entrar al núcleo, que espera una fracción.

#### El diagnóstico del lead lo deriva el servidor

`src/lib/lead-qualification.ts` es puro (28 tests): `normalizeLeadAnswers()`
sanea lo que llega, `qualifyLead()` puntúa de 0 a 100 y clasifica en segmento
A/B/C con `recommendedTier` y `recommendedFeatures`.

El formulario manda **solo las respuestas crudas** (`weeklyOrders`,
`averageTicket`, `channels`, `biggestPain`) más el nombre del restaurante.
**Nunca manda el puntaje.** El servidor lo vuelve a derivar con la misma función
antes de guardarlo, así que un lead no puede inflarse el diagnóstico. Hay un
test que manda `score: 100` en el body y comprueba que se guarda el valor real.

> **Bug real corregido.** `normalizeLeadAnswers()` dejaba `usesDeliveryApp` en
> `false` cuando el navegador no mandaba ese flag pero sí incluía
> `"apps_delivery"` en `channels`. El navegador infería `true` del canal y el
> servidor guardaba `false`: los dos diagnósticos discrepaban. Ahora el flag
> explícito manda si viene y, si no, se infiere del canal.

#### Migración `00131_leads_b2b.sql`

**Hallazgo crítico.** `00049_leads.sql` tiene
`CONSTRAINT leads_source_check CHECK (source IN ('checkout_drawer','exit_intent'))`.
El source nuevo (`restaurantes_landing`) habría violado el CHECK… y como
`POST /api/leads` es **fail-open**, la ruta habría respondido 200 y **tirado
cada lead en silencio**. La migración recrea el CHECK, añade `restaurant_name
TEXT` y `qualification JSONB`, y crea `idx_leads_source_created_at (source,
created_at DESC)`.

`getAdminLeads()` selecciona las dos columnas nuevas y `/admin/leads` gana la
columna **"Restaurante / diagnóstico"** (`Segmento A (86/100) · nivel Diamante`,
con los motivos en el `title`).

#### Admin de restaurantes

`getAdminFoodosRestaurants()` (`src/app/admin/actions.ts`) lista hasta 200
restaurantes con su nivel ganado, su nivel efectivo, las semanas calificadas del
mes, el gasto de la semana en curso, las capacidades abiertas y el uso real
(sesiones y mensajes de IA, entregas).

**Dos consultas, no N.** El nivel se calcula en memoria: lee todas las órdenes
pagadas de la ventana de 45 días y todos los overrides, agrupa las órdenes **por
dueño** (el nivel es del dueño, no del restaurante) y aplica
`earnedTierFromOrders()`. Consultar restaurante por restaurante serían 200
round-trips.

**El correo del dueño sale de `auth.users`, no de `profiles`.** `profiles` no
tiene columna `email` (migración `00001_initial_schema.sql`); se resuelve con
`supabase.auth.admin.listUsers({ page, perPage })` y se filtra por id.

`setFoodosTierOverride(id, tier, reason?, expiresAt?)` valida el nivel con
`isCashbackTier()` y **conceder `Verde` revoca**: borra el override en vez de
escribirlo, porque `effectiveTier()` ya ignora un override en Verde. Cualquier
otro nivel hace `upsert` con `granted_by` y motivo recortado a 500 caracteres.
Hay 14 tests (`src/app/admin/restaurantes.test.ts`) que cubren el gate de admin,
el cálculo por dueño, el override vigente y el expirado, la agregación de uso, el
correo desde `auth.users` y las dos ramas de la concesión.

#### `/recompensas` se queda como está

`src/app/recompensas/` es un prototipo de 24 archivos con datos mock, enlazado
desde el header, el banner de promos, el saludo de la tienda, el CTA del blog, el
sidebar del panel y la landing de ciudad. **Decisión: no se migra ni se borra.**
Es una superficie de marketing distinta de FoodOS; tocarla rompería seis enlaces
y no aporta nada a la paridad. La calculadora de esta fase es un componente
nuevo, no una reescritura de aquella.

**Archivos de la fase**

- `src/lib/roi-calculator.ts` (+ `roi-calculator.test.ts`, 16 tests)
- `src/lib/lead-qualification.ts` (+ `lead-qualification.test.ts`, 28 tests)
- `src/lib/foodos-entitlements.ts` — `PUBLIC_TIER_LADDER` y `PublicTierInfo`
  (derivados), re-export de `QUALIFYING_WEEK_MIN` (+7 tests)
- `src/lib/wallet-progress.ts` — `TIER_LADDER` pasa a ser exportado
- `src/app/restaurantes/{page.tsx,roi-calculator.tsx,lead-qualifier.tsx}`
- `src/app/api/leads/route.ts` — source nuevo + diagnóstico derivado en servidor
- `supabase/migrations/00131_leads_b2b.sql`
- `src/app/admin/actions.ts` — `getAdminFoodosRestaurants()`,
  `setFoodosTierOverride()`, `AdminLeadQualification`
- `src/app/admin/restaurantes/page.tsx` + `src/app/admin/restaurantes.test.ts`
- `src/app/admin/leads/page.tsx` — columna de diagnóstico
- `src/app/admin/sub-nav.tsx` — entrada "Restaurantes" en el grupo Clientes

### ✅ Fase 9 — Transversal: medición, dedupe, e2e y docs

Cierra el programa: mide la adopción real de lo construido, garantiza que un
cliente no reciba dos veces el mismo mensaje, y fija con e2e que las superficies
nuevas no se rompen.

#### Un cliente no recibe dos veces el mismo mensaje el mismo día

FoodOS tiene **dos motores de mensajería** que se pisaban. No se fusionan —tienen
dueños, configuraciones y bitácoras distintas—, pero **comparten el dedupe**:

| | plataforma | restaurante |
|---|---|---|
| Configuración | `whatsapp_automations` (admin) | `foodos_automations` (dueño) |
| Destinatarios | clientes del marketplace | clientes del restaurante |
| Bitácora | `whatsapp_automation_sends` | `foodos_campaigns` (hijas) |
| Envío | WhatsApp Cloud API directa | `messaging/send` (canal + SMS) |

Cuatro intenciones existen en los dos lados con nombres distintos, y son las que
se deduplican:

| Intención | plataforma | restaurante |
|---|---|---|
| Cumpleaños | `birthday` | `birthday` |
| Carrito abandonado | `cart_abandonment` | `abandoned_cart` |
| Reactivación | `reactivation` | `winback` |
| Reseña post-entrega | `post_delivery_rating` | `review_request` |

Los tipos que solo existen del lado del restaurante (`order_confirmation`,
`thank_you`, `season_promo`, `off_hours`, `new_product`) no compiten con nada y
no entran al mapa. `payment_recovery` es de la plataforma y lo corre
`src/lib/workflows.ts`, no el job diario.

`src/lib/messaging/dedupe.ts` es **puro** (47 tests) y exporta las dos
direcciones:

- `alreadySentByPlatform({ sends, restaurantType, recipient, timezone, now })` —
  la consulta el motor del restaurante antes de enviar.
- `alreadySentByRestaurant({ sends, platformType, recipient, timezone, now })` —
  la consulta el motor de la plataforma.

La identidad del destinatario se compara con `recipientIdentity()`, que colapsa
10 dígitos, `52`+10 y `521`+10 al mismo número nacional (el WhatsApp mexicano
llega indistintamente en las tres formas). Un número con menos de 10 dígitos no
tiene identidad y no se deduplica. El "mismo día" es **día local de
`America/Mexico_City`**, no UTC: un envío de las 23:00 y otro de las 01:00 son
días distintos para el cliente.

**El dedupe cruzado no consulta por `dedupe_key`** a propósito.
`whatsapp_automation_sends` tiene `UNIQUE (dedupe_key)` para el dedupe *interno*
de la plataforma, pero entre motores la clave no es comparable (cada lado
nombra distinto la intención): se compara por identidad de número y día local.

Orden del cron diario (`src/app/api/cron/daily/route.ts`):
`foodos-campaigns` corre **antes** que `whatsapp-automations`, así que el motor
del restaurante suele ganar el día y el de la plataforma cede.

#### KPIs de adopción por capacidad

`src/lib/foodos-adoption.ts` es **puro** (36 tests). `bucketUsage()` parte una
lista de timestamps en tres cubos —últimos 7 días, los 7 anteriores, y el total
acumulado— ignorando timestamps inválidos. `computeFeatureAdoption()` cruza los
restaurantes con la actividad por capacidad y respeta el orden de
`FOODOS_FEATURE_ORDER`. `summarizeAdoption()` devuelve restaurantes activos
(usaron algo en 7 días) y **dormidos** (tienen capacidades abiertas y cero usos
históricos: pagaron el nivel y no lo aprovechan).

`getAdminFoodosAdoption()` (`src/app/admin/actions.ts`) lee **una consulta por
capacidad**, acotada a los restaurantes listados y a `ADOPTION_ACTIVITY_LIMIT =
5000` filas:

| Capacidad | Fuente |
|---|---|
| Marketing IA | `foodos_campaigns.sent_at` |
| Flotilla | `foodos_deliveries.created_at` |
| Mesero IA | `foodos_ai_sessions.created_at` |
| Wallet | `foodos_wallet_passes.created_at` |
| Sitio IA | `foodos_seo_pages.approved_at` (solo no nulos) |
| POS | `foodos_pos_sync_log.created_at` (solo `status = 'ok'`) |
| Catering | `foodos_catering_requests.created_at` |

`foodos_seo_pages.approved_at` necesita `.not(col, "is", null)` porque **en
Postgres los NULL van primero en un `ORDER BY … DESC`**: sin el filtro, el tope
de filas se llenaría de borradores y el KPI quedaría en cero.

**`app_marca` no se mide.** No tiene tabla de telemetría (es el manifest PWA),
así que se devuelve en `untracked` y la UI lo dice en vez de fingir un cero. Sí
cuenta para el promedio de capacidades abiertas.

`AdoptionPanel` (`src/app/admin/restaurantes/page.tsx`) pinta las siete
capacidades con uso reciente, tendencia y adopción, más el resumen.

> **Bug real corregido.** `averageUnlocked` usaba el helper de porcentaje y
> devolvía `800` con un solo restaurante Diamante. Ahora es el **promedio** de
> capacidades por restaurante, con un decimal y guardia para lista vacía.

#### e2e de las superficies nuevas

`e2e/foodos.spec.ts` (18 tests, `@ci`) cubre las tres superficies que la fase
tocó, y corre en los dos proyectos de Playwright (`chromium` y
`mobile-chromium`): 32 ejecuciones verdes.

1. **Landing `/restaurantes`**: hero, anclas de las secciones, la calculadora
   (se compara el texto de la tarjeta **antes y después** de cambiar un campo),
   el calificador (se pulsa un canal y se lee el segmento) y ausencia de
   overflow a 375 px.
2. **Guards de las capacidades premium**: `POST /api/foodos/orders` y
   `POST /api/foodos/catering/request` con cuerpo vacío, las siete rutas
   `/panel/foodos/*` y `/admin/restaurantes`.
3. **Micrositio `/r/[slug]`**: un slug inexistente y su `/carta` no renderizan
   restaurante.

Dos hallazgos que cambiaron cómo están escritos los tests:

- **`GET /r/<slug-inexistente>` responde 200**, no 404: Next sirve el armazón del
  not-found en streaming y el segmento dinámico se renderiza bajo demanda. El
  test verifica la **invariante** —el comensal no ve un restaurante— con
  `heading "404"` visible y **cero** enlaces "Agregar", en vez del status.
- **`innerText` en Playwright respeta `text-transform`.** Las etiquetas de la
  calculadora salen en mayúsculas por CSS, así que el assert compara contra
  `.toUpperCase()`.

`GUARDED_CODES = [400, 401, 403, 500]`: `/api/foodos/orders` crea el cliente de
servicio como primera instrucción, así que **sin `SUPABASE_SERVICE_ROLE_KEY`
responde 500** (a diferencia de `/api/orders`, que valida con zod antes y
devuelve 400). Los guards aceptan 500 y, cuando no es 500, exigen un mensaje de
error y que no se filtre `requestId`.

Los guards además comprueban que la página **no** contenga "Algo salió mal": el
error boundary de Next responde **200** con su propia pantalla, así que un
`status < 500` por sí solo no distingue una degradación correcta de un reventón.

#### Bug real corregido: `/panel` reventaba sin Supabase configurado

`getMyEntitlements()` (`src/lib/foodos-tier.ts`) llamaba a `createClient()` sin
comprobar la configuración, y `src/lib/supabase/server.ts` **lanza** cuando
Supabase no está configurado. Como `src/app/panel/layout.tsx` lo invoca en el
render, `/panel` devolvía el error boundary ("Algo salió mal") en vez del panel.

Lo delataba una **dependencia circular de módulos**: `supabase/server.ts` importa
`@/lib/foodos` (para re-exportar `formatMoney`) y `foodos-tier.ts` importa
`supabase/server.ts`, así que el mismo módulo cargado desde el layout no
resolvía igual que cargado desde una server action.

El patrón ya existía en `getUserRole()` (`src/lib/roles.ts`): sin Supabase no
puede haber sesión, así que se devuelve un estado vacío en lugar de lanzar. Ahora
`getMyEntitlements()` hace lo mismo (`isSupabaseConfigured()` →
`EMPTY_STATE`, nivel Verde). Lo cubre un test de regresión en
`src/lib/foodos-tier.test.ts` que además comprueba que **no se toca la red**.

#### Observabilidad: trazas durables donde el fallo desaparecía

La bitácora de errores (`error_logs`, migración `00054`) ya tenía las dos puntas
del camino: la ingesta de cliente (`POST /api/log-error` +
`src/lib/report-client-error.ts`) y la lectura admin (`src/lib/admin-errors.ts`
→ `/admin/bitacoras`). Lo que faltaba era la **ingesta de servidor**.

| Pieza | Módulo | Estado |
| --- | --- | --- |
| Ingesta de cliente | `src/app/api/log-error/route.ts` | preexistente |
| Cliente del endpoint | `src/lib/report-client-error.ts` | preexistente |
| Lectura admin | `src/lib/admin-errors.ts` → `errores-tab.tsx` | preexistente |
| **Ingesta de servidor** | **`src/lib/error-log.ts`** | **nuevo** |
| Trazas de IA (tokens) | `foodos_ai_usage` (`00121`) | tabla viva, **sin lectores en TypeScript** |

`reportServerError()` inserta con `source: "server"`, trunca el mensaje a 5 000
y el stack a 10 000, y **nunca lanza**: sin Supabase configurado descarta el
reporte con un `logger.warn`, y si el propio insert falla, también. Devuelve
`false` cuando descarta, para que el llamador pueda distinguirlo.

**No se cablearon `src/lib/pos` ni `src/lib/messaging`.** Esas capas ya escriben
su estado de fallo en tablas de negocio que el panel muestra
(`foodos_pos_sync_log` con `status = 'failed'`, `foodos_campaigns` con
`status = 'failed'`); duplicarlas en `error_logs` sería ruido. Se cablearon solo
los dos caminos donde el fallo **desaparece por completo**:

- **IA** (`src/lib/ai/llm.ts`, catch de `runCall`): la degradación a plantilla es
  silenciosa por diseño, así que sin traza nadie se entera de que el proveedor
  lleva días caído. `url: "foodos:ia"`, con `feature`, `adapter`, `model` y
  `restaurantId`.
- **Flotilla** (`dispatchFlotillaToProvider`, `src/app/panel/foodos/actions.ts`):
  la entrega se queda sin repartidor y el dueño no ve un error de proveedor.
  `severity: "warn"`, `url: "foodos:flotilla"`, con restaurante y entrega.

**Lección de diseño (bug real encontrado al escribir los tests).** El contrato
"nunca lanza" de un módulo de observabilidad **no basta**: el llamador que a su
vez promete "nunca lanza" —como `runCall`, que garantiza degradar a plantilla—
debe envolver la llamada en su propio `try/catch`. El test lo destapó: un
`reportServerError` que rechazaba rompía esa promesa. De ahí la invariante de
abajo: quien invoca la observabilidad la blinda.

**Archivos de la fase**

- `src/lib/error-log.ts` (+ `error-log.test.ts`, 11 tests)
- `src/lib/ai/llm.ts` — traza en el catch de `runCall` (+ 2 tests en `llm.test.ts`)
- `src/app/panel/foodos/actions.ts` — traza en `dispatchFlotillaToProvider`
- `src/lib/messaging/dedupe.ts` (+ `dedupe.test.ts`, 47 tests)
- `src/lib/foodos-campaigns.ts` — dedupe restaurante → plataforma,
  `skippedByPlatform`, `loadPlatformSendsForToday` (29 tests)
- `src/lib/whatsapp-automations-engine.ts` — dedupe plataforma → restaurante,
  `restaurantSends`, `loadRestaurantSends` (ventana 48 h)
- `src/lib/local-date.ts` — `DEFAULT_TIMEZONE` pasa a exportado
- `src/lib/foodos-adoption.ts` (+ `foodos-adoption.test.ts`, 36 tests)
- `src/app/admin/actions.ts` — `getAdminFoodosAdoption()`, `ADOPTION_SOURCES`
- `src/app/admin/restaurantes/page.tsx` — `AdoptionPanel`
- `src/app/admin/restaurantes.test.ts` — 23 tests
- `src/lib/foodos-tier.ts` — guard `isSupabaseConfigured()` + test de regresión
- `e2e/foodos.spec.ts`

## Paridad completa

Las nueve fases están cerradas. FluxSales vende como producto separado lo que
aquí es una capacidad de FoodOS que se **desbloquea comprando en el
marketplace**; no queda alcance pendiente del roadmap original.

## Invariantes

- **Prerender estático**: ninguna página pública lee `cookies()`/`headers()`.
- **Un solo productor de totales y de cashback**: `createFoodosOrder`
  (`src/lib/foodos-order-create.ts`) es el único lugar que valida un pedido y
  calcula totales; lo comparten el micrositio público (`POST /api/foodos/orders`
  es un envoltorio delgado con rate limit) y el Mesero IA. Nunca confía en el
  cliente: precios, combos, modificadores, cupones, propina, puntos y crédito se
  recalculan contra la base. El nivel sale solo de `computeWeekProgress`.
- **La IA no fija precios**: el LLM solo reescribe tono, nunca estructura. Las
  respuestas con importes son literales.
- **El diagnóstico del lead lo deriva el servidor**: el navegador manda
  respuestas crudas, nunca el puntaje ni el segmento.
- **Móvil primero**: 44 px, safe-area insets, `overscroll-contain`.
- **Reduced motion**: toda animación nueva entra en
  `@media (prefers-reduced-motion: reduce)`.
- **Sin credenciales externas el producto funciona**: IA con plantillas, SMS y
  Uber Direct con stub, Wallet con tarjeta de respaldo, POS vía CSV.
- **Un cliente no recibe dos veces el mismo tipo de mensaje el mismo día**,
  aunque venga de los dos motores de mensajería (`src/lib/messaging/dedupe.ts`).
  La identidad es el número nacional; el día es local de `America/Mexico_City`.
- **Los dos motores de mensajería no se fusionan**: se unifica el dedupe, no la
  configuración ni la bitácora.
- **Toda lectura de Supabase en una ruta de render degrada, no lanza**: los
  layouts y server components comprueban `isSupabaseConfigured()` y devuelven un
  estado vacío, para que un entorno sin secrets no reviente la página.
- **La observabilidad nunca lanza** (`src/lib/error-log.ts`) **y quien la
  invoca la envuelve en su propio `try/catch`**: el contrato "nunca lanza" de un
  módulo no protege la promesa de quien lo llama.
- Todo texto nuevo de panel pasa por `t()`.

## Verificación por fase

```
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Además, `npm run test:e2e` (Playwright) cubre el smoke de las superficies
públicas y los guards. Los specs corren contra un dev server real: en frío, la
primera compilación de una ruta puede superar el timeout de 30 s por test, así
que conviene calentarlas antes de juzgar un fallo.

Dos notas para leer un fallo de e2e sin perder tiempo:

- **El error boundary de Next responde `200`**, y `GET /r/<slug-inexistente>`
  también devuelve `200` con el cuerpo del `not-found`. Por eso los guards
  comprueban el **contenido** (que no aparezca "Algo salió mal") y no el status.
- **En CI no hay `SUPABASE_SERVICE_ROLE_KEY`**: las rutas que abren el cliente de
  servicio responden `500` sin llegar a validar, así que los guards aceptan 500.

Las 12 migraciones del programa (`00120`–`00131`) están documentadas en
`supabase/ESQUEMA.md`.
