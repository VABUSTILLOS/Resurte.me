-- ============================================================
-- 00043_pg_cron_cleanup_guest_addresses.sql
--
-- Programa la limpieza de direcciones anónimas huérfanas con
-- pg_cron (Supabase). Cierra el GAP operativo documentado en
-- docs/OPS.md §2: el endpoint HTTP /api/cron/cleanup-guest-addresses
-- existe pero NO está en vercel.json (para no consumir el plan
-- gratuito), por lo que las direcciones guest se acumulaban sin
-- límite.
--
-- Enfoque: llamada DIRECTA al RPC public.cleanup_orphan_guest_addresses
-- desde pg_cron — no depende de HTTP, no consume el plan de Vercel
-- y no necesita CRON_SECRET (corre dentro de la BD).
--
-- Job: "cleanup-guest-addresses", domingos 04:00 UTC (22:00 MX sáb),
-- retención de 30 días.
-- ============================================================

-- Habilitar pg_cron (idempotente; solo la primera vez hace algo).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotencia: si la migración se re-aplica (preview/reset), elimina
-- el job existente antes de volver a crearlo para no duplicar.
SELECT cron.unschedule('cleanup-guest-addresses')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-guest-addresses'
);

-- Domingos 04:00 UTC, retención de 30 días, llamada directa al RPC.
SELECT cron.schedule(
  'cleanup-guest-addresses',
  '0 4 * * 0',
  $$SELECT public.cleanup_orphan_guest_addresses(30)$$
);
