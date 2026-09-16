# Agente: Recompensas

## Posee
- `src/app/recompensas/**` (app con tabs: home, wallet, store, referidos, profile)
- `src/lib/wallet-actions.ts` (server actions: saldo, historial, canje, resumen, progreso semanal)
- `src/lib/wallet-progress.ts`, `src/lib/wallet-summary.ts`, `src/lib/store-affordability.ts` (lógica pura)
- `src/lib/notifications.ts` (`notifyCashbackCredited` como productor único del aviso de cashback)
- `src/app/api/redeem/**`

## Invariantes
- La app corre casi toda en cliente; los montos reales SIEMPRE vienen de server
  actions / RPC (`redeem_service` hace FOR UPDATE) — nunca confiar en saldo del cliente.
- Dos instancias de `BottomTabBar` (sidebar md+ y barra móvil) comparten
  `handleTabChange`: el cambio de tab sincroniza `?tab=`, el título del documento,
  haptic y scroll-to-top. Mantener ese cuádruple efecto en un solo handler.
- El saldo se refresca al volver a la pestaña (`visibilitychange`) y con
  pull-to-refresh (umbral 70px amortiguado 0.5x) sobre `mainRef`.
- `/api/redeem` conserva la deduplicación de idempotencia (5 min).
- El aviso de cashback sale SOLO de `notifyCashbackCredited(orderId)`, y el monto
  se lee de `wallet_transactions` (el crédito real), nunca de `orders.cashback_credits`
  (que es estimación). El trigger de base de datos acredita en todas las vías de pago,
  así que cualquier vía nueva de pago debe llamar al helper o el saldo sube en silencio.
- La idempotencia del aviso la da el índice único `(order_id, type)`; no agregar
  deduplicación propia en memoria.
- Toda la aritmética de semana/mes usa `America/Mexico_City` (`wallet-progress.ts`).
- La clase `body.has-bottom-tab` la publica BottomTabBar y gobierna la colisión
  del FAB de WhatsApp, el BackToTop y el InstallPrompt.

## Verificación
`npm test` (wallet/payments/notifications/progress) + flujo manual: canjear un
servicio (ver folio y saldo en el comprobante, sin redirección automática),
verificar que `?tab=` persista tras reload, y pagar un pedido con tarjeta para
comprobar que la campana recibe el aviso de cashback.

