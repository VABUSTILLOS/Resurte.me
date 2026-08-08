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

### Implementación (referencia)
- `src/app/api/workflows/payment-reminders/route.ts` — GET, `checkAndSendPaymentReminders()`
- `src/app/api/workflows/trigger/route.ts` — GET con `?job=abandoned-cart|reactivation` (imports dinámicos de `@/lib/email-workflows`); POST manual (admin/autenticado)
- `src/app/api/foodos/campaigns/run/route.ts` — GET, `runDueFoodosCampaigns()`

---

## 2. 🔴 GAP: `cleanup-guest-addresses` NO está programado

El endpoint **existe y está listo**, pero **no está en `vercel.json`** (decisión deliberada para no consumir el plan gratuito de Vercel, documentada en el propio archivo):

- **Ruta**: `src/app/api/cron/cleanup-guest-addresses/route.ts`
- **Qué hace**: borra direcciones anónimas huérfanas (`guest_token` sin `user_id`) más viejas que `days` (default 30) vía el RPC `cleanup_orphan_guest_addresses(days)` (migración `supabase/migrations/00042_cleanup_guest_addresses.sql`).
- **Riesgo de no ejecutarlo**: las direcciones guest (checkout anónimo) **se acumulan sin límite** en la tabla `addresses`. No compromete la integridad (no se usan para pagos), pero crece la tabla y expone PII huérfana innecesaria.
- **Protección**: `CRON_SECRET` fail-closed; valida `days` entre 1 y 3650.

### Opción A — Programar en Supabase con `pg_cron` (recomendado, plan gratuito)
El plan de Vercel no se toca y corre en la misma infraestructura de la BD:

```sql
-- Habilitar pg_cron (solo primera vez)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programa semanal: domingos 4:00 a.m. UTC, retención de 30 días
SELECT cron.schedule(
  'cleanup-guest-addresses',
  '0 4 * * 0',
  $$SELECT net.http_post(
    url := 'https://resurte.me/api/cron/cleanup-guest-addresses?days=30',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    )
  )$$
);
```

> Requiere la extensión `pg_net`/`net.http_post` o un helper de HTTP desde Supabase. Alternativa más simple si no se quiere HTTP:

```sql
-- Ejecución directa del RPC (sin HTTP, sin CRON_SECRET) — recomendada
SELECT cron.schedule(
  'cleanup-guest-addresses-direct',
  '0 4 * * 0',
  $$SELECT cleanup_orphan_guest_addresses(30)$$
);
```

Esta segunda opción **no consume el plan de Vercel y no depende del endpoint HTTP** — llama el RPC directamente en la BD.

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

> **Backlog**: la tabla `rate_limits` (migración `00039`) no tiene purga. Si se escala el uso de `/api/foodos/orders`, añadir un cron de limpieza de filas viejas.

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

## 6. Endpoints de dinero sin rate limit (backlog — no priorizado)

La infraestructura durable de rate limiting existe (tabla `rate_limits` + RPC `consume_rate_limit`, migración `00039`) y **solo** `/api/foodos/orders` la usa. Estos endpoints públicos/autenticados de dinero **NO** tienen rate limit (sí tienen auth/`requireAuth`):

| Endpoint | Riesgo |
| --- | --- |
| `POST /api/redeem` | Canje de créditos — abuso = deuda de wallet (mitigado por advisory lock, pero sin límite de peticiones) |
| `POST /api/orders` | Creación de órdenes de compra |
| `POST /api/coupons/validate` | Validación de cupones — enumeración/abuso |

**Decisión pendiente**: añadir `consume_rate_limit` a estos 3 endpoints en una fase futura.

---

## Referencias

- `vercel.json` (crons + headers de seguridad), `src/app/api/cron/*`, `src/app/api/workflows/*`, `src/app/api/foodos/campaigns/run`.
- Migraciones: `supabase/migrations/00039_rate_limits.sql`, `00042_cleanup_guest_addresses.sql`.
- Relacionado: `docs/MOCKS.md` (contrato de fallback), `REPORTE.md`, `supabase/ESQUEMA.md`.
