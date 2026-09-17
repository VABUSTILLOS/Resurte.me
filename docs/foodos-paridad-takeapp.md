# Paridad FoodOS ↔ take.app

Auditoría de funcionalidades de take.app y estado de cobertura en FoodOS
(rama `paridad-takeapp-foodos`, migraciones `00078`–`00085`).

## Cubierto (preexistente)

- Menú digital público `/r/[slug]` con categorías, fotos, tags y destacados
- Carrito + checkout web con cross-sell/upsell y combos
- Pickup y delivery con fee/mínimo por sucursal
- QR del micrositio con tracking de canal (web/qr/whatsapp)
- Panel de pedidos con estados, CRM con segmentos, campañas/automatizaciones WhatsApp
- Pago con tarjeta (Stripe PaymentIntent)
- Tablero con ventas por canal y KPIs

## Añadido en esta iniciativa

### Fase A — núcleo de pedido
- **Modificadores/variantes**: grupos de opciones (requerido, min/max) con precio
  adicional; CRUD en `/panel/foodos/menu`, modal en el storefront, validación y
  recálculo server-side en `POST /api/foodos/orders`
- **Pedido por WhatsApp**: opción de checkout que registra el pedido (canal
  `whatsapp`) y abre `wa.me` con el mensaje estructurado (ítems, modificadores,
  totales, servicio, cliente)
- **Dine-in con QR por mesa**: activación por sucursal, campo de mesa en checkout,
  generador de QRs `/r/[slug]?mesa=N` en `/panel/foodos/restaurante`

### Fase B — operación
- **Horarios por sucursal** (`foodos_branch_hours` + timezone): banner de cerrado,
  bloqueo de checkout en cliente y rechazo server-side
- **Tracking público** `/r/[slug]/pedido/[id]` con timeline y polling (20 s)
- **Comanda realtime**: suscripción a `foodos_orders` con beep y badge de nuevos pedidos
- **Comanda imprimible** 80mm en `/panel/foodos/pedidos/[id]/print`

### Fase C — conversión
- **Tema de color** por restaurante (CTAs del storefront)
- **Cupones** (`foodos_coupons`): % o monto, mínimo, usos, expiración; validación
  en vivo (`/api/foodos/coupons/validate`) y server-side al crear el pedido
- **Propina** (10/15/otro) en totales y mensaje de WhatsApp
- **Transferencia SPEI**: CLABE del restaurante, pedido queda pendiente de pago,
  "Marcar pagado" en la comanda
- **Menú por sucursal**: overrides de precio/disponibilidad
  (`foodos_branch_menu_overrides`) aplicados en storefront, API y panel

### Fase D — lealtad y comunidad
- **Programa de lealtad**: puntos por $100 gastados con valor de canje; trigger
  acredita al entregar; canje en checkout con débito del balance
- **Store credit** por cliente con ajuste manual desde el CRM
- **Reseñas** post-entrega desde el tracking (una por pedido), promedio y lista
  en el storefront, moderación en el panel
- **Wishlist** de favoritos por restaurante (localStorage)

### Fase E — operación avanzada
- **KDS** `/panel/foodos/cocina`: pantalla realtime con tiempo transcurrido y bump
- **Importación CSV** del menú con plantilla (crea categorías por nombre)
- **Cierre diario** en el tablero: ventas, propinas, descuentos, por cobrar,
  desglose por método/canal/servicio y exportación CSV
- **Storefront bilingüe** es/en (toggle, persistencia por restaurante)

### Fase F — cobros y ciclo de pago asíncrono
- **Comprobante de transferencia**: el comensal sube su comprobante
  (`foodos_payment_proofs`, `00082`), el restaurante lo aprueba o rechaza desde
  la comanda, con URL firmada por tiempo limitado
- **Avisos al comensal**: `notifyFoodosCustomer()` (`00083`) con dedupe por
  `(order_id, event, channel)`
- **Recordatorios y cancelación**: barrido diario que avisa y caduca pedidos sin
  pagar (`FOODOS_VOUCHER_TTL_HOURS`, `FOODOS_UNPAID_CANCEL_HOURS = 72`)
- **Stripe Connect Express por restaurante** (`00085`): cada restaurante tiene su
  cuenta Express y los cargos con tarjeta son *destination charges*
  (`transfer_data.destination` + `application_fee_amount`). La plataforma deja de
  custodiar fondos de terceros. Onboarding, estado y requisitos se gestionan desde
  `/panel/foodos/restaurante` → "Cobros en línea"; el enrutamiento se controla con
  `STRIPE_CONNECT_ENABLED` y sólo aplica a cuentas cobrables (ver `docs/OPS.md` §11)

### Fase F — programación e integraciones
- **Pedidos programados**: fecha/hora con lead time por sucursal (validación server-side)
- **Reorden** desde la página de tracking (precios vigentes)
- **Webhooks salientes** `order.created` firmados HMAC-SHA256 con registro de entregas
- **Meta/TikTok Pixel** por restaurante
- **Duplicar platillo** en el panel

### WhatsApp Business por restaurante (supera a take.app)
- **Catálogo curado y ORDENABLE** (`whatsapp_visible`/`whatsapp_position`):
  el restaurante elige qué platillos aparecen y en qué orden — take.app solo
  muestra los últimos sin control. Doble vía: sync al catálogo nativo de
  WhatsApp Commerce y mensajes `product_list` con orden 100% garantizado
- **Conexión WABA propia** (credenciales cifradas AES-GCM, verificación Graph API)
- **Auto-respuesta** con el menú ordenado al escribir al número del restaurante
- **Broadcast** a segmentos del CRM con plantillas de la WABA del restaurante
- **Inbox** `/panel/foodos/inbox` con conversaciones realtime y respuesta 24h

## Añadido en el programa de paridad con FluxSales (fases 0–9)

Iniciativa posterior y más amplia: ver `docs/foodos-paridad-fluxsales.md` para
el detalle, las invariantes y las decisiones. Resumen de lo que aporta sobre
esta base:

- **Entitlements por nivel** (fases 0–1): las capacidades premium se desbloquean
  con el nivel de lealtad (Plata/Oro/Diamante), **no con una suscripción**. Fuente
  única en `src/lib/foodos-entitlements.ts`; el nivel se computa en vivo.
- **Capa de IA compartida** (fase 1): adaptadores con degradación garantizada a
  plantilla — el producto funciona sin ninguna credencial de IA.
- **Mesero IA** (fase 2): toma pedidos por WhatsApp con máquina de estados, sobre
  el productor único de pedidos que ya usaba el storefront.
- **Marketing IA** (fase 3): segmentación RFM y campañas con copy generado.
- **Flotilla** (fase 4): entregas con asignación por turno/cupo/carga **y despacho
  a un reparto externo** (adaptador de Uber Direct).
- **Tarjeta de lealtad Wallet** (fase 5): pases Apple/Google por cliente.
- **Sitio IA, app de marca y SEO local** (fase 6): páginas generadas (en `draft`
  hasta que el dueño aprueba), PWA por restaurante y manifiesto propio.
- **Punto de venta y catering** (fase 7): registro de adaptadores de POS con
  reconciliación, y paquetes/solicitudes de catering con el total decidido en el
  servidor.
- **Landing B2B `/restaurantes`** (fase 8): calculadora de comisión perdida y
  calificador de leads con el diagnóstico derivado en el servidor.
- **Transversal** (fase 9): KPIs de adopción en el admin, dedupe cruzado entre los
  dos motores de mensajería, trazas durables de IA y de reparto, y e2e.

## Brechas conscientes (fuera de alcance)

- App POS nativa: FoodOS **se integra** con los POS existentes (registro de
  adaptadores), no los reemplaza. Siguen fuera: impresoras térmicas/Bluetooth y
  TV menu board.
- Dominio propio por restaurante (el sitio IA y la PWA viven bajo `/r/[slug]`),
  multi-idioma del panel (solo storefront)
- API pública/webhooks/MCP para comercios, white label/resellers
- Suscripciones/pedidos recurrentes, pedidos grupales
