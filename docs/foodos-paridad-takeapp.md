# Paridad FoodOS ↔ take.app

Auditoría de funcionalidades de take.app y estado de cobertura en FoodOS
(rama `paridad-takeapp-foodos`, migraciones `00078`–`00081`).

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

## Brechas conscientes (fuera de alcance)

- App POS nativa, impresoras térmicas/Bluetooth, TV menu board
- Integraciones de couriers (Lalamove/Uber Direct), catálogo nativo de WhatsApp
- Dominio propio por restaurante, multi-idioma del panel (solo storefront)
- API pública/webhooks/MCP para comercios, white label/resellers
- Suscripciones/pedidos recurrentes, pre-órdenes con fecha, pedidos grupales
