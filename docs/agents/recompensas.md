# Agente: Recompensas

## Posee
- `src/app/recompensas/**` (app con tabs: home, wallet, store, referidos, profile)
- `src/lib/wallet-actions.ts` (server actions: saldo, historial, canje)
- `src/app/api/redeem/**`

## Invariantes
- La app corre casi toda en cliente; los montos reales SIEMPRE vienen de server
  actions / RPC (`redeem_service` hace FOR UPDATE) — nunca confiar en saldo del cliente.
- Dos instancias de `BottomTabBar` (sidebar md+ y barra móvil) comparten
  `handleTabChange`: el cambio de tab sincroniza `?tab=`, el título del documento,
  haptic y scroll-to-top. Mantener ese cuádruple efecto en un solo handler.
- El saldo se refresca al volver a la pestaña (`visibilitychange`).
- `/api/redeem` conserva la deduplicación de idempotencia (5 min).
- La clase `body.has-bottom-tab` la publica BottomTabBar y gobierna la colisión
  del FAB de WhatsApp y el BackToTop.

## Verificación
`npm test` (wallet/payments) + flujo manual: canjear un servicio, verificar
saldo nuevo, confeti, y que `?tab=` persista tras reload.
