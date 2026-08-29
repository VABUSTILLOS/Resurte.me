# Operaciones — Crons y mantenimiento (Resurte.me)

> Instructivo operativo de **jobs programados (crons)**, variables de entorno, limpieza de datos y procedimientos de verificación.

## 1. Crons programados en Vercel (`vercel.json`)

Todos los endpoints cron están **protegidos con `CRON_SECRET`** (patrón fail-closed: si la variable no existe o el header no coincide → `401 Unauthorized`). Vercel envía automáticamente el header `Authorization: Bearer <CRON_SECRET>` en sus crons.

| Job | Ruta | Schedule (UTC) | Hora MX (CST) | Qué hace |
| --- | --- | --- | --- | --- |
| Payment reminders | `/api/workflows/payment-reminders` | `0 8 * * *` | 2:00 a.m. | Envía recordatorios de pago para órdenes con pago pendiente (`checkAndSendPaymentReminders`) |
| Abandoned cart | `/api/workflows/trigger?job=abandoned-cart` | `0 12 * * *` | 6:00 a.m. | Recuperación de carritos abandonados (`checkAbandonedCarts`) |
| Reactivation | `/api/workflows/trigger?job=reactivation` | `0 9 * * *` | 3:00 a.m. | Reactivación de usuarios inactivos (`checkInactiveUsers`) |
| FoodOS campaigns | `/api/foodos/campaigns/run` | `0 0 * * *` | 18:00 (día anterior) | Ejecuta campañas FoodOS programadas vencidas (mensajes WhatsApp a clientes objetivo) |

> Los schedules están en **UTC**. Las horas MX mostradas asumen CST (UTC−6); ajustar en verano (CDT, UTC−5) según la zona del negocio.

> ⚠️ **Además** hay 2 jobs de mantenimiento en **pg_cron (Supabase)**, no en Vercel: `cleanup-guest-addresses` (domingos 04:00 UTC, retención 30 días — ver §2) y `purge-rate-limits` (diario 04:17 UTC, retención 24h — ver §4). La tabla anterior solo lista los crons de Vercel.

### Implementación (referencia)
- `src/app/api/workflows/payment-reminders/route.ts` — GET, `checkAndSendPaymentReminders()`
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
| `CRON_SECRET` | **Sí (crons)** | Autoriza los 4 endpoints cron | Fail-closed: sin ella los crons devuelven 401. Rotar vía Vercel dashboard → Settings → Environment Variables. |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Cliente Supabase (browser + server) | Pública. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Cliente browser | Pública; RLS protege las tablas. |
| `SERVICE_ROLE_KEY` | Sí | Server actions + endpoints con `createServiceClient` | **Nunca** exponer al browser. |
| `STRIPE_SECRET_KEY` | Sí | Crear intents, confirmar pagos | `sk_live_...` en producción. |
| `STRIPE_WEBHOOK_SECRET` | Sí | Validar webhooks Stripe | `whsec_...`. |
| `ADMIN_API_SECRET` | Sí | Endpoints admin (`x-admin-secret` header) | Sin fallback hardcodeado desde Fase 1. |

### Rotación de `CRON_SECRET`
1. Vercel → Project → Settings → Environment Variables → editar `CRON_SECRET` → **nuevo valor largo y aleatorio** (p.ej. `openssl rand -hex 32`).
2. Re-deployar (los cambios de env aplican al siguiente deploy).
3. Verificar un cron manualmente (sección 5).

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

## Referencias

- `vercel.json` (crons + headers de seguridad), `src/app/api/cron/*`, `src/app/api/workflows/*`, `src/app/api/foodos/campaigns/run`.
- Migraciones: `supabase/migrations/00039_rate_limits.sql`, `00042_cleanup_guest_addresses.sql`, `00043_pg_cron_cleanup_guest_addresses.sql`, `00044_pg_cron_purge_rate_limits.sql`, `00055_panel_entries.sql`, `00056_panel_entries_realtime.sql`, `00057_panel_rows.sql`, `00058_panel_members.sql`.
- Relacionado: `docs/MOCKS.md` (contrato de fallback), `REPORTE.md`, `supabase/ESQUEMA.md`.
