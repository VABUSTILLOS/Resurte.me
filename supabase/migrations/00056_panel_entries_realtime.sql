-- ============================================================
-- Resurte.me — Realtime para panel_entries (multi-dispositivo)
--
-- Fase 4.1: con la tabla en la publicación de Realtime, los clientes
-- con sesión se suscriben a postgres_changes y reciben al instante los
-- cambios hechos desde otro dispositivo (RLS filtra a las filas del
-- propio user_id; guests no reciben eventos — anon no tiene permisos —
-- y usan el fallback de re-pull al volver a la pestaña).
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.panel_entries;
