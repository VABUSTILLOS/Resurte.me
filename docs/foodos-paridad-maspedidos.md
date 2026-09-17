# Paridad FoodOS ↔ Maspedidos

Roadmap para incorporar a FoodOS las capacidades de
[maspedidos.com](https://www.maspedidos.com) (POS para restaurantes en México,
SvelteKit, +1300 negocios): **venta de mostrador, comandero de mesas con mapa
visual, corte de caja con arqueo, impresión de tickets y comandas**, y la vuelta
que le faltaba al marketplace **HoyQueComemos** — pedir sin salir del directorio.

**No se construye un producto paralelo.** Se extiende FoodOS. Las superficies
nuevas se desbloquean por **nivel de compra en el marketplace**, no por
suscripción.

## Modelo de desbloqueo

Sin cobro. El nivel del dueño se gana comprando en el marketplace (migración
`00029`: semanas calificantes de ≥ $2,500 MXN, hora de México, semana ISO).
Fuente única: `src/lib/wallet-progress.ts`. La lógica **no se duplica**.

| Nivel | Requisito | Aporta |
|---|---|---|
| **Verde** | 0 semanas | FoodOS base: menú, pedidos, QR, KDS, cupones, propina, SPEI, lealtad |
| **Plata** | 2 semanas | Marketing IA |
| **Oro** | 3 semanas | Flotilla |
| **Diamante** | 4 semanas | **`pos_mostrador` y `comandero`** (este programa), Mesero IA, Wallet, sitio IA |

Ambas capacidades nuevas son **Diamante**: `pos_mostrador` y `comandero` viven en
`FOODOS_FEATURES` (`src/lib/foodos-entitlements.ts`) y se verifican en el
servidor con `requireFoodosFeature` antes de cualquier lectura o escritura.

## El productor único de pedidos

Toda venta —marketplace, mostrador, mesa o WhatsApp— pasa por
`createFoodosOrder(supabase, body, options?)` en `src/lib/foodos-order-create.ts`.
Es la razón por la que este programa no duplicó el cálculo de totales ni la
validación de líneas: agregar un canal nuevo fue agregar un valor a
`FoodosOrderChannel`, no una ruta paralela.

- `MAX_LINES = 20`, `MAX_QTY_PER_LINE = 50`. El cliente nunca decide un precio.
- El tercer parámetro, `options: FoodosOrderOptions`, es el **único** canal para
  datos que solo existen en el servidor: `folio`, turno, cajero, desglose de
  cobro y `sendToKitchen`. **No se mueven a `FoodosOrderBody`**, porque el body
  lo controla el cliente.
- `foodos_orders.channel` **no tiene CHECK**: los seis canales conviven en la
  misma tabla y el mismo productor.

## Estado

### ✅ Fase 0 — Fundaciones

- `src/lib/foodos-entitlements.ts` — `pos_mostrador` y `comandero`, ambos
  Diamante. Al agregarlos se rompen por exhaustividad tres mapas
  `Record<FoodosFeature, …>`: `ADOPTION_SOURCES` (`admin/actions.ts`),
  `FEATURE_LABEL` (`admin/restaurantes/page.tsx`) y `FEATURE_COPY`
  (`restaurantes/page.tsx`). Es el precio de tener un catálogo tipado.
- `supabase/migrations/00136_foodos_mostrador_mesas.sql` — 6 tablas
  (`foodos_pos_shifts`, `foodos_pos_shift_movements`, `foodos_table_zones`,
  `foodos_tables`, `foodos_table_tickets`, `foodos_order_folios`), 5 columnas en
  `foodos_orders` (`folio`, `cashier_user_id`, `pos_shift_id`, `table_ticket_id`,
  `payment_breakdown`), la función `foodos_next_folio` y 4 índices únicos
  parciales. RLS `FOR ALL` por dueño en las 6 tablas.
- `src/types/foodos.ts` — `FoodosOrderChannel` gana `mostrador`, `mesero` y
  `marketplace`; `FoodosPosContext` documenta que el folio y el turno pueden ser
  nulos y por qué.

### ✅ Fase 1 — POS de mostrador (`/panel/foodos/mostrador`)

- `src/lib/foodos-payments.ts` — métodos canónicos
  (`cash`, `card`, `transfer`, `branch`, `whatsapp`), cobro combinado
  (`mixed` es un pseudo-método derivado: `isPaymentMethod("mixed")` es `false`),
  `derivePaymentMethod`, `derivePaymentStatus`. Aritmética en **centavos
  enteros**.
- `src/app/panel/foodos/mostrador-actions.ts` — `getMostradorData`,
  `createMostradorSale`, `quoteMostradorDelivery`.
  **Nunca se cotiza creando un pedido**: previsualizar un total no puede dejar
  basura en la tabla ni quemar un folio.
- `src/app/panel/foodos/mostrador/page.tsx` (~57 KB) — rejilla táctil, cobro
  combinado, cambio de efectivo, propina, cliente y entrega a domicilio.
  Barra flotante de ticket con `body.has-mostrador-ticket-bar` para no chocar con
  el rail inferior.
- Una venta de mostrador **siempre** nace pagada (`settled: true`): nadie cierra
  una venta de mostrador sin haber cobrado.

### ✅ Fase 2 — Comandero de mesas (`/panel/foodos/mesas`)

- `src/lib/foodos-tables.ts` (puro) — `tableStatus`, `openTicketByTable`,
  `billableOrders`, `accountTotals`, `aggregateAccountItems`, `splitCents`,
  `clampPosition`, `elapsedMinutes`.
- Modelo de filas: **una comanda por cada envío a cocina** (`payment_status =
  "pending"`, `channel = "mesero"`, sin folio, nunca se cobra) y **una fila final
  al cerrar la cuenta** (`paid`, con folio). Los ingresos se cuentan por
  `payment_status = "paid"`, **jamás por número de filas**.
- Dos decisiones que salieron de los tests y no del diseño:
  - `accountLineKey` incluye el **precio unitario**. Si el menú cambia a mitad de
    la comida, la cuenta no puede discrepar de lo que ya se cobró.
  - `clampPosition` recorta **antes** de comprobar finitud, para que ±Infinity
    caiga en el borde correcto y solo `NaN` use el valor por defecto.
- Un pedido de mesa **no** pasa `customer_phone`: el trigger
  `trg_foodos_order_customer` (00023) hace upsert de cliente con ese campo, y una
  mesa no tiene cliente.
- `00137_foodos_mesas_cuenta.sql` — `billing_requested_at` (la mesa pidió la
  cuenta: la UI lo muestra distinto, pero no bloquea nada).

### ✅ Fase 3 — Corte de caja y arqueo (`/panel/foodos/caja`)

- `src/lib/foodos-cash.ts` (puro) — `toCents`/`fromCents`,
  `MXN_DENOMINATIONS` + `sumDenominations` (arqueo por denominación, no un
  número tecleado), `computeExpectedCash`, `arqueoStatus`
  (`ok` / `short` / `over`), `cashPartOfSale` (el desglose manda; si no hay
  desglose, solo `payment_method === "cash"` cuenta como efectivo),
  `cashSalesFromOrders` (filtra `paid` **primero**), `shiftHistoryRows`,
  `shiftHistoryCsv`.
- `src/lib/foodos-shift.ts` — `requireOpenShift` (lanza `NoOpenShiftError`,
  código `FOODOS_NO_OPEN_SHIFT`), `listShifts`,
  `listRestaurantShifts` (todas las sucursales).
  **El alcance de sucursal es siempre `branchId ? eq(...) : is(null)`, nunca
  `eq(null)`**: `eq` con nulo no compara con `NULL` en Postgres, y el error
  habría sido silencioso — un turno "sin sucursal" invisible.
- `src/app/panel/foodos/caja/page.tsx` (~30 KB) — apertura con fondo, movimientos
  de caja, arqueo por denominación, cierre y diferencia.
  `arqueo` es `null` mientras el turno está abierto: no hay nada que comparar.

### ✅ Fase 4 — Impresión de tickets y comandas

- `src/lib/foodos-printing/` — `tickets.ts` (`buildTicketLines`, `resolveFolio`),
  `printers.ts`, `types.ts`. **No recalcula precios**: imprime lo que el pedido
  ya tiene, o el ticket podría no cuadrar con el cobro.
- Se abandonó el agrupamiento por estación: **el campo `station`/`estacion` no
  existe** en el modelo. Agrupar por algo que no se guarda es inventarlo.
- `resolveFolio` cae al `id` corto si el folio viene vacío: un ticket sin folio
  es peor que un ticket con folio feo.
- Página `/panel/foodos/pedidos/[id]/print?kind=customer|kitchen&auto=1`.
  Impresión por navegador (hoja de 80 mm + `auto=1`); el adaptador Bluetooth/USB
  queda detrás de la misma interfaz.
- La hora del ticket usa **`America/Mexico_City`**, igual que el folio
  (`foodos_next_folio`). Un ticket de las 23:50 con la hora del runtime mostraría
  el día siguiente.

### ✅ Fase 5 — Marketplace HoyQueComemos transaccional

- `src/hooks/use-foodos-cart.ts` — el carrito por restaurante, extraído para que
  el micrositio (`/r/[slug]`) y el directorio (`/comer/[slug]`) compartan estado,
  persistencia y límites.
- `src/app/comer/[slug]/` — la ficha dentro del directorio. `revalidate = 300`,
  `generateStaticParams` y `generateMetadata` con canónica a `/r/[slug]`: la
  misma carta servida por dos rutas no puede competir consigo misma en SEO.
- `?platillo=` resalta el platillo buscado y hace scroll hasta él. El directorio
  enlaza con el plato ya elegido (`matchDish` → `Pedir <platillo>`).
- `resolveOrderChannel({ origin, paymentMethod, tableNumber })` — **marketplace
  gana**: un pedido nacido en el directorio cuenta como marketplace aunque se
  cierre por WhatsApp, porque lo que se mide es de dónde vino el comensal.

### ✅ Fase 6 — Reportes, roles y multi-sucursal

- `src/lib/foodos-reportes.ts` (puro) — `computeReport`, `computeDailyClose`,
  `dailyCloseCsv`, `shiftOptions`, `paymentMethodLabel`. Aritmética en centavos.
  `avgTicket` divide entre **pagados**, nunca entre filas: la versión anterior
  contaba pedidos `pending`/`processing` como ingreso y promediaba sobre todas
  las filas, y por eso el tablero mentía a la baja.
- `src/app/panel/foodos/tablero/actions.ts` — `getFoodosReportData`
  (ventana de fechas, filtro por sucursal, tope de 5,000 filas con bandera
  `truncated`). Existía un techo silencioso: el tablero leía las últimas 200
  filas sin importar el rango, así que un reporte de 90 días era una mentira con
  formato de tabla.
- **El día local tiene una sola autoridad** (`src/lib/local-date.ts`). El reporte
  agrupa por `dayKeyOf`, no por `toISOString()`.
- Roles: `PanelRole` gana `cajero` (`00138_panel_members_cajero.sql`). El
  `/panel/foodos/*` colapsa a **una** clave de herramienta (`toolKeyForPath`),
  así que se agregó una segunda capa, `FOODOS_SURFACE_ACCESS`
  (superficie × rol), y `canAccessPanelHref` es el único predicado de navegación.
  **Fail-closed**: una superficie que no está en el mapa no se abre, y un rol
  desconocido se resuelve a `mesero`, no a `gerente`.
- El rol se aplica en tres superficies; la fuga real estaba en
  `PanelMobileNav`, que filtraba por área y **no** por rol.
- `channelLabel` se centralizó en `src/lib/foodos.ts`, junto a
  `resolveOrderChannel`. Quien escribe el canal y quien lo pinta comparten una
  tabla: antes la lista de pedidos imprimía el slug crudo, así que una venta de
  mostrador decía "MOSTRADOR" en vez de "Mostrador".

### ✅ Fase 7 — Verificación y documentación

- Unitarios: folio (`resolveFolio`, folio nulo en comanda, folio en blanco),
  arqueo (`esperado`/`faltante`/`sobrante`), totales de mostrador delegados al
  productor, payload de impresión, gating por nivel y por rol.
- e2e `@ci`: `e2e/foodos-pos.spec.ts` y las rutas nuevas en el calentamiento de
  `e2e/global-setup.ts`. **El e2e no autentica** —el repo no tiene seed ni
  credenciales—, así que verifica lo que sí es verificable: que ningún anónimo
  reciba datos del punto de venta, que `/comer` renderice sin backend y que un
  slug inexistente dé **404 real** (un soft-404 indexa enlaces rotos).
- Documentación: este archivo, el playbook [pos-mesas.md](agents/pos-mesas.md) y
  las actualizaciones en `docs/PLAN-MEJORAS.md` y `docs/agents/README.md`.

## Decisiones que conviene conocer antes de tocar esto

1. **El folio se quema si la venta falla.** Se reserva con `foodos_next_folio`
   *después* de validar todo, pero si `createFoodosOrder` falla el número ya
   quedó reservado. Es deliberado: **nunca se reutiliza un folio** que pudo
   verse o imprimirse, y un hueco en el consecutivo es el precio correcto de esa
   garantía. No agregar una ruta de "liberar folio".
2. **`foodos_orders` guarda comandas y cuentas de mesa en la misma tabla.** La
   regla de ingreso es una sola: `payment_status === "paid"`. Cualquier reporte
   nuevo que cuente filas en vez de pagos repetirá el bug de la Fase 6.
3. **El tercer parámetro del productor es la frontera de confianza.** Lo que
   viene del cliente va en el body; lo que decide el servidor va en `options`.
4. **Las etiquetas de `foodos-reportes.ts` (`FULFILLMENT_LABELS`,
   `PAYMENT_METHOD_LABELS`) siguen en español fijo**, aunque la página esté
   internacionalizada. Es una deuda conocida y acotada: en `en` se ven en
   español. `CHANNEL_LABELS` sí es compartida.
5. **Los métodos de pago del listado de pedidos
   (`METHOD_LABEL` en `pedidos/page.tsx`) no son el conjunto canónico**
   (`cash`/`card`/`transfer`/`branch`/`whatsapp`/`oxxo`/`mixed`); la clave
   `efectivo` no corresponde a ningún slug real. Deuda conocida.

## Migraciones

| Migración | Contenido |
|---|---|
| `00136_foodos_mostrador_mesas.sql` | Turnos, movimientos, zonas, mesas, cuentas, folios, columnas POS y `foodos_next_folio` |
| `00137_foodos_mesas_cuenta.sql` | `foodos_table_tickets.billing_requested_at` |
| `00138_panel_members_cajero.sql` | Rol `cajero` en `panel_members_role_valid` |

Las tres son **idempotentes y aditivas**, están aplicadas en producción y están
registradas en `supabase_migrations.schema_migrations`, que debe ser
`00001`…`00138` (138 filas) y coincidir **exactamente** con los prefijos de
`supabase/migrations/`.

**Trampa del MCP.** `supabase-apply_migration` registra la migración con una
**versión timestamp generada** (`YYYYMMDDHHMMSS`, p. ej. `20260917143810`), no
con el prefijo del archivo. El CLI v2 exige que el historial remoto sea un
**prefijo de la lista local**, así que una fila timestamp suelta rompe
`npx supabase db push` con *"The remote database's migration history is not in
sync with the local migrations directory"*. Para migraciones futuras: aplicarla
con `supabase-execute_sql` (que **no** registra nada) y añadir la fila del
historial a mano, o corregir la `version` después. `db push` sólo compara
`version`; `name`, `statements` y `created_by` son informativos.

`db push` además exige sesión: `npx supabase login` (o `SUPABASE_ACCESS_TOKEN`)
y, sin enlace previo, la contraseña de la base.

**Estado verificado.** El historial está en sincronía: `npx supabase db push`
responde *"Remote database is up to date."* y `npx supabase migration list
--linked` lista las 138 migraciones con `local` == `remote` en todas, sin huecos
ni filas huérfanas. Ese es el comando para re-comprobar tras cualquier migración.
