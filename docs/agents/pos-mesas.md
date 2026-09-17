# Agente: Punto de venta y comandero

Programa de paridad con [maspedidos.com](../foodos-paridad-maspedidos.md). Es el
único agente que **escribe** pedidos que no vienen de un comensal: un cajero, un
mesero o el marketplace. Antes de tocar cualquiera de estas superficies, lee
también [panel.md](panel.md) (roles y gating) y [ux-movil.md](ux-movil.md) (rail
inferior y 44px), porque hereda las reglas de ambos.

## Posee
- `src/app/panel/foodos/mostrador/**`, `src/app/panel/foodos/mesas/**`,
  `src/app/panel/foodos/caja/**`, `src/app/panel/foodos/tablero/**`,
  `src/app/panel/foodos/pedidos/**`
- `src/lib/foodos-order-create.ts` (el productor único de pedidos)
- `src/lib/foodos-cash.ts`, `src/lib/foodos-tables.ts`,
  `src/lib/foodos-payments.ts`, `src/lib/foodos-reportes.ts`,
  `src/lib/foodos-shift.ts`, `src/lib/foodos-owner.ts`
- `src/lib/foodos-printing/**`
- `src/lib/foodos.ts` — **compartido con el marketplace**: `channelLabel`,
  `FOODOS_ORDER_CHANNELS`, `resolveOrderChannel`, `cartLineKey`, `formatMoney`
- `src/lib/panel-roles.ts` — **compartido**: `FOODOS_SURFACE_ACCESS` es la parte
  de este dominio; `TOOL_ACCESS` no se toca sin revisar [panel.md](panel.md)

## Invariantes

- **Todo pedido pasa por `createFoodosOrder`.** Ninguna superficie inserta en
  `foodos_orders` a mano. El tercer parámetro, `options: FoodosOrderOptions`, es
  el único canal para datos que solo conoce el servidor (folio, turno, cajero,
  desglose de cobro, `sendToKitchen`). **Nunca moverlos a `FoodosOrderBody`**: el
  body lo controla el cliente y ahí ya no serían confiables.
- **El folio se reserva con `foodos_next_folio`, nunca con un `max(folio) + 1`.**
  Un folio ya reservado **no se libera** aunque la venta falle: es preferible un
  hueco en el consecutivo a reutilizar un número que pudo imprimirse. No agregar
  una ruta de "liberar folio" ni un contador en JS.
- **La regla de ingreso es una sola: `payment_status === "paid"`.** Una cuenta de
  mesa deja una fila por cada envío a cocina (`pending`, sin folio, nunca se
  cobra) y una fila al cerrar (`paid`). Contar filas en vez de pagos ya produjo un
  reporte que mentía a la baja; no repetirlo.
- **La aritmética vive en los módulos puros, no en las páginas.**
  `foodos-cash.ts`, `foodos-tables.ts`, `foodos-payments.ts` y
  `foodos-reportes.ts` son puros y con tests; las páginas solo pintan. En dinero
  se trabaja **en centavos enteros** (`toCents`/`fromCents`), nunca en `number`
  con decimales.
- **El alcance por sucursal es `branchId ? eq("branch_id", branchId) : is("branch_id", null)`**,
  jamás `eq(..., null)`: en Postgres `= NULL` no compara con `NULL`, y el fallo
  sería silencioso (turnos "sin sucursal" invisibles).
- **El día de negocio se deriva con `dayKeyOf` / `DEFAULT_TIMEZONE`**
  (`src/lib/local-date.ts`), nunca con `toISOString().slice(0, 10)`. La hora del
  ticket y el folio usan `America/Mexico_City`; un ticket de las 23:50 con la hora
  del runtime muestra el día siguiente. (Regla 8 del [README](README.md).)
- **Gate en dos capas y en ese orden**: `requireFoodosFeature` (nivel) **antes**
  de `requireAuth` en cada server action, y además `canAccessPanelHref` (rol) en
  la navegación. Los roles son **fail-closed**: una superficie que no está en
  `FOODOS_SURFACE_ACCESS` no se abre, y un rol desconocido se resuelve a `mesero`.
  `canAccessPanelHref` delega en `canAccessFoodosSurface` **solo** cuando la clave
  de herramienta es `foodos`; quitar ese corte rompe `/panel/mermas` para cocina.
- **El productor no escribe `customer_phone` en un pedido de mesa.** El trigger
  `trg_foodos_order_customer` (00023) hace upsert de cliente con ese campo y una
  mesa no tiene cliente.
- **Imprimir no recalcula.** `buildTicketLines` imprime lo que el pedido ya tiene;
  si el ticket recalculara precios podría no cuadrar con lo cobrado.
  `resolveFolio` cae al `id` corto si el folio viene vacío.
- **Ninguna cotización crea un pedido.** `quoteMostradorDelivery` (y cualquier
  previsualización futura) no inserta filas ni reserva folio.
- **Una venta de mostrador nace pagada** (`settled: true`): nadie cierra una venta
  de mostrador sin haber cobrado.
- **Cobro combinado**: `mixed` es un pseudo-método derivado;
  `isPaymentMethod("mixed")` es `false`. Un desglose y un `payment_method` suelto
  son mutuamente excluyentes, y la acción lo rechaza.
- **Cualquier flotante nuevo usa `--floating-bottom-offset` y registra su clase de
  colisión** en `globals.css` (patrón `body.has-mostrador-ticket-bar`). La barra de
  ticket de mostrador es el ejemplo; mesas y caja no tienen flotante y por eso solo
  reservan el offset con `pb-[calc(var(--floating-bottom-offset)+…)]`.
- **Controles táctiles de 44px** (`min-h-[40px]` como mínimo en los chips de
  filtro) y `overscroll-contain` en las hojas con scroll propio.
- **`foodos_orders.channel` no tiene CHECK.** Agregar un canal es agregar un valor
  a `FoodosOrderChannel` y su etiqueta a `CHANNEL_LABELS` en `src/lib/foodos.ts`
  — **la misma tabla para quien escribe el canal y quien lo pinta**. Antes la
  lista de pedidos imprimía el slug crudo y una venta de mostrador decía
  "MOSTRADOR".
- **Los reportes se piden con `getFoodosReportData`**, no con
  `getFoodosPanelData` (que devuelve las últimas 200 filas sin importar la fecha y
  trunca cualquier rango en silencio). Si se cambia el tope de 5,000 filas, la
  bandera `truncated` debe seguir siendo honesta.

## Verificación
```
rm -rf .next/dev/types && npx tsc --noEmit
npx eslint src/app/panel/foodos src/lib/foodos-*.ts src/lib/panel-roles.ts
npx vitest run src/lib/foodos-cash.test.ts src/lib/foodos-tables.test.ts \
  src/lib/foodos-payments.test.ts src/lib/foodos-order-create.test.ts \
  src/lib/foodos-reportes.test.ts src/lib/foodos-printing \
  src/lib/panel-roles.test.ts
E2E_PORT=3100 npx playwright test e2e/foodos-pos.spec.ts e2e/foodos.spec.ts
npm run lint && npm run build
```

`src/lib/i18n/locale.test.ts` exige paridad **bidireccional** es↔en y la igualdad de
marcadores por clave, pero no sabe si una clave que la página pide existe: al
tocar una página, compara las claves `t("…")` del archivo contra el objeto `es`
(`src/lib/i18n/es.ts`) antes de dar por cerrada la tarea. `TranslationKey` es
`string`, así que una clave mal escrita **no falla el build**; se pinta la clave
cruda en la interfaz.

**El e2e no autentica.** El repo no tiene seed ni credenciales de e2e
(`e2e/global-setup.ts` solo calienta rutas), así que un flujo completo —abrir
turno → vender → imprimir, o abrir mesa → mandar a cocina → cerrar cuenta— **no
se puede ejercer ahí**. Lo que el e2e sí fija es que ningún anónimo reciba datos
del punto de venta, que `/comer` renderice sin backend y que un slug inexistente
dé 404 real. La aritmética de esos flujos se prueba en unitarios, que es donde se
puede fijar de verdad. Si algún día se agrega un seed, el lugar correcto para el
flujo completo es un spec nuevo, no engordar el de guards.

Si tocas una página: los helpers de i18n de `foodos-reportes.ts`
(`FULFILLMENT_LABELS`, `PAYMENT_METHOD_LABELS`) siguen en español fijo y en `en`
se ven en español. Es deuda conocida y acotada — no la "arregles" a medias
traduciendo solo una de las dos.
