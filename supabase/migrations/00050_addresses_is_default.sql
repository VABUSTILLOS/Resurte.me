-- ============================================================
-- 00050_addresses_is_default.sql
--
-- Direcciones guardadas para usuarios logueados (Requerimiento 2).
--
-- Extiende la tabla `addresses` existente (NO se crea `user_addresses`
-- duplicada). Mapeo con la especificación solicitada:
--   number     → exterior_number
--   references → delivery_notes
--   zip_code   → postal_code
--   city/state → texto resuelto en el checkout (city_id opcional como
--                referencia fuerte a `cities` cuando se conoce)
--
-- Nuevas columnas:
--   is_default BOOLEAN NOT NULL DEFAULT false
--     → una (y solo una) dirección predeterminada por usuario. La API
--       (POST /api/orders) desmarca las demás al marcarla.
--   city_id BIGINT REFERENCES cities(id)
--     → referencia opcional a la ciudad; se rellena al crear/reutilizar
--       la dirección desde el checkout (que siempre conoce city_id).
--
-- Retrocompatible: ADD COLUMN IF NOT EXISTS + índice IF NOT EXISTS.
-- Las consultas actuales (SELECT *) siguen funcionando sin cambios.
-- ============================================================

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS city_id BIGINT REFERENCES public.cities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.addresses.is_default IS
  'Dirección predeterminada del usuario (máx. una por user_id). La API la gestiona al guardar desde el checkout.';

COMMENT ON COLUMN public.addresses.city_id IS
  'Ciudad de entrega (cities.id). Opcional; se rellena al crear/reutilizar la dirección desde el checkout.';

CREATE INDEX IF NOT EXISTS idx_addresses_user_default
  ON public.addresses (user_id)
  WHERE is_default = true;

-- ============================================================
-- set_default_address(user_id, address_id)
--
-- Marca UNA dirección como predeterminada de forma atómica:
-- primero desmarca las demás del mismo usuario y luego fija la
-- elegida. Verifica que la dirección pertenezca al usuario.
-- Se invoca desde POST /api/orders con el cliente service_role.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_default_address(
  p_user_id    UUID,
  p_address_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owned BIGINT;
BEGIN
  -- Defensa: la dirección debe pertenecer al usuario.
  SELECT id INTO v_owned
  FROM public.addresses
  WHERE id = p_address_id
    AND user_id = p_user_id;

  IF v_owned IS NULL THEN
    RAISE EXCEPTION 'address_not_owned';
  END IF;

  -- Desmarcar las demás direcciones del usuario.
  UPDATE public.addresses
  SET is_default = false
  WHERE user_id = p_user_id
    AND is_default = true;

  -- Marcar la elegida.
  UPDATE public.addresses
  SET is_default = true
  WHERE id = p_address_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_address(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_address(UUID, BIGINT) TO service_role;
