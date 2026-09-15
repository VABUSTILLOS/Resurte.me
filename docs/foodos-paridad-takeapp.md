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

## Brechas conscientes (fuera de alcance)

- App POS nativa, impresoras térmicas/Bluetooth, TV menu board
- Integraciones de couriers (Lalamove/Uber Direct), catálogo nativo de WhatsApp
- Dominio propio por restaurante, multi-idioma del panel (solo storefront)
- API pública/webhooks/MCP para comercios, white label/resellers
- Suscripciones/pedidos recurrentes, pedidos grupales
