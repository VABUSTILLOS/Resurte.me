# Agente: Recompensas

## Posee
- `src/app/recompensas/**` (app con tabs: home, wallet, store, referidos, profile)
- `src/lib/wallet-actions.ts` (server actions: saldo, historial, canje, resumen, progreso semanal)
- `src/lib/wallet-progress.ts`, `src/lib/wallet-summary.ts`, `src/lib/store-affordability.ts` (lógica pura)
- `src/lib/wallet-expiry.ts` (reparto FIFO de los canjes entre los abonos — solo pinta)
- `src/app/recompensas/_components/PushOptInCard.tsx` (opt-in de push de pedido, W9)
- `src/app/recompensas/_components/PasskeyCard.tsx` (llaves de acceso, U13)
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
  deduplicación propia en memoria. Los avisos que **no** cuelgan de un pedido
  (caducidad de créditos) usan `dedupe_key` + el índice único parcial
  `(user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL` (`00132`).
- **Los créditos caducan a 12 meses del abono, y el consumo es FIFO**: un canje
  agota primero el lote que antes vence, así que nadie pierde créditos mientras
  siga comprando. El saldo del monedero es **agregado** (`wallets.balance_credits`),
  no por lote: el reparto entre abonos se reconstruye desde `wallet_transactions`.
- **La autoridad de la caducidad es el SQL, no TypeScript**: `wallet_credit_lots`
  y `expire_wallet_credits` (`00133`, `SECURITY DEFINER`, `EXECUTE` revocado a
  `anon`/`authenticated`) son quienes mueven el dinero; `src/lib/wallet-expiry.ts`
  solo replica el reparto para mostrarlo en `/recompensas`. Si divergen, manda el
  SQL; los fixtures con fechas concretas se comparten a propósito.
- **La baja toma `FOR UPDATE` sobre `wallets`** — el mismo punto de serialización
  que `credit_cashback_on_payment` (`00036`) y `redeem_service` (`00035`). Sin él,
  un canje concurrente leería el saldo antes de la baja. La baja se acota con
  `LEAST(restante_vencido, balance)` porque `balance_credits` tiene `CHECK (>= 0)`.
- **La baja es idempotente por `expiry_settled_at`**, no por el movimiento: marca
  *todos* los lotes vencidos del monedero, incluidos los que ya no tenían restante
  (si no, se revisarían cada día). Un lote se fecha en `expires_at` con un trigger
  `BEFORE INSERT` que solo toca los abonos — un `DEFAULT` de columna también
  fecharía los débitos.
- Toda la aritmética de semana/mes usa `America/Mexico_City` (`wallet-progress.ts`).
- La clase `body.has-bottom-tab` la publica BottomTabBar y gobierna la colisión
  del FAB de WhatsApp, el BackToTop y el InstallPrompt.
- El interruptor de avisos push (`PushOptInCard`) vive en la home de `/recompensas`
  y **solo** gestiona la suscripción del navegador: la campana no depende de él y
  se oculta sola cuando no hay clave VAPID, el navegador no soporta push o el
  service worker no está registrado (en dev nunca lo está). No convertirlo en un
  requisito para ver los avisos, ni mover la copia del push aquí: el texto lo
  produce `sendOrderStatusEmail` para que campana, correo y push digan lo mismo.
- La tarjeta de llaves de acceso (`PasskeyCard`, U13) solo **gestiona** credenciales
  del usuario; entrar sin contraseña se hace desde `AuthForm`. Se oculta entera —sin
  dejar hueco— si el navegador no soporta WebAuthn o si el proyecto de Supabase no
  tiene el proveedor activado (`list()` falla), igual que el push. Nunca suprimir
  `NotAllowedError`: el navegador no distingue "cerré la ventana" de "este
  dispositivo no tiene ninguna llave", así que callarlo deja al usuario pulsando un
  botón que parece no hacer nada. El borrado pide confirmación porque es
  irreversible. La lógica pura (etiqueta, fecha, validación, mapeo de errores) vive
  en `src/lib/passkeys.ts`: no reimplementarla aquí.

## Verificación
`npm test` (wallet/payments/notifications/progress) + flujo manual: canjear un
servicio (ver folio y saldo en el comprobante, sin redirección automática),
verificar que `?tab=` persista tras reload, y pagar un pedido con tarjeta para
comprobar que la campana recibe el aviso de cashback.

Para la caducidad: `npx vitest run src/lib/wallet-expiry.test.ts` cubre el reparto
FIFO, la ventana de aviso de 30 días y los bordes (canje mayor que el abono, lotes
desordenados, `expires_at` explícito vs derivado), y
`npx vitest run src/lib/wallet-expiry.schema.test.ts` es el contrato SQL↔lib: falla
si el TTL, la ventana de aviso, el backfill no retroactivo, el clamp del saldo, el
append-only, el `FOR UPDATE`, el `REVOKE` o el `unschedule` del cron se desincronizan
(no necesita base de datos: lee las migraciones). El corte real se rejuega sin
esperar al cron:

```sql
SELECT * FROM public.expire_wallet_credits('2027-02-01T00:00:00Z');
```

Es idempotente: una segunda corrida con el mismo `p_now` devuelve
`settled_lots = 0`.

Para los avisos push de pedido (W9): `npx vitest run src/lib/push.test.ts`. La
tarjeta de opt-in no tiene prueba unitaria (no hay jsdom en este repo): se
verifica a mano en un build de producción, como se describe en
`docs/agents/ux-movil.md`.

Para las llaves de acceso (U13): `npx vitest run src/lib/passkeys.test.ts` cubre
las reglas puras y **dos contratos**: que todos los códigos `ERROR_*` que
traducimos existan todavía en `@supabase/auth-js` (y que no quede ninguno suyo sin
cubrir) y que `src/lib/supabase/client.ts` siga encendiendo el flag experimental
—sin él, `signInWithPasskey` lanza al llamarse y el botón fallaría en producción
con el código verde. La ceremonia WebAuthn no es automatizable aquí (necesita
autenticador real), así que el flujo se comprueba a mano: con el proveedor
activado en el dashboard, entrar a `/auth/login` desde un móvil u ordenador con
biometría, pulsar "Entrar con llave de acceso", crear la llave desde
`/recompensas?tab=profile` y verificar que un segundo intento entra sin escribir
correo. Requisitos de despliegue en `docs/OPS.md` § 8.0.2.

