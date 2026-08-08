-- ============================================================
-- 00044_pg_cron_purge_rate_limits.sql
--
-- Programa la purga periódica de la tabla public.rate_limits
-- (migración 00039) con pg_cron (Supabase).
--
-- Contexto: consume_rate_limit hace limpieza perezosa — solo borra
-- ventanas vencidas de las keys que se vuelven a consultar. Las keys
-- huérfanas (p. ej. muchas IPs distintas bajo un ataque de
-- enumeración) se acumulan sin límite y la tabla crece indefinidamente.
--
-- Enfoque: job diario que borra filas con ventana vencida hace más de
-- 24 horas. Corre dentro de la BD como superusuario de pg_cron, así
-- que no depende de HTTP ni de CRON_SECRET. Como el job es superuser,
-- la tabla rate_limits (RLS on, revocada a anon/authenticated) sigue
-- protegida: el DELETE se ejecuta con privilegios de la BD, no del
-- cliente.
--
-- Job: "purge-rate-limits", diario 04:17 UTC (tras el cleanup de guest
-- de las 04:00), retención de 24 horas.
-- ============================================================

-- Idempotencia: si la migración se re-aplica (preview/reset), elimina
-- el job existente antes de volver a crearlo para no duplicar.
SELECT cron.unschedule('purge-rate-limits')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'purge-rate-limits'
);

-- Diario 04:17 UTC, borra ventanas vencidas hace más de 24h.
SELECT cron.schedule(
  'purge-rate-limits',
  '17 4 * * *',
  $$DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day'$$
);
