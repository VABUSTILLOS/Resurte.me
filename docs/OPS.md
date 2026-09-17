# Operaciones — Crons y mantenimiento (Resurte.me)

> Instructivo operativo de **jobs programados (crons)**, variables de entorno, limpieza de datos y procedimientos de verificación.

## 1. Crons programados en Vercel (`vercel.json`)

Todos los endpoints cron están **protegidos con `CRON_SECRET`** (patrón fail-closed: si la variable no existe o el header no coincide → `401 Unauthorized`). Vercel envía automáticamente el header `Authorization: Bearer <CRON_SECRET>` en sus crons.

| Job | Ruta | Schedule (UTC) | Hora MX (CST) | Qué hace |
| --- | --- | --- | --- | --- |
| Daily consolidado | `/api/cron/daily` | `0 12 * * *` | 6:00 a.m. | Ejecuta **en secuencia** los jobs de abajo (`maxDuration = 300`, cada uno en su propio try/catch) |

> **Los jobs individuales ya no tienen cron propio.** Antes eran cuatro crons
> separados (`payment-reminders` 8:00, `reactivation` 9:00, `abandoned-cart`
> 12:00, `foodos/campaigns` 0:00); hoy viven dentro del consolidado para hacer
> un solo cold start diario. Vercel Hobby solo permite **crons diarios**, así
> que `reconcile-payments` (antes `*/15`) también bajó a una vez al día.

Jobs dentro de `/api/cron/daily`, en orden de ejecución:

| Job | Qué hace |
| --- | --- |
| `payment-reminders` | Recordatorios de pago de órdenes **marketplace** (`checkAndSendPaymentReminders`, `src/lib/workflows.ts`) |
| `foodos-payment-reminders` | Recordatorios (1 h / 24 h) y cancelación por falta de pago (72 h) de pedidos **FoodOS** (`checkAndSendFoodosPaymentReminders`, `src/lib/foodos-payment-reminders.ts`). Ver §10 |
| `abandoned-cart` | Recuperación de carritos abandonados (`checkAbandonedCarts`) |
| `reactivation` | Reactivación de usuarios inactivos (`checkInactiveUsers`) |
| `reorder-reminders` | Recordatorio de recompra (`checkReorderReminders`) |
| `retry-order-emails` | Reintento de correos de pedido fallidos (`retryFailedOrderEmails`) |
| `foodos-campaigns` | Campañas FoodOS programadas vencidas (`runDueFoodosCampaigns`) |
| `reconcile-payments` | Reconciliación de pagos Stripe y caducidad de vouchers (`reconcileStalePayments`) |

> Los schedules están en **UTC**. Las horas MX mostradas asumen CST (UTC−6); ajustar en verano (CDT, UTC−5) según la zona del negocio.

> ⚠️ **Además** hay 3 jobs de mantenimiento en **pg_cron (Supabase)**, no en Vercel: `cleanup-guest-addresses` (domingos 04:00 UTC, retención 30 días — ver §2), `purge-rate-limits` (diario 04:17 UTC, retención 24h — ver §4) y `expire-wallet-credits` (diario 05:37 UTC: avisa 30 días antes de la caducidad de Créditos Resurte y da de baja lo vencido — migración `00133`). La tabla anterior solo lista los crons de Vercel.

### Implementación (referencia)
- `src/app/api/cron/daily/route.ts` — GET, lista secuencial de jobs; fail-closed sin `CRON_SECRET`
- `src/app/api/workflows/payment-reminders/route.ts` — GET, `checkAndSendPaymentReminders()` (endpoint manual)
- `src/app/api/workflows/trigger/route.ts` — GET con `?job=abandoned-cart|reactivation` (imports dinámicos de `@/lib/email-workflows`); POST manual (admin/autenticado)
- `src/app/api/foodos/campaigns/run/route.ts` — GET, `runDueFoodosCampaigns()`

---

## 2. ✅ RESUELTO: `cleanup-guest-addresses` programado con `pg_cron`

> **Actualizado en Fase 10**: la migración `supabase/migrations/00043_pg_cron_cleanup_guest_addresses.sql` habilita `pg_cron` y programa el job **`cleanup-guest-addresses`** (domingos 04:00 UTC, retención 30 días) con llamada **directa al RPC** — sin HTTP, sin `CRON_SECRET` y sin consumir el plan de Vercel. Solo se necesita **aplicar la migración** en Supabase (el job queda activo).

El endpoint HTTP **existe como fallback manual** (no está en `vercel.json`, decisión deliberada para no consumir el plan gratuito):

- **Ruta**: `src/app/api/cron/cleanup-guest-addresses/route.ts`
- **Qué hace**: borra direcciones anónimas huérfanas (`guest_token` sin `user_id`) más viejas que `days` (default 30) vía el RPC `cleanup_orphan_guest_addresses(days)` (migración `supabase/migrations/00042_cleanup_guest_addresses.sql`).
- **Riesgo cubierto**: las direcciones guest (checkout anónimo) se **limpian semanalmente**; sin esto se acumularían sin límite en la tabla `addresses`. No compromete la integridad (no se usan para pagos), pero crece la tabla y expone PII huérfana innecesaria.
- **Protección**: `CRON_SECRET` fail-closed; valida `days` entre 1 y 3650.

### Verificación del job (después de aplicar la migración)
```sql
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'cleanup-guest-addresses';
```

### Opción A (implementada) — Programar en Supabase con `pg_cron`
El plan de Vercel no se toca y corre en la misma infraestructura de la BD. La migración `00043` hace exactamente esto (idempotente — puede re-aplicarse):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('cleanup-guest-addresses')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-guest-addresses'
);

SELECT cron.schedule(
  'cleanup-guest-addresses',
  '0 4 * * 0',
  $$SELECT public.cleanup_orphan_guest_addresses(30)$$
);
```

> Este enfoque **no consume el plan de Vercel y no depende del endpoint HTTP** — llama el RPC directamente en la BD. (La variante con `net.http_post` requiere la extensión `pg_net`; se descartó por añadir una dependencia innecesaria.)

### Opción B — Añadir a `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-guest-addresses",
      "schedule": "0 4 * * *"
    }
  ]
}
```
Si el proyecto Vercel está en plan **Hobby**, el límite es **2 crons** — añadir este consumiría 3 de 4 disponibles. Por eso la recomendación es la **Opción A** (pg_cron en Supabase, sin tocar Vercel).

---

## 3. Variables de entorno requeridas

| Variable | Obligatoria | Uso | Notas |
| --- | --- | --- | --- |
| `CRON_SECRET` | **Sí (crons)** | Autoriza los endpoints cron (`/api/cron/daily`, `/api/cron/reconcile-payments`, `/api/cron/cleanup-guest-addresses`) | Fail-closed: sin ella los crons devuelven 401. Rotar vía Vercel dashboard → Settings → Environment Variables. |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Cliente Supabase (browser + server) | Pública. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Cliente browser | Pública; RLS protege las tablas. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Server actions + endpoints con `createServiceClient` | **Nunca** exponer al browser. Nombre exacto: `createServiceClient()` (`src/lib/supabase/service.ts`) lanza si falta, y sus llamadores lo capturan (fail-open). |
| `STRIPE_SECRET_KEY` | Sí | Crear intents, confirmar pagos | `sk_live_...` en producción. |
| `STRIPE_WEBHOOK_SECRET` | Sí | Validar webhooks Stripe | `whsec_...`. |
| `STRIPE_CONNECT_ENABLED` | No | Enruta los cargos de tarjeta de FoodOS a la cuenta Connect del restaurante | `true` / `1`. **Por defecto apagado.** Requiere activar Connect antes en el Dashboard de Stripe (ver §11). |
| `STRIPE_CONNECT_COUNTRY` | No | País de las cuentas Express | ISO-2, por defecto `MX`. |
| `ADMIN_API_SECRET` | Sí | Endpoints admin (`x-admin-secret` header) | Sin fallback hardcodeado desde Fase 1. |
| `VAPID_PUBLIC_KEY` | No | Firma de los push de estado de pedido (W9) | Par VAPID (`npx web-push generate-vapid-keys`). Sin ella el push queda **desactivado** y `/recompensas` no muestra el interruptor; campana y correo siguen igual. |
| `VAPID_PRIVATE_KEY` | No | Firma de los push (servidor) | **Nunca** exponer al browser. Debe ir en par con la pública: si falta o no es una clave válida, `ensureVapid()` falla y el push se omite en silencio (se loguea `push.vapid.invalid`). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | Clave pública que el navegador usa en `pushManager.subscribe` | Es la **misma** que `VAPID_PUBLIC_KEY`; se duplica porque el navegador necesita el prefijo `NEXT_PUBLIC_`. Si no coinciden, el push se firma con una clave distinta a la suscrita y el navegador lo descarta. |
| `VAPID_SUBJECT` | No | Contacto del emisor VAPID | Por defecto `mailto:hola@resurte.me`. Debe ser un `mailto:` o una URL `https:`. |

### Rotación de `CRON_SECRET`
1. Vercel → Project → Settings → Environment Variables → editar `CRON_SECRET` → **nuevo valor largo y aleatorio** (p.ej. `openssl rand -hex 32`).
2. Re-deployar (los cambios de env aplican al siguiente deploy).
3. Verificar un cron manualmente (sección 5).

### ⚠️ Contraseña de Postgres: rotación pendiente (incidente 17-sep-2026)

`supabase/.temp/pooler-url` —estado local que genera el CLI de Supabase— contiene la
cadena de conexión del rol **`postgres` (superusuario) con contraseña en claro**, y
estuvo **versionado en un repositorio público** (`VABUSTILLOS/Resurte.me`, 6 commits
desde `2bee041`, un único blob ⇒ la contraseña nunca se rotó). Da acceso total a la
base de producción: pedidos, direcciones y datos de clientes.

Ya está destrackeado y en `.gitignore`, pero **eso no revoca nada**: el historial ya
está indexado y el secreto debe considerarse comprometido.

1. **Rotar ya**: Dashboard de Supabase → *Project Settings → Database → Reset database
   password*. Es la única mitigación real; el historial es público e irreversible
   sin reescritura forzada.
2. Actualizar el secreto donde se use (`POSTGRES_PASSWORD` / `POSTGRES_URL*` en Vercel).
3. Si además se quiere limpiar el historial: `git filter-repo --path supabase/.temp/
   --invert-paths` y force-push coordinado. Hazlo **después** de rotar, no en lugar
   de rotar.
4. Regla permanente: nada de `supabase/.temp/` ni de `.env*` en git. El CLI regenera
   `supabase/.temp/` en cada `supabase link`.

---

## 4. RPCs de limpieza disponibles (Supabase)

| RPC | Migración | Qué limpia |
| --- | --- | --- |
| `cleanup_orphan_guest_addresses(days)` | `00042_cleanup_guest_addresses.sql` | Direcciones guest huérfanas (`guest_token` sin `user_id`) más viejas que `days` |

> **pg_cron `purge-rate-limits`** (migración `00044`, Fase 11): la tabla `rate_limits` (migración `00039`) acumulaba filas huérfanas porque `consume_rate_limit` solo hace limpieza perezosa de keys re-consultadas. Ahora un job diario (04:17 UTC) borra ventanas vencidas hace más de 24h:
>
> ```sql
> SELECT cron.schedule(
>   'purge-rate-limits',
>   '17 4 * * *',
>   $$DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day'$$
> );
> ```
>
> Verificación del job:
> ```sql
> SELECT jobid, jobname, schedule, command
> FROM cron.job
> WHERE jobname = 'purge-rate-limits';
> ```
>
> El DELETE corre como superuser de pg_cron dentro de la BD; la tabla sigue con RLS on y revocada a `anon`/`authenticated`, así que el camino público no expone datos.

---

## 5. Verificación manual de un cron

```bash
# Con el secret real (o el de staging):
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://resurte.me/api/workflows/payment-reminders" | jq

# Esperado: { "success": true, ... }

# Sin header → debe fallar (fail-closed):
curl -s "https://resurte.me/api/workflows/payment-reminders"
# → { "error": "Unauthorized" }, status 401

# cleanup-guest-addresses con días custom:
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://resurte.me/api/cron/cleanup-guest-addresses?days=30" | jq
```

**Para probar en local**: `CRON_SECRET=test-secret npm run dev`, luego el mismo curl contra `http://localhost:3000`.

---

## 6. Rate limiting de endpoints de dinero (resuelto en Fase 9)

La infraestructura durable de rate limiting existe (tabla `rate_limits` + RPC `consume_rate_limit`, migración `00039`) y se aplica a los **4 endpoints de dinero** vía `src/lib/rate-limit.ts` (helper compartido, fail-open, 429 con `Retry-After`):

| Endpoint | Key | Límite |
| --- | --- | --- |
| `POST /api/foodos/orders` | `orders:{ip}` | 15/min (guest) |
| `POST /api/redeem` | `redeem:{user.id}` | 10/min |
| `POST /api/orders` | `orders:{user.id}` o `orders:{ip}` | 15/min |
| `POST /api/coupons/validate` | `coupons:{ip}` | 30/min (anti-enumeración) |

> La tabla crece con keys de ventanas activas; la migración `00044` programa la purga diaria vía pg_cron (§4).

---

## 7. Persistencia del panel del restaurantero (`panel_entries`)

Las herramientas de `/panel` (ventas, mermas, inventario, comanda, temporada, planificador, apertura, clientes) persisten en la tabla genérica **`panel_entries`** (migración `00055`), una fila por `(tool, collection_slug, owner)`:

- **Dueño**: `user_id` (sesión) o `guest_token` (UUID v4 capability, header `x-guest-token`); CHECK exige exactamente uno.
- **Payload**: JSONB `{ value }` — valor completo de la clave localStorage; sync replace-all con debounce de 800 ms.
- **API**: `GET /api/panel/entries?tool=&collection=` → `{ found, value }` (60/min); `PUT` reemplaza el valor (30/min, límite 256 KB → 413). Service client + RLS (`user_id = auth.uid()`), `REVOKE ALL FROM anon`.
- **Hook**: `useSyncedStorage<T>(key, initialValue, collectionSlug?)` en `src/hooks/use-synced-storage.ts` — drop-in de `useLocalStorage`: localStorage es caché inmediato, GET una vez por clave por sesión, gana el servidor si `found`, si no sube el local cuando difiere del valor inicial.
- **Claim**: al iniciar sesión, `/api/addresses/claim` reasigna las filas guest (`guest_token` → `user_id`) de `panel_entries`, `panel_rows` y `panel_dishes`.

### 7.1 Escalabilidad por fila (`panel_rows`) y sincronización robusta

- **Sync robusta (Fase 4.1)**: `src/lib/panel-sync.ts` publica estado global (`idle|saving|saved|error`) con indicador en el layout del panel y retry automático al volver online/visible (registro de handlers por herramienta). `usePanelRealtimeSync` suscribe `panel_entries`/`panel_rows` al canal `supabase_realtime` (filtro por dueño) y hace re-pull debounced ante cambios remotos; `visibilitychange` como fallback (guests sin sesión no reciben eventos por RLS).
- **Tabla por fila (Fase 4.2)**: las claves de alto volumen (`ventas-entries`, `mermas-entries`, `comanda-entries`, `inventario-movimientos`, `planificador-servicios`) persisten en **`panel_rows`** (migración `00057`): una fila por registro (`client_id` único por dueño+herramienta+colección, `entry_date` indexada, `payload` JSONB), dos índices únicos parciales (user/guest) para upsert idempotente, RLS idéntico.
- **API**: `GET /api/panel/rows?tool=&collection=&from=&to=&limit=&cursor=` (paginada, `nextCursor` opaco, 60/min) → `{ found, rows, nextCursor }`; `POST` upsert por lote ≤500 (30/min, 256 KB → 413); `DELETE` por `client_ids` o total. GET vacío sin filtros **migra transparentemente** el JSON existente de `panel_entries` (genera `client_id` por fila, `entry_date` desde `date`/`fecha`).
- **Hook**: `useSyncedRows<T extends { id?: string }>(key, initial, collectionSlug?)` — drop-in con diff por `id`: push debounced de solo las filas nuevas/cambiadas y DELETE de las borradas (caché de snapshot por `client_id`); asigna ids `row-*` a filas sin id. Sin cap de 256 KB total (solo por request).
- El resto de claves (config, alertas, temporada, apertura, clientes) siguen en `panel_entries` con replace-all.

### 7.2 Idioma inglés (Fase 4.3) y respaldo completo (Fase 4.4)

- **i18n bilingüe**: `src/lib/i18n/locale.ts` mantiene el locale activo (`es|en`) y el registro de diccionarios; `es.ts` se auto-registra como fallback y `en.ts` se registra al cargarse vía `use-locale.ts` (solo el bundle del panel lo incluye). `t()` sigue siendo función pura — los ~30 call sites no cambiaron; busca en el diccionario activo y cae a español si falta la clave. Preferencia persistida en `config-locale` (panel_entries) vía `useSyncedStorage`; al cambiar idioma se actualiza `<html lang>` y se llama `router.refresh()`. Selector ES/EN en el header del panel (`language-toggle.tsx`). Paridad de claves/placeholders es↔en verificada en `locale.test.ts`.
- **Respaldo completo**: `GET /api/panel/backup` descarga un JSON `{ app: "resurte-me", version: 2, entries, rows, dishes }` con todas las claves del dueño (10/min, `Content-Disposition: attachment` con fecha); `POST` valida el esquema v2 (`parseBackup`: caps 500 entries / 50 000 rows / 500 dishes / 8 MB) y hace replace-all por dueño en las 3 tablas (5/min). El hub del panel exporta con "💾 Respaldo"; al restaurar, los archivos v2 muestran preview de conteos por herramienta (`ServerRestoreModal`) y confirman antes de reemplazar; los archivos v1 (localStorage legado) siguen el flujo anterior.

### 7.3 Analítica avanzada (Fase 4.5)

- **Página `/panel/analitica`**: cruza `ventas-entries` + `mermas-entries` (panel_rows) con el costeo real (`panel_dishes` vía `useSharedDishes`) en un rango de fechas (7 días / 30 días / mes actual). KPIs: ingresos, margen bruto, **food cost real** (ventas × costo unitario registrado o, si falta, costo del platillo en costeo por nombre normalizado), merma total y **tasa de merma** (merma/ingresos). Tendencia diaria con barras CSS (mismo patrón que `WeekTrend`) y top 5 platillos por margen real.
- **Historial de alertas**: `use-alert-history.ts` registra cada alerta del hub que se dispara (aparece sin estar activa en la evaluación anterior; la primera carga no graba) en la clave `alertas-historial` (panel_entries, cap 200 eventos). La página de analítica las agrupa por alerta con conteo y última fecha.
- Registrada como herramienta en `TOOLS` de `hub-data.ts` (área "costos"). Claves i18n nuevas en `analitica.*` (es/en).

### 7.4 Roles de personal (Fase 4.6)

- **Tabla `panel_members`** (migración `00058`): `owner_user_id` (dueño), `member_email`, `member_user_id` (nullable hasta aceptar), `role` (`gerente | cocina | mesero`), `invite_token` UUID, `status` (`pendiente | activo`), único por (owner, lower(email)). RLS: dueño administra todo; el miembro solo lee su fila.
- **Matriz de acceso** en `src/lib/panel-roles.ts`: `TOOL_ACCESS` (dueño todo; gerente todo menos `personal`; cocina comanda/inventario/mermas; mesero ventas/comanda), permisos finos para rows (`canWriteRows`), entries (`canWriteEntry`, config solo dueño), dishes y backup (solo dueño).
- **Resolución de dueño compartida** (`src/lib/panel/owner.ts`, `resolveEffectiveOwner`): sesión con membresía activa opera sobre los datos del dueño con su rol; sin membresía → sus propios datos como "dueno"; guest → `guest_token` como "dueno". Todas las rutas `/api/panel/{rows,entries,dishes,backup}` la usan y responden 403 según la matriz.
- **APIs**: `/api/panel/members` (GET lista / `?mine=1` rol efectivo, POST invitar o re-invitar con token nuevo, PATCH rol, DELETE revocar; solo dueño, rate-limited) y `/api/panel/members/accept` (POST `{token}`: valida correo de sesión, bloquea auto-invite y doble membresía).
- **UI**: `/panel/personal` (invitar, listar, cambiar rol, revocar, copiar enlace `/panel/unirse?token=…`, matriz rol×herramienta) y `/panel/unirse` (aceptar invitación). `use-panel-role.ts` consulta `?mine=1` con cache de sesión; el hub filtra `TOOLS`, `PanelQuickNav` filtra accesos y el layout bloquea rutas sin acceso con pantalla "sin acceso". Badge de rol en el header cuando opera un miembro. Claves i18n `personal.*` y `unirse.*` (es/en).

---

## 8. Autenticación: SMTP propio, roles y master admin

## 8.0 Emails transaccionales de pedido (Resend)

El cliente recibe correo al crear el pedido y en los hitos **confirmado / en camino / entregado** (`src/lib/order-emails.ts`, cableado en `workflows.ts`). Requisitos:

1. `RESEND_API_KEY` configurada (sin ella solo se loguea en dev).
2. `NEXT_PUBLIC_SITE_URL=https://resurte.me` — base de los enlaces de rastreo.
3. Migración `00063` aplicada (`orders.restore_token` — capability URL del rastreo público `/[ciudad]/pedido/[id]?t=...`).

Dedupe: cada envío se registra en `email_logs` (`order_id` + `email_type`); reintentos no reenvían. Los envíos se pueden auditar en la tabla `email_logs`.

Carrito persistente: la migración `00068_user_carts.sql` habilita el carrito cross-device para usuarios con sesión (merge last-write-wins con localStorage vía `/api/cart`).

### 8.0.1 Push de estado de pedido (W9)

Los mismos hitos que disparan el correo disparan una notificación del sistema, desde **el mismo punto** (`sendOrderStatusEmail`), reutilizando su copia y su enlace de rastreo. Es un canal adicional: si el push falla o no está configurado, la campana y el correo no cambian. Requisitos para activarlo:

1. Par de claves VAPID: `npx web-push generate-vapid-keys` → poner la privada en `VAPID_PRIVATE_KEY` y la pública en **las dos** variables (`VAPID_PUBLIC_KEY` y `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Opcional: `VAPID_SUBJECT` con un `mailto:` de contacto.
2. Migración `00134_push_subscriptions.sql` aplicada (`supabase db push`).
3. Re-deployar: `NEXT_PUBLIC_*` se hornea en el bundle, así que sin un build nuevo el navegador no ve la clave.

Sin los pasos 1–3 nada se rompe: `isPushConfigured()` devuelve `false`, el interruptor no se pinta en `/recompensas`, `sendPushToUser` sale temprano y el `INSERT`/`DELETE` de `/api/push/subscribe` responde 503 si la tabla no existe. Las suscripciones muertas (HTTP 404/410 del servicio de push) se borran solas en el primer intento; el resto de fallos incrementan `failure_count` para poder auditarlas.

### 8.0.2 Llaves de acceso / passkeys (U13)

Entrar sin contraseña con huella, rostro, PIN o llave física. Es **opcional y aditivo**: si no se habilita, el botón "Entrar con llave de acceso" no aparece en `/auth/login`, la tarjeta de `/recompensas?tab=profile` no se pinta y correo/Google/contraseña siguen igual. Requisitos:

1. **Dashboard de Supabase → Authentication → Passkeys** (o *Sign In / Providers → Passkeys* según la versión): **activar** el proveedor. Sin esto, `auth.passkey.list()` falla y la UI se oculta sola — el código ya está desplegado y no hay que tocarlo después.
2. **`Site URL` y `Redirect URLs`** correctas en *Authentication → URL Configuration*: la credencial queda atada al **RP ID** (el dominio registrable), así que `localhost` y `resurte.me` son llaves distintas y una llave creada en el dominio de preview no sirve en producción. Al cambiar de dominio hay que volver a crear las llaves.
3. HTTPS (o `localhost`): WebAuthn no existe en contexto inseguro. `isPasskeySupported()` devuelve `false` y la UI no aparece.
4. Nada que desplegar aparte: no hay migración ni variable de entorno. El flag `auth: { experimental: { passkey: true } }` que exige `@supabase/auth-js` ya va en `src/lib/supabase/client.ts`.

Sin el paso 1 no se rompe nada, pero conviene saber distinguirlo: la UI se oculta **en silencio** a propósito (mismo criterio que el push de W9), así que si alguien reporta "no veo las llaves de acceso", la causa más probable es que el proveedor sigue apagado en el dashboard.

Nota de alcance: las llaves son por usuario y se gestionan solas. Un usuario puede quedarse sin ninguna forma de entrar solo si borra su última llave **y** no tiene contraseña utilizable; por eso el borrado pide confirmación explícita. No hay recuperación por llave (no existe "olvidé mi llave"), y ese es el comportamiento correcto.

### 8.1 SMTP propio en Supabase (requerido para registro por email)

El servicio de correo por defecto de Supabase Auth es **solo para desarrollo** (rate-limit severo; los correos de confirmación no llegan o caen en spam). Para que el registro por email/contraseña funcione en producción hay que configurar un SMTP propio:

1. Dashboard de Supabase → **Project Settings → Authentication → SMTP Settings** (o **Auth → Emails → SMTP** según la versión).
2. Activar **Custom SMTP** e ingresar las credenciales del proveedor (recomendado: Resend, SendGrid, Amazon SES):
   - Host, puerto (587 con TLS o 465 con SSL), usuario, contraseña/API key.
   - **Sender email**: un remitente verificado en el proveedor (p.ej. `no-reply@resurte.me`).
   - **Sender name**: `Resurte.me`.
3. Verificar que **Authentication → Sign In / Providers → Email → Confirm email** siga **activado** (los usuarios deben confirmar su correo).
4. En **Authentication → URL Configuration**, asegurar que **Redirect URLs** incluya:
   - `https://<dominio-prod>/auth/callback`
   - `http://localhost:3000/auth/callback` (desarrollo)

   **No agregues `?next=…` a estas entradas ni al `redirectTo` del código.**
   Supabase valida la URL de redirección **completa** contra la allow-list
   (los comodines `*`/`**` existen, pero el matching es sobre la cadena
   entera), así que una entrada exacta de `/auth/callback` **no** coincide con
   `/auth/callback?next=/auth/reset`: el proveedor cae al **Site URL** y el
   enlace lleva al usuario a `/` en vez de a su destino, sin ningún error
   visible. Por eso el destino viaja en la cookie `resurte_auth_next`
   (`src/lib/auth-next.ts`, `rememberNextPath` / `readNextPath`) y el
   `redirectTo` se queda limpio. Corolario: revisa también el **Site URL**
   (paso 1 de esta lista es el SMTP, pero el Site URL vive en la misma página),
   porque es el destino al que se cae cuando la allow-list no coincide.
5. Probar: registrar un usuario de prueba en `/auth/register` y confirmar que llega el correo.

Flujos que dependen de este SMTP: **la confirmación de registro y la
recuperación de contraseña** están implementadas y consumen el SMTP:

- **Confirmación de registro**: `/auth/register` → correo → `/auth/callback`.
- **Recuperación de contraseña**: el disparador "¿Olvidaste tu contraseña?" en
  `/auth/login` llama a `resetPasswordForEmail`; el enlace vuelve por
  `/auth/callback` (que lee la cookie de destino) y termina en `/auth/reset`,
  donde `updateUser({ password })` fija la contraseña nueva.

El **enlace mágico** (`signInWithOtp`) **no existe en `src/`**: sigue sin
construir, así que no lo configures esperando que funcione. Detalle de los dos
flujos vivos: `docs/PLAN-MEJORAS.md` § 6 (U14).

### 8.2 Roles del sitio y master admin

Fuentes de verdad para admin (`isAdminUser()` en `src/lib/admin-auth.ts`, cualquiera basta):

1. **`profiles.role = 'admin'`** (migración `00067_master_admin_roles.sql`) — fuente principal, gestionable desde la UI.
2. **`ADMIN_EMAILS`** (env var, lista separada por comas) — bootstrap/emergencia.
3. **`admin_users`** (migración `00030`) — legado; el panel la mantiene sincronizada.

**Bootstrap del primer master admin** (una sola vez):

```bash
# 1. Aplicar la migración 00067 (ver §9: npx supabase db push)
# 2. Registrar el usuario en /auth/register (o con Google)
# 3. Promoverlo:
node scripts/make-admin.mjs tu-email@dominio.com
```

**Gestión continua**: desde `/admin/usuarios` cualquier admin puede listar usuarios, buscarlos y asignar/quitar roles (admin / vendedor / cliente). Reglas: un admin no puede quitarse su propio rol y el sistema siempre conserva al menos un admin. El área `/admin` tiene guard server-side (layout) — sin sesión redirige a `/auth/login?next=/admin` y sin rol admin redirige a `/`.

**Gestión por CLI** (`scripts/admin-credentials.mjs` / `npm run admin`):

```bash
npm run admin list                                   # quién es admin y por qué fuente
npm run admin create tu@correo.com                   # crea cuenta confirmada + rol admin
npm run admin promote tu@correo.com                  # promueve una cuenta existente
npm run admin password tu@correo.com                 # cambia la contraseña
```

`create` y `password` generan una contraseña aleatoria (20 caracteres, sin `l/I/O/0/1`)
si no se les pasa una, y la imprimen **una sola vez**: no se guarda en ningún lado
porque en Supabase Auth solo queda el hash.

Credenciales que necesitan los comandos: la URL del proyecto
(`NEXT_PUBLIC_SUPABASE_URL`, o `SUPABASE_URL`) y una clave de servicio
(`SUPABASE_SERVICE_ROLE_KEY`, o `SUPABASE_SECRET_KEY`).

> ⚠️ **`vercel env pull` no sirve para esto.** Esas variables están marcadas como
> *Sensitive* en Vercel, así que la CLI no puede descifrarlas: `env pull` escribe
> `[SENSITIVE]` y `env run` directamente las omite. Hay que copiarlas a mano desde
> el panel de Supabase (*Project Settings → API* → *Project URL* y clave
> `service_role`) y pegarlas en `.env.local`.

> ✅ **Estado local reparado (17-sep-2026).** `.env.local` tenía literalmente
> `[SENSITIVE]` en `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> así que `isSupabaseConfigured()` devolvía `false` y todo el marketplace caía a
> 404 (`/r/[slug]`) o a estado vacío (`/comer`). Se rellenaron copiando los valores
> reales que **ya estaban en el mismo archivo** (`SUPABASE_URL` y
> `SUPABASE_ANON_KEY`); no hizo falta sacar nada de Vercel.
>
> Dos detalles útiles para la próxima vez: **Next 16 recarga `.env.local` en
> caliente** (`Reload env: .env.local` en el log), así que no hay que reiniciar
> `next dev`; y las entradas **negativas** que se cachearon mientras la variable
> estaba rota (`unstable_cache` / ISR, `revalidate = 300` en `/r/[slug]`) siguen
> sirviendo 404 hasta que expira esa ventana. Si tras arreglar el env un slug
> sigue dando 404, espera ~5 min antes de sospechar del código.
>
> Siguen pendientes, y **solo se pueden pegar a mano** (marcadas *Sensitive* en
> Vercel ⇒ la CLI no las descifra): `SUPABASE_SERVICE_ROLE_KEY` —su ausencia deja
> `service.ts` sin cliente, lo que rompe los paneles del restaurantero y hace que
> el rate-limit server-side falle *fail-open*—, `STRIPE_SECRET_KEY`,
> `STRIPE_WEBHOOK_SECRET` y `POSTGRES_PASSWORD`/`POSTGRES_URL*` (ver la rotación
> pendiente de arriba).

**Alternativa sin credenciales locales**: crea el usuario en el Dashboard de
Supabase (*Authentication → Users → Add user*, con *Auto Confirm User*) y concédele
el rol con `update profiles set role = 'admin' where id = '<uuid>';` o añadiendo su
email a `ADMIN_EMAILS` en Vercel.

> **Las contraseñas no están en el repositorio.** Ni `ADMIN_EMAILS` ni
> `profiles.role` ni `admin_users` almacenan credenciales: el login lo valida
> Supabase Auth contra un hash bcrypt irreversible. Para recuperar el acceso a
> una cuenta admin existente hay que usar `password` o el Dashboard
> (*Authentication → Users → Reset password*).


---

## 9. Migraciones de base de datos (workflow)

Desde la reconciliación de drift (migración `00071_reconcile_prod_drift.sql`),
el esquema se gestiona **exclusivamente con migraciones versionadas** en
`supabase/migrations/` (00001–00071). Los scripts ad-hoc de `supabase/manual/`
fueron eliminados por estar cubiertos por migraciones versionadas.

### Crear y aplicar un cambio de esquema

```bash
# 0. ¿Falta algo por aplicar? (read-only, una línea)
npm run db:status

# 1. Crear la migración (archivo vacío numerado en supabase/migrations/)
npx supabase migration new nombre_descriptivo

# 2. Escribir el SQL — DEBE ser idempotente:
#    ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
#    CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS + CREATE POLICY, etc.

# 3. Commit de la migración junto con el código que la usa

# 4. Aplicar a la BD vinculada (requiere login: npx supabase login)
npx supabase db push
```

**Prohibido:** editar el esquema de producción a mano en el SQL Editor del
dashboard. Eso fue la causa del drift histórico (ver `supabase/ESQUEMA.md`).

### Reglas

1. **Idempotencia obligatoria** — cada migración debe poder re-ejecutarse sin
   error (convención del repo).
2. **Aplicar con `db push`, que es la vía única.** `npx supabase migration new
   <nombre>` para crear y `npx supabase db push` para aplicar. El agente puede
   correr `db push` contra la BD vinculada **con autorización explícita del
   usuario por lote**: una confirmación cubre el lote que se le presenta, no
   todos los futuros. Para auditar drift sin escribir nada, `npx supabase db
   pull` o `npx supabase migration diff`. Antes de crear una migración, `npm run
   db:status` responde si falta algo por aplicar.
3. **Prohibido `supabase db reset --linked`** desde una máquina local, y
   prohibido editar el esquema de producción a mano en el SQL Editor (párrafo
   anterior). Aplicar a mano deja el ledger sin fila y `db push` **no** la
   re-aplica después: ver §«Migraciones históricas de aplicación manual».
4. Ante drift sospechado: documentar en `supabase/ESQUEMA.md`, versionar el
   cambio real como migración nueva y reconciliar — no repetir ediciones
   manuales.
5. El seed (`supabase/seed.sql`) escribe precios/stock directo en `products`;
   la tabla legado `product_stores` ya no se escribe ni se lee (la ruta admin
   `seed-products` aún hace upsert histórico — pendiente de limpieza).

### ✅ Migración `00114` aplicada (`orders.coupon_code`)

`supabase/migrations/00114_orders_coupon_code.sql` ya está aplicada al proyecto
vinculado (`isogthougrpctnfzcdes`). Era la última pieza del arreglo del panel
de pedidos.

**Estado verificado (16-sep-2026):** la columna existe. Sonda REST con la clave
publicable, `200` en las tres consultas relevantes:

| Sonda | Resultado |
|---|---|
| `orders?select=id,coupon_code` | `200` |
| SELECT completo del panel (con `coupon_code`, hint `orders_user_id_fkey`, `addresses`) | `200` |
| SELECT del ticket imprimible (con `coupon_code`) | `200` |

Hubo un intento previo que **no** commiteó: durante ~30 min `orders?select=id,coupon_code`
devolvía `400 42703` mientras la sonda diferencial (ver más abajo) confirmaba
que la caché de PostgREST era fresca — es decir, la migración realmente no se
había aplicado, no era caché obsoleta. Al re-ejecutar el script quedó aplicada.
Lección: **verificar con la sonda REST después de ejecutar**, nunca asumir que
el script del SQL Editor commiteó. Ejecutarlo desde el SQL Editor es la
excepción documentada a la regla de §9 (*prohibido* editar el esquema de
producción a mano); se usó solo porque el entorno donde se escribió el arreglo
tiene las credenciales enmascaradas. Un `npx supabase db push` desde una máquina
con sesión válida sigue siendo la vía preferida.

Qué pasó: la columna `orders.coupon_code` se escribía desde el checkout pero
**nunca se versionó en una migración** (00049 la añadió a `leads` y 00080 a
`foodos_restaurants`, pero no a `orders`). En el esquema desplegado la consulta
del panel respondía `42703` y la UI mostraba *"Error al cargar los pedidos"*.
El código de la app además reintenta sin la columna, así que el panel cargaba
incluso antes de aplicar la migración; lo que estuvo roto mientras tanto fue la
persistencia del cupón:

| Superficie | Sin `coupon_code` en el esquema |
|---|---|
| `POST /api/orders` (checkout con cupón) | El pedido se crea pero **sin** `coupon_code` y el descuento no queda auditado |
| `PATCH /api/orders/[id]/status` | La liberación del cupón al cancelar se omite |
| Webhook Stripe (`payment_failed` / `canceled`) | El cupón reservado **no se libera** ⇒ el cliente lo pierde (peor caso: cupones personales de recompra con `max_uses = 1`) |
| Panel admin / ticket imprimible | La columna "Cupón" sale vacía |

Consecuencia operativa mientras estuvo sin aplicar: un pago rechazado por el
banco **consumía** el cupón del cliente sin devolverlo. No hubo pérdida de
pedidos ni de dinero, pero sí de cupones.

La migración es idempotente, aditiva y sin backfill. **Ya está aplicada**;
queda documentado el procedimiento por si hay que replicarla en otro entorno
o en una base nueva:

```bash
npx supabase login          # requiere token de cuenta con acceso al proyecto
npx supabase db push        # aplica 00114
```

Verificar (REST, con la clave publicable):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://isogthougrpctnfzcdes.supabase.co/rest/v1/orders?select=id,coupon_code&limit=1"
# 200 = la columna existe · 400 42703 = no aplicada
```

### ✅ Migración `00116` aplicada (vista de ventas por producto)

`supabase/migrations/00116_product_sales_view.sql` añade el índice
`order_items (product_id)` y la vista `products_with_sales` (todas las columnas
de `products` más `sales_units` y `sales_revenue`, NULL cuando el producto no
vendió, pedidos cancelados excluidos). Es lo que permite ordenar
`/admin/productos` por **más vendidos**: el orden tiene que aplicarlo Postgres
*antes* del `range()` de la paginación, y PostgREST no puede ordenar por un
agregado de `order_items`.

**Estado verificado (17-sep-2026):** **aplicada**. La sonda con la clave
publicable responde `401`, no `404 PGRST205`: la vista existe y el `REVOKE` de
la propia migración deja a `anon` sin `SELECT`, así que `200` **nunca** es el
resultado esperado aquí. Un `404 PGRST205` (*"Could not find the table
'public.products_with_sales' in the schema cache"*) es lo que
`GET /api/admin/products/list?sort=sales` interpreta como "vista ausente", y es
lo que sí hay que ver en un entorno nuevo sin la migración.

Esta migración **no tiene fila en el ledger** (se aplicó pegando el SQL en el
editor, que no registra migraciones). Como `db push` solo empuja versiones
locales mayores que la máxima remota, no se re-aplica: en un entorno nuevo hay
que aplicarla a mano o por CLI.

Sin ella el panel **no se rompe**: el listado reintenta sin el orden por
ventas, cae al orden por nombre y marca `schemaDrift` (aviso ámbar de
migraciones). Lo que falta es el orden en sí — la columna "Ventas" sigue
mostrando sus cifras.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://isogthougrpctnfzcdes.supabase.co/rest/v1/products_with_sales?select=id&limit=1"
# 404 PGRST205 = pendiente · 401/403 = aplicada (el rol anónimo no tiene
# permiso, que es justo lo que impone la propia migración con su REVOKE)
```

La vista **no** es pública: la migración revoca `anon`/`authenticated` y concede
solo a `service_role`, porque `products_with_sales` incluye `cost` y el
histórico de ventas. Ese REVOKE es necesario porque Supabase concede
privilegios por defecto a esos roles en cada objeto nuevo de `public`.

### ✅ Migración `00117` aplicada (libro de direcciones del checkout)

`supabase/migrations/00117_address_book.sql` añade a `addresses`:

- `last_used_at TIMESTAMPTZ` (backfill `= created_at`) — la preselección del
  checkout usa la **última usada** cuando la cuenta no tiene predeterminada, y
  `POST /api/orders` la toca en cada compra (best-effort: si la columna no
  existe, solo registra un `warn` y la orden continúa).
- `deleted_at TIMESTAMPTZ` — **soft delete**: `orders.address_id` es
  `ON DELETE SET NULL` y el ticket/panel imprimen la dirección, así que un
  DELETE físico vaciaría el historial. Todas las listas filtran
  `deleted_at IS NULL`; sin la columna, `fetchOwnAddresses` y
  `/mis-direcciones` reintentan sin el filtro y descartan en memoria.
- Índices parciales (`guest_token, last_used_at DESC WHERE user_id IS NULL AND
  deleted_at IS NULL` y `deleted_at WHERE deleted_at IS NOT NULL`).
- Reescribe el RPC `cleanup_orphan_guest_addresses(days)` del job
  **  `cleanup-guest-addresses`** (§2): ahora purga por
  `COALESCE(deleted_at, last_used_at, created_at)` y **omite** las direcciones
  referenciadas por un pedido (`NOT EXISTS orders`) — antes el libro del
  invitado recurrente desaparecía cada 30 días y rompía el historial.

**Estado verificado (17-sep-2026):** **aplicada**. No es "la última migración del
repo" —el repositorio va por `00154`— sino una de las que se aplicaron a mano y
quedaron sin fila en el ledger. Sonda con la clave publicable:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://isogthougrpctnfzcdes.supabase.co/rest/v1/addresses?select=id,last_used_at,deleted_at&limit=1"
# 200 = aplicada · 400 42703 = pendiente (columna inexistente)
```

Sin ella **nada se rompe**: el invitado no ve su libro (su endpoint cae a la
lista vacía y el checkout arranca en blanco), el usuario con sesión sigue con
el prefill clásico y las migraciones se reportan por `schemaDrift`.

### Cómo distinguir "caché de esquema obsoleta" de "no se aplicó"

PostgREST valida los `select` contra una **caché de esquema** propia, así que un
`42703` puede significar dos cosas muy distintas: el objeto no existe, o existe
pero la caché todavía no se refrescó. Se distinguen comparando contra un objeto
de una migración reciente que **sí** está aplicada (00113, 16-sep-2026):

| Sonda (`GET /rest/v1/…`, rol anónimo) | 00113 aplicada, 00114 ausente |
| --- | --- |
| `user_carts?select=user_id,bumps,bumps_updated_at` | `200` — la caché ve DDL reciente |
| `orders?select=id,coupon_code` | `400 42703` |

Si la primera da `200` y la segunda `42703`, la caché está fresca y la migración
**realmente no se aplicó**. Si **ambas** dieran `42703`, sospechar de la caché
(`NOTIFY pgrst, 'reload schema';`) antes que del script. Ojo: el rol anónimo no
ve filas por RLS, así que un `200` prueba que la tabla o columna **existe**, no
que tenga datos.

### Script con comprobación incluida

El SQL Editor puede responder `Failed to fetch (api.supabase.com)` y dejar el
script sin aplicar sin que se note (§ más abajo). Para que el resultado sea
inequívoco, pegar el `ALTER` y la consulta de comprobación **en el mismo
script**:

```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
COMMENT ON COLUMN public.orders.coupon_code IS
  'Código del cupón aplicado al pedido (referencia lógica a coupons.code, sin FK: el histórico del descuento sobrevive al borrado del cupón).';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'coupon_code';
```

Resultado esperado: una fila `coupon_code | text`. Si no aparece ninguna fila, el
`ALTER` no corrió. Que aparezca prueba que la sentencia se ejecutó sin error en
esa sesión, **no** que haya commiteado: la confirmación definitiva es la sonda
REST de arriba.

**Por qué costó tanto:** el entorno donde se hizo el arreglo enmascara
`POSTGRES_PASSWORD` y `POSTGRES_URL*` (se leen como la cadena literal
`[SENSITIVE]`), y el token guardado en `~/.supabase/access-token` respondía
`401` en la Management API. El host directo
(`db.<ref>.supabase.co:5432`) es solo IPv6 y no era alcanzable, y el pooler
rechazaba la conexión por falta de contraseña. Fue un bloqueo de credenciales,
no de código, y se resolvió ejecutando la migración desde una sesión con
credenciales válidas (§9 arriba).

### Si el SQL Editor responde `Failed to fetch (api.supabase.com)`

No es un error de SQL. El editor manda el script entero en **una sola petición
HTTP**, y si el script abre una transacción explícita (`BEGIN; … COMMIT;`) todo
corre en **una sola transacción de Postgres**: o se aplica todo, o no se aplica
nada. Cuando el gateway corta la conexión antes de responder (timeout, o una
espera de lock más larga que el límite del editor), el navegador no recibe
respuesta y reporta `Failed to fetch`. El editor **no puede** decirte si
commiteó, así que hay que averiguarlo por fuera.

Antes de reintentar, comprobar si el DDL llegó a commitear (REST, con la clave
publicable; ver el snippet de la sección anterior):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://<ref>.supabase.co/rest/v1/bump_affinity?select=id&limit=1"
# 200 = la tabla existe, el DDL commiteó · 404 PGRST205 = rollback, no se aplicó nada
```

Ojo: `200` **no** prueba que las filas del sembrado estén. El rol anónimo
responde `Content-Range: */0` en `bump_affinity` y `bump_rules`, así que el
conteo real exige canal privilegiado (`npx supabase login` + Management API
`POST /v1/projects/<ref>/database/query`, o `psql` con la contraseña de la BD).

Todas las migraciones son idempotentes, así que reintentar es seguro. Para que
el reintento no vuelva a caer en el mismo timeout, **trocear** el script: una
petición por bloque, en este orden y sin envolverlo en `BEGIN;`/`COMMIT;` (el
editor ya abre su propia transacción por petición).

1. DDL: los `ALTER TABLE` / `CREATE TABLE` / `CREATE INDEX`.
2. Funciones: los `CREATE OR REPLACE FUNCTION`.
3. Datos: `SELECT public.seed_…();` y los bloques `DO $$ … $$` que reescriben
   filas.

Reglas obligatorias en migraciones que tocan tablas vivas (`bump_rules`,
`products`, `orders`…):

- `SET LOCAL lock_timeout = '5s';` al inicio de la transacción. Si otro proceso
  tiene la tabla tomada, la migración falla en 5s con un error de lock legible
  en vez de quedarse esperando hasta que el gateway corte la conexión.
- Constraints en dos pasos: `ADD CONSTRAINT … NOT VALID;` y después
  `ALTER TABLE … VALIDATE CONSTRAINT …;`. El `VALIDATE` corre con
  `SHARE UPDATE EXCLUSIVE` (no bloquea lecturas ni escrituras), así que la
  ventana de `ACCESS EXCLUSIVE` se reduce al `ALTER TABLE` inicial, que con
  `NOT VALID` no escanea la tabla. El estado final es idéntico al de un
  `ADD CONSTRAINT` validado.

---

## 9. Métodos de pago locales asíncronos (OXXO, SPEI, CoDi)

> **P6-1.** Estos métodos **no se habilitan desde el código**: Stripe los
> publica o los retira por cuenta, desde el Dashboard. El código ya soporta el
> ciclo completo; activarlos es un cambio de configuración.

### Habilitarlos

1. Stripe Dashboard → **Settings → Payment methods**.
2. Activar `OXXO`, `SPEI` y/o `CoDi`. Requiere cuenta Stripe con entidad
   mexicana (`MX`) y que Stripe haya aprobado cada método.
3. Verificar que la cuenta tenga **MXN** como moneda de liquidación.
4. Repetir en modo test y en modo live (son configuraciones separadas).

El `PaymentIntent` se crea con `automatic_payment_methods: { enabled: true }`
en `src/lib/payments.ts`, así que en cuanto el método esté activo en la cuenta
aparece en el formulario sin desplegar código. `paymentMethodOrder` en
`src/components/stripe/stripe-payment-form.tsx` solo controla el orden en que
se listan.

### Cómo se ve el ciclo de vida

| Evento Stripe | `payment_status` FoodOS | Notas |
| --- | --- | --- |
| `payment_intent.processing` | `processing` | El cliente ya recibió voucher/CLABE/QR. **No** acredita el pedido. |
| `payment_intent.requires_action` | `processing` | Igual que el anterior. |
| `payment_intent.succeeded` | `paid` | Único evento que acredita el pago. |
| `payment_intent.payment_failed` | `failed` | Rechazo explícito del emisor. |
| `payment_intent.canceled` (`cancellation_reason: "expired"`) | `expired` | Voucher caducado. |
| `payment_intent.canceled` (otro motivo) | `failed` | |
| *(ninguno)* | `expired` | Lo detecta el cron de reconciliación (ver abajo). |

### Por qué existe el cron de reconciliación

Stripe **no emite ningún evento** cuando un voucher OXXO o una CLABE SPEI
caduca: deja el intent en `requires_payment_method` sin `last_payment_error` y
sin webhook. Sin el barrido, el pedido se quedaría en `processing` para
siempre y el panel lo mostraría como pendiente de cobro.

`src/lib/reconcile-payments.ts` barre `foodos_orders` con PI no terminal y más
de 15 minutos de antigüedad, y aplica `FOODOS_VOUCHER_TTL_HOURS = 96` (4 días,
el máximo de Stripe para OXXO) para declarar `expired`. Corre dentro del cron
consolidado `/api/cron/daily` (job `reconcile-payments`); el endpoint
`/api/cron/reconcile-payments` sigue disponible para dispararlo a mano.

### Probar el flujo sin dinero real

1. Modo test de Stripe, con OXXO/SPEI habilitados en la cuenta de test.
2. Pedido en `/r/<slug>` → **Tarjeta** → elegir OXXO.
3. Aparecen las instrucciones locales (`local-payment-instructions.tsx`) con
   la referencia y el código de barras.
4. En Stripe Dashboard → el PI en modo test → **Succeed the payment**.
5. El webhook llega y el pedido pasa a `paid`; `/r/<slug>/pedido/<id>` lo
   refleja en el siguiente poll (cada 20 s) o con el botón
   *"Ya pagué, revisar estado"*.

> **`return_url`.** Los métodos asíncronos obligan a Stripe a tener una URL de
> retorno. El formulario ahora siempre la envía
> (`returnUrl || window.location.href`); antes iba `undefined`, lo que
> rompía el checkout en cuanto se habilitara un método con redirección. El
> storefront apunta al seguimiento del pedido.

---

## 10. Recordatorios y cancelación de pedidos FoodOS sin pago

> **P6-4.** `src/lib/foodos-payment-reminders.ts`, job
> `foodos-payment-reminders` dentro de `/api/cron/daily` (§1).

### Reglas

| Situación | Qué pasa |
| --- | --- |
| `payment_status` en `pending`/`processing`, ≥ 1 h de antigüedad | Recordatorio `payment:reminder_1h` (WhatsApp) |
| ≥ 24 h y el de 1 h ya salió | Recordatorio `payment:reminder_24h` (WhatsApp **y** correo) |
| ≥ 72 h, pago en `pending`, pedido en `status = 'pending'`, sin comprobante en revisión | Se cancela: `status = 'cancelled'` + `payment_status = 'expired'` + aviso `payment:expired` |
| `payment_status = 'processing'` | **Nunca** se cancela: el voucher tiene 96 h (§9) |
| Pedido ya aceptado por el restaurante (`status <> 'pending'`) | **Nunca** se cancela automáticamente |
| Comprobante esperando revisión en `foodos_order_payments` | Ni recordatorio ni cancelación: el comensal ya hizo su parte |

Un solo recordatorio por corrida (el umbral más avanzado que aplique), y la
dedupe real es el índice único `(order_id, event, channel)` de
`foodos_order_notifications` — correr el job dos veces no duplica mensajes.

### ⚠️ La cadencia real es diaria

El cron consolidado corre **una vez al día** (`0 12 * * *`). Los umbrales de
1 h / 24 h / 72 h significan "en algún momento del barrido diario siguiente",
no un instante exacto. El copy de los avisos está redactado para no prometer
horas precisas. Si se necesita precisión horaria hay que mover el proyecto a
Vercel Pro (crons por hora) o programar el barrido en **pg_cron** de Supabase
(§2, §4).

### Historial de incidentes

**`foodos_orders.updated_at` (2026).** La tabla se creó en
`00023_foodos.sql` **sin** columna `updated_at`, pero 8 handlers de
`src/lib/stripe-webhook-handlers.ts` escribían `{ payment_status, updated_at }`
sobre ella. PostgREST valida el payload completo del UPDATE, así que rechazaba
la sentencia entera con `PGRST204` y **cero filas cambiaban**; los handlers no
inspeccionaban el `error`, así que fallaba en silencio. Efecto: **ningún pago
con tarjeta de FoodOS pasaba a `paid`**, y como `listOrdersForSync` filtra por
`payment_status = 'paid'`, los pedidos pagados nunca llegaban a ventas del panel.

Arreglado en dos capas: se quitaron los 8 `updated_at` de los updates a
`foodos_orders` (los de `orders`/`order_upsells` intactos) y se añadió
`supabase/migrations/00084_foodos_orders_updated_at.sql` (columna + trigger
`trg_touch_foodos_orders` + índice `idx_foodos_orders_payment_created`).

**Al escribir handlers nuevos: usar solo columnas que existan en `00023` +
`00078` + `00080` + `00081` + `00084`, y revisar siempre el `error` del
update.** Hay una guardia de regresión en `stripe-webhook-handlers.test.ts`
(`"ningún handler escribe updated_at en foodos_orders"`).

**Producción deshabilitada por fair use de Vercel (17-sep-2026).** El sitio
dejó de servir: `resurte.me`, `www`, `resurte-me.vercel.app` y los previews
respondían **402 `DEPLOYMENT_DISABLED`** ("Payment required"), y los push a
`main` dejaron de crear deployments (el último build fue `848fbac`, 16-sep
16:37). `vercel redeploy` lo confirma con el mensaje exacto:

```bash
vercel redeploy https://resurte-<hash>-victor-bustillos-projects.vercel.app
# Error: Your Team exceeded our fair use limits and has been blocked. (402)
```

La causa no es el código: la API del equipo reporta el bloqueo del plan
**Hobby** por el recurso **Active CPU** (4 h/mes incluidas en Hobby):

```bash
TOK=$(python3 -c "import json;print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json'))['token'])")
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.vercel.com/v2/teams/team_WmuhafAcqVEvEcjvVssC4Kc8" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('softBlock'))"
# {'blockedAt': 1789603990031, 'reason': 'FAIR_USE_LIMITS_EXCEEDED', 'blockedDueToOverageType': 'fluidCpuDuration'}
```

Usar `vercel api`, no un `curl` directo: el token de
`~/Library/Application Support/com.vercel.cli/auth.json` **no** autentica contra
el REST de Vercel (cualquier endpoint responde `403 invalidToken`), pero el CLI
sí lo usa para firmar la petición. `vercel usage` tampoco sirve en Hobby:
responde `Costs not found (404)`.

`blockedAt` = **17-sep-2026 00:13 UTC** (16-sep 18:13 CDMX). El fin de ciclo
(**18-sep-2026 07:00 UTC**) es una **estimación, no un dato verificable**: la API
devuelve `billing.period` = `null`, así que la fecha de reinicio no se puede
confirmar por API.

Un `402` lo sirve el **edge** antes de invocar la función (responde en ~0.35 s
sin SSR), así que una sonda de estado suelta no consume Active CPU. Lo que sí
consume es cualquier `page.goto` de Playwright contra un sitio **sano**.

Remedios, en orden de rapidez:

1. **Subir el equipo a Vercel Pro** — levanta el bloqueo de inmediato y da
   Active CPU por uso. Es además lo que exigen las Fair Use Guidelines: Hobby
   es solo para uso personal no comercial, y esta app cobra con Stripe.
2. **Esperar el reinicio del ciclo** (18-sep 07:00 UTC, estimado) — el bloqueo
   se levanta solo, pero son ~30 h de sitio caído.
3. **Bajar el consumo de Active CPU** antes de que el ciclo vuelva a empezar:
   el costo lo dominan las regeneraciones ISR. Las páginas de catálogo
   (`/[slug]`, `/[slug]/categoria/[categorySlug]`,
   `/[slug]/producto/[productSlug]`) declaran `revalidate = 300`: el build
   prerenderiza 538 páginas (el resto del catálogo se genera bajo demanda,
   `dynamicParams=true`) y el sitemap mantiene calientes ~500 URLs de
   ciudad/categoría/colección, así que cada una vuelve a renderizar en función
   cada 5 minutos como máximo. Subir ese `revalidate` (a 1 h o 1 día) es la
   palanca más directa; recortar `generateStaticParams` y las URLs del sitemap
   es la segunda. El cron ya está consolidado en uno diario y `src/proxy.ts` ya
   excluye assets del matcher. El desglose por ruta requiere Observability Plus
   (Pro): `vercel metrics vercel.function_invocation.function_cpu_time_ms --group-by route`.

No hay endpoint público para levantar el bloqueo: solo cambiar de plan o
esperar. Vercel manda un correo al `vabustillos@gmail.com` con el detalle.

**Resuelto el 16-sep-2026 18:47 CDMX (17-sep 00:47 UTC).** El equipo se pasó a
**Pro**: `softBlock` quedó en `null` y el sitio volvió a servir de inmediato. Se
redesplegó producción (`vercel redeploy`) y se confirmó con smoke: `/`,
`/compartir`, `/recompensas`, `/blog`, `/checkout` y `/api/categories` en 200,
14 categorías, precios por unidad renderizados y `POST /api/cart/bumps` devolviendo
ofertas reales (por ejemplo `recipe_collection` con `discount_pct`). Lección
operativa: con Hobby, 538 páginas ISR a `revalidate = 300` bastan para agotar
las 4 h/mes de Active CPU; en Pro el recurso se cobra por uso, pero conviene
subir el `revalidate` igual para no pagar regeneraciones que nadie mira.

### Migraciones históricas de aplicación manual (hoy aplicadas)

Se aplicaron pegando el SQL en el editor, así que **no tienen fila en
`supabase_migrations.schema_migrations`** (el editor no registra migraciones).
Sus objetos están vivos en producción —verificado por sonda REST y por
`npx supabase inspect db`—, pero el hueco del ledger importa: como `db push`
solo empuja versiones locales **mayores** que la máxima remota, y la remota
máxima ya es `00153`, estas migraciones **no se re-aplican solas**. En un
entorno nuevo hay que aplicarlas a mano o por CLI. Se documentan por el síntoma
que provocan si faltan:

1. `00082_foodos_payment_proofs.sql` — sin ella subir un comprobante falla.
2. `00083_foodos_order_notifications.sql` — sin ella los avisos se envían pero sin dedupe.
3. `00084_foodos_orders_updated_at.sql` — sin ella nada se rompe, pero el timestamp queda congelado.
4. `00085_stripe_connect.sql` — sin ella el panel de cobros falla al leer `stripe_*`.
5. `00116_product_sales_view.sql` — sin ella el panel de productos carga igual
   (el listado detecta la vista ausente y vuelve al orden por nombre, con el
   aviso ámbar de migraciones), pero **el orden "Más vendidos" no ordena**.
   Aditiva e idempotente. Sonda: `products_with_sales?select=id&limit=1` →
   `404`/`PGRST205` pendiente · `401`/`403` aplicada. **No esperes `200`:** el
   REVOKE de la propia migración deja a `anon` sin permiso.
6. `00117_address_book.sql` — sin ella el checkout sigue funcionando (el
   invitado arranca en blanco y el usuario cae al prefill clásico), pero **no
   se guarda la última dirección usada** ni hay soft delete de direcciones.
   Aditiva e idempotente; reescribe el RPC del job `cleanup-guest-addresses`
   (§2). Sonda: `addresses?select=id,last_used_at,deleted_at&limit=1` →
   `400`/`42703` pendiente · `200` aplicada.

Las filas ausentes del ledger son nueve: `00043`, `00082`, `00083`, `00084`,
`00085`, `00116`, `00117`, `00143` y `00144`.

**Para saber si te falta algo, no adivines ni pegues SQL "por si acaso": corre
`npm run db:status`.** Read-only, y compara el ledger en las dos direcciones.

Estado medido el **17-sep-2026**: los objetos de las seis están vivos, pero el
ledger **no está limpio**. Tiene una versión remota huérfana, `20260917190303`,
que es `00154_marketplace_delivery_proof.sql` aplicada por **MCP**:
`apply_migration` registra un timestamp generado en vez del número del archivo.
No es cosmético — la CLI exige que el historial remoto sea un prefijo de la lista
local, así que esa fila deja `db push` **bloqueado por completo** con
`LegacyDbPushMissingLocalError`: no se puede aplicar ninguna migración nueva
hasta repararla. `npm run db:status` lo detecta y te da el comando exacto. La
regla y el historial de incidentes están en «Regla: las migraciones numeradas se
aplican por CLI, nunca por MCP».

### Migraciones recientes ya aplicadas a producción

`00112_bump_affinity.sql`, `00113_user_carts_bumps.sql` y
`00114_orders_coupon_code.sql` se aplicaron a producción el **16-sep-2026**.
Quedan documentadas por el síntoma que provocan si faltan en un entorno nuevo:

- `00112_bump_affinity.sql` — sin ella el ranking de bumps cae al motor por
  tags y el panel *Afinidad entre productos* (`/admin/marketing`) devuelve
  error al leer `bump_affinity`. Idempotente (`BEGIN` + `IF NOT EXISTS` +
  `CREATE OR REPLACE` + `ON CONFLICT`). Termina con
  `SELECT public.seed_bump_affinity();`, que resuelve los pares canónicos
  contra el catálogo por slug (los slugs ausentes se omiten en silencio), así
  que en un entorno nuevo hay que ejecutar esa función después del catálogo.
  Desde el incidente `Failed to fetch (api.supabase.com)` lleva el blindaje
  anti-timeout descrito en §9: `SET LOCAL lock_timeout = '5s'` y el CHECK de
  `trigger_type` en dos pasos (`NOT VALID` + `VALIDATE CONSTRAINT`).
- `00113_user_carts_bumps.sql` — sin ella `PUT /api/cart/bumps/selection` y
  `POST /api/cart/bumps/hydrate` devuelven 500 y la selección de bumps solo
  sobrevive en `localStorage` (el cliente degrada en silencio, no rompe la
  app). Aditiva e idempotente.
- `00114_orders_coupon_code.sql` — sin ella el panel de pedidos carga igual (el
  código reintenta sin la columna vía `src/lib/admin/order-selects.ts`), pero
  **un pago rechazado consume el cupón del cliente sin devolverlo**: el
  checkout no audita el descuento, `PATCH /api/orders/[id]/status` omite la
  liberación y el webhook de Stripe no devuelve el cupón reservado. Aditiva e
  idempotente. Detalle del incidente en §9.

Verificación contra el REST de producción con la clave publicable (basta el
`apikey`; un `200` confirma que la tabla o la columna existe, **no** que tenga
filas: el rol anónimo no las ve):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://<ref>.supabase.co/rest/v1/bump_affinity?select=id&limit=1"    # 200 aplicada · 404 pendiente
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $KEY" \
  "https://<ref>.supabase.co/rest/v1/user_carts?select=bumps&limit=1"   # 200 aplicada · 400 pendiente
```

**Verificación real de que el sembrado está (17-sep-2026).** El chequeo de arriba
solo prueba que el DDL commiteó. La forma de comprobar las filas sin credenciales
es el endpoint público de bumps, que corre con service role:

```bash
# con un producto que sea `source_slug` de un par curado (p.ej. cebolla-blanca)
curl -s -X POST "https://resurte.me/api/cart/bumps?debug=1" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":23,"quantity":1}],"limit":50}'
```

Si `bump_affinity` está sembrada, la respuesta trae como primeros bumps los
destinos exactos de ese par, con `"description":"Ideal con Cebolla Blanca"` y
`discount_pct: 0.1`. Si la tabla no existiera, `_debug.reason` sería
`bump_affinity_fetch_error` y solo saldría el tier de recetario. Comprobado: 203
pares definidos, los curados se sirven, el CHECK acepta `ingredient_affinity` y
los 12 títulos de `recipe_collection` quedaron reescritos (0 títulos viejos).

**Cuidado con el ledger.** Si la migración se aplicó pegándola en el SQL Editor,
`supabase_migrations.schema_migrations` **no** tiene su fila (el editor no
registra migraciones). Un `supabase db push` posterior la reintentará; es
inofensivo porque son idempotentes, pero el ledger queda desincronizado. Solo se
puede leer por canal privilegiado (Management API `POST /v1/projects/<ref>/database/query`
o `psql`), no por REST: `supabase_migrations` no está expuesto por PostgREST
(`406 PGRST106`).

### Regla: las migraciones numeradas se aplican por CLI, nunca por MCP

`apply_migration` del MCP de Supabase registra la fila del ledger con un
**timestamp generado** (`20260917172228`) en vez del número del archivo
(`00141`). Eso rompe la regla de prefijo de la CLI v2 —el historial remoto debe
ser un prefijo de la lista local— y a partir de ahí `db push` falla con
`LegacyDbPushMissingLocalError`. El daño secundario es peor: la versión del
ledger deja de corresponder al nombre del archivo, así que las pruebas que
barren `supabase/migrations/*.sql` por nombre de archivo (por ejemplo
`src/lib/order-enum.contract.test.ts`, que reconstruye el enum `payment_status`
desde las migraciones) **no pueden reconciliar** lo aplicado con lo declarado.
La regla, entonces: `supabase migration new <nombre>` para crear y
`supabase db push` para aplicar. El SQL Editor sirve para una urgencia, pero
deja el ledger sin fila (párrafo anterior) y la CLI lo reintentará.

El **17-sep-2026** se reparó un arrastre de 13 filas con timestamp: 12 se
renumeraron a `00141`–`00152` —mapeadas por nombre, posición y md5 insensible a
espacios contra el archivo local, 7 de ellas coincidencia exacta— y 1
(`20260917180922_admin_role_trigger_hardening`) se eliminó porque su cuerpo
completo, un único `REVOKE ALL ON FUNCTION public.sync_admin_users_to_profile()
FROM PUBLIC, anon, authenticated;`, ya estaba byte a byte en
`00145_admin_role_single_source.sql:90` y su efecto estaba vivo en la base
(`has_function_privilege` → `anon_exec = false`, `auth_exec = false`). Antes de
la reparación el ledger tenía 152 filas y 13 versiones sin cinco dígitos;
después, 152 filas con `00001`…`00152` y cero.

**Recaída el mismo 17-sep-2026.** Horas después de esa reparación apareció una
fila nueva con timestamp, `20260917190303`, correspondiente a
`00154_marketplace_delivery_proof.sql`: el MCP se volvió a usar. No es un
arrastre histórico, es la regla de arriba incumpliéndose otra vez — por eso la
detección tiene que ser un comando y no una revisión a ojo. El DDL de `00154` **sí
está aplicado** (sus tres columnas `orders.delivery_proof_*` responden en
producción), así que la reparación es solo de ledger:

```bash
npx supabase migration repair --status reverted 20260917190303
npx supabase migration repair --status applied 00154
```

`migration repair` escribe **solo** `supabase_migrations.schema_migrations`; no
ejecuta el SQL de la migración. Mientras esa fila siga ahí, `db push` falla
entero y **ninguna** migración nueva se puede aplicar.

**Cinco divergencias de contenido que NO son drift de ledger.** Las filas
`00144`, `00145`, `00146`, `00147` y `00152` comparten nombre y posición con su
archivo local pero tienen texto distinto: son **revisiones** de la misma
migración, con la local más nueva (el caso de `00145` es explícito: la local
fusiona la migración huérfana de arriba). La regla de prefijo mira números de
versión, no cuerpos de archivo, así que no bloquean `db push`. Sobrescribir la
local con el texto remoto destruiría la revisión nueva: se documentan y se
dejan como están.

Sonda del estado del ledger:

```bash
npm run db:status                     # resumen + comandos de reparación si hace falta
npx supabase migration list --linked  # detalle fila por fila
```

`db push --dry-run` responde `{"upToDate":true}` solo cuando el ledger está sano.
Si hay una versión remota sin archivo local (típico de `apply_migration` por MCP),
`dry-run` y `push` **fallan** con `LegacyDbPushMissingLocalError`; `db:status` lo
detecta y te da la reparación.

---

## 11. Cobros con Stripe Connect Express

Hasta `00085`, **todo** el dinero de FoodOS entraba a la cuenta Stripe de
Resurte.me y había que dispersarlo a mano a cada restaurante: la plataforma
custodiaba fondos de terceros. Con Connect cada restaurante tiene su propia
cuenta Express y el cargo se hace como *destination charge*: Stripe liquida al
restaurante y la plataforma nunca toca el dinero.

### Interruptor de plataforma

| Variable | Valores | Efecto |
| --- | --- | --- |
| `STRIPE_CONNECT_ENABLED` | `true` / `1` (cualquier otra cosa = apagado) | Enruta los cargos de tarjeta a la cuenta conectada del restaurante. **Por defecto apagado.** |
| `STRIPE_CONNECT_COUNTRY` | ISO-2, por defecto `MX` | País de las cuentas Express. |

`STRIPE_CONNECT_ENABLED` está apagado a propósito: Connect **debe activarse
antes en el Dashboard de Stripe** (Settings → Connect). Si se enciende sin
activarlo, los cargos fallan. Como el enrutamiento se decide en runtime, el
operador puede apagarlo y volver al cobro contra la plataforma **sin desplegar
código**.

Con el interruptor apagado el comportamiento es idéntico al anterior: la cuenta
conectada se sigue registrando y verificando, pero los cargos van a la
plataforma.

### Rollout restaurante por restaurante

El enrutamiento no depende sólo del interruptor, sino de que la cuenta esté
**cobrable**. `buildDestinationChargeParams()` devuelve `{}` —y el cargo se crea
contra la plataforma— cuando:

- el interruptor está apagado, o
- el restaurante no tiene `stripe_account_id`, o
- `stripe_charges_enabled` / `stripe_payouts_enabled` están en `false`, o
- Stripe reporta `requirements.disabled_reason`.

Por eso se puede encender el interruptor con restaurantes a medio verificar: los
que ya están listos cobran directo a su banco y el resto sigue igual. El panel
(`/panel/foodos/restaurante`, sección "Cobros en línea") avisa cuando un
restaurante todavía está cobrando a la cuenta de la plataforma.

### Comisión de la plataforma

`foodos_restaurants.platform_fee_percent` (0–100, por defecto **0** = paridad
con Take App). `computeApplicationFee()` calcula la comisión en centavos y
devuelve `0` —omitiendo `application_fee_amount`— cuando el resultado sería `0`
o `≥ total`, porque Stripe rechaza valores fuera de `0 < fee < amount` y una
comisión del 100 % dejaría al restaurante sin nada.

### Ciclo de vida

1. El dueño entra a `/panel/foodos/restaurante` → "Conectar mis cobros".
2. `startConnectOnboarding()` crea la cuenta Express (`accounts.create`) si no
   existe, guarda `stripe_account_id` y devuelve un `account_onboarding` link.
3. El dueño captura identidad y datos bancarios en el formulario de Stripe.
4. Stripe regresa a `?connect=done` (o `?connect=refresh` si el link caducó); la
   tarjeta limpia el parámetro y relee el estado contra Stripe.
5. En paralelo, el webhook `account.updated` llama a
   `handleConnectAccountUpdated()` → `syncConnectAccount()`, que escribe los
   flags y sella `stripe_onboarded_at` una sola vez.
6. Con `charges_enabled && payouts_enabled` la cuenta es cobrable y los
   siguientes cargos van con `transfer_data.destination`.

### ⚠️ Seguridad: las columnas `stripe_*` son de sólo lectura para el dueño

La política RLS de `foodos_restaurants` ("Owner manages restaurants") es **a
nivel de fila**, no de columna: sin nada más, un dueño podría hacer
`update foodos_restaurants set stripe_account_id = '<cuenta de un tercero>'` y
desviar los pagos de sus propios comensales a esa cuenta.

Por eso `00085` hace un **`REVOKE UPDATE` a nivel de columna** de las 7 columnas
`stripe_*` + `platform_fee_percent` sobre `authenticated` y `anon`. Las
escrituras legítimas pasan por `createServiceClient()` en
`src/lib/stripe-connect.ts`, `src/app/panel/foodos/connect-actions.ts` y
`src/lib/payments.ts`. **No agregar estas columnas a `upsertRestaurant()` ni a
ningún payload construido desde el cliente.**

### Notas de implementación

- **Los destination charges no cambian el webhook.** Un destination charge sigue
  siendo un PaymentIntent normal sobre la cuenta de la plataforma, así que
  `payment_intent.succeeded` llega con `metadata.foodos_order_id` intacto y los
  handlers de §9/§10 funcionan igual.
- **No escribir `updated_at` en `foodos_orders`** (ver el incidente de §10).
- `application_fee_amount` y `connected_account_id` se persisten en
  `foodos_orders` **sólo** cuando el cargo realmente se enrutó, para no dejar
  registros de una comisión que nunca se cobró.

---

## 12. Verificación mínima antes de push (local y CI)

### Los comandos

| Comando | Qué encadena | Cuándo |
| --- | --- | --- |
| `npm run verify` | `typecheck` → `lint` → `test` → `knip` | antes de cada commit |
| `npm run build` | `next build` | antes de cerrar una ronda (es el más lento) |

`npm run typecheck` (`tsc --noEmit`) existe como script propio desde la ronda 8.
Antes el pipeline invocaba `npx tsc --noEmit` mientras el desarrollador tecleaba
otra cosa — exactamente lo que prohíbe la invariante 11 de
`docs/agents/README.md` (`medir con un comando distinto es medir otra cosa`).

### El hook de pre-push: avisa, no bloquea

El checkout de este repositorio **lo comparten varias sesiones a la vez**, así que
un hook que aborte el push castigaría a quien no hizo el cambio. `.githooks/pre-push`
corre `npm run typecheck` y `npm run lint` con la salida silenciada y, si algo sale
rojo, imprime un aviso — **siempre termina en `exit 0`**. El CI decide.

Está **desactivado por defecto** (git solo mira `.git/hooks/`). Para activarlo:

```bash
git config core.hooksPath .githooks     # activar
git config --unset core.hooksPath       # desactivar
```

Degrada en silencio —sin ruido y con `exit 0`— si no hay `node_modules` o no hay
`npm` en el `PATH`. No corre `knip` a propósito: su latencia no se justifica en un
hook de push, y `knip` mide el **working tree**, no `HEAD`.

### El pipeline

`.github/workflows/ci.yml` declara `concurrency` con
`group: ${{ github.workflow }}-${{ github.ref }}` y `cancel-in-progress: true`, y
ordena los gates así:

`Install` → `Typecheck` → `Lint` → `Unit tests` → **`Build`** → `Knip`

`Knip` sigue bloqueando el pipeline; lo único que cambió es que dejó de **esconder**
`Build`. Con `Knip` delante, `Build` nunca llegaba a ejecutarse y aparecía como `-`
en todos los listados de pasos: el gate más caro del repo llevaba sin medir nada
mientras el pipeline parecía tenerlo. El job `e2e` va aparte y corre
`npm run test:e2e` (`playwright test --grep @ci`).

`src/lib/ci-config.contract.test.ts` vigila todo lo anterior y falla si alguna de
esas piezas se pierde.

---

## Referencias

- `vercel.json` (crons + headers de seguridad), `src/app/api/cron/*`, `src/app/api/workflows/*`, `src/app/api/foodos/campaigns/run`.
- Migraciones: `supabase/migrations/00039_rate_limits.sql`, `00042_cleanup_guest_addresses.sql`, `00043_pg_cron_cleanup_guest_addresses.sql`, `00044_pg_cron_purge_rate_limits.sql`, `00055_panel_entries.sql`, `00056_panel_entries_realtime.sql`, `00057_panel_rows.sql`, `00058_panel_members.sql`, `00082_foodos_payment_proofs.sql`, `00083_foodos_order_notifications.sql`, `00084_foodos_orders_updated_at.sql`, `00085_stripe_connect.sql`.
- Pagos FoodOS: `src/lib/payments.ts` (creación del PI), `src/lib/stripe-webhook-handlers.ts` (transiciones de estado), `src/lib/reconcile-payments.ts` (caducidad de vouchers), `src/lib/foodos-notifications.ts` (avisos al comensal), `src/lib/foodos-payment-reminders.ts` (recordatorios y cancelación).
- Cobros Connect: `src/lib/stripe-connect.ts` (cuentas Express, destination charges, sincronización), `src/app/panel/foodos/connect-actions.ts` (server actions), `src/app/panel/foodos/restaurante/_components/connect-payments-card.tsx` (UI).
- Relacionado: `docs/MOCKS.md` (contrato de fallback), `REPORTE.md`, `supabase/ESQUEMA.md`.
