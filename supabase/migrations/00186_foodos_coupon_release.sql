-- ============================================================================
-- 00186 — Liberar el cupón cuando se cancela un pedido FoodOS
--
-- SÍNTOMA QUE CIERRA
--   `increment_foodos_coupon_usage` (00080, reescrita en 00165) sube
--   `foodos_coupons.usage_count` al crear el pedido. No existía la operación
--   inversa, así que cancelar un pedido dejaba el contador inflado: un cupón
--   de "primeros 50 usos" se agotaba con pedidos que nunca se sirvieron.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UN UPDATE EN LA RUTA
--   Por la misma razón que el incremento: la ruta de cancelación corre con
--   `service_role` (el comensal no tiene sesión), y `foodos_coupons` está
--   protegida por RLS "Owner manages coupons". Un UPDATE desde el cliente de
--   servicio funcionaría, pero dejaría la regla del contador escrita en dos
--   sitios con dos criterios de permiso. Aquí vive junto a su gemela, con el
--   mismo guardián de permisos que `00165` le puso al incremento.
--
-- POR QUÉ NO BAJA DE CERO
--   `GREATEST(usage_count - 1, 0)`: si dos pedidos del mismo cupón se cancelan
--   y uno de ellos se creó antes de que existiera el incremento (o si alguien
--   editó el contador a mano), restar a ciegas dejaría un negativo que
--   `validateCoupon` leería como "usos ilimitados". Un contador en 0 significa
--   "sin usos", que es el peor caso honesto.
--
-- LO QUE NO HACE
--   No toca el pedido. La ruta decide si el pedido se puede cancelar; esta
--   función solo mueve el contador. Separadas, cada una se puede probar sola.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_foodos_coupon_usage(
  p_restaurant_id UUID,
  p_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  -- Mismo guardián que `increment_foodos_coupon_usage` en 00165: un usuario
  -- autenticado solo puede tocar cupones de SU restaurante (o ser admin). El
  -- `service_role` (sin `auth.uid()`) pasa, que es como lo llama la ruta de
  -- cancelación del comensal.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.foodos_restaurants r
        WHERE r.id = p_restaurant_id AND r.user_id = auth.uid()
     )
     AND NOT public.is_admin()
  THEN
    RAISE EXCEPTION 'Sin permiso sobre el restaurante %', p_restaurant_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.foodos_coupons
     SET usage_count = GREATEST(usage_count - 1, 0)
   WHERE restaurant_id = p_restaurant_id AND upper(code) = upper(p_code);
END;
$fn$;

COMMENT ON FUNCTION public.decrement_foodos_coupon_usage(UUID, TEXT) IS
  'Libera un uso de cupón FoodOS al cancelar un pedido. Inversa de increment_foodos_coupon_usage. No baja de 0.';

REVOKE ALL ON FUNCTION public.decrement_foodos_coupon_usage(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_foodos_coupon_usage(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Autocomprobación. Cada punto INVOCA lo que afirma: una guardia que solo
-- pregunta "¿existe?" no distingue "existe" de "funciona" (el fallo que dejó
-- `foodos_restaurant_review()` muerta desde 00168 hasta 00181).
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_restaurante UUID;
  v_codigo      TEXT := 'ZZTEST-00186';
  v_antes       INTEGER;
  v_despues     INTEGER;
  v_ajeno       INTEGER;
  v_ok          BOOLEAN;
BEGIN
  -- G1 · la función existe, es SECURITY DEFINER y fija search_path.
  SELECT p.prosecdef AND (p.proconfig @> ARRAY['search_path=""'])
    INTO v_ok
    FROM pg_proc p
   WHERE p.oid = 'public.decrement_foodos_coupon_usage(uuid,text)'::regprocedure;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION '00186 G1: la función no es SECURITY DEFINER con search_path fijo';
  END IF;

  -- G2 · anon y PUBLIC no pueden ejecutarla.
  IF has_function_privilege('anon', 'public.decrement_foodos_coupon_usage(uuid,text)', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p
        WHERE p.oid = 'public.decrement_foodos_coupon_usage(uuid,text)'::regprocedure
          AND p.proacl IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%')
     )
  THEN
    RAISE EXCEPTION '00186 G2: anon o PUBLIC conservan EXECUTE';
  END IF;

  -- G3 · prueba funcional: el contador baja exactamente 1 y no baja de 0.
  SELECT id INTO v_restaurante FROM public.foodos_restaurants LIMIT 1;
  IF v_restaurante IS NULL THEN
    RAISE NOTICE '00186 G3 OMITIDA: no hay restaurantes sobre los que probar';
    RETURN;
  END IF;

  INSERT INTO public.foodos_coupons (restaurant_id, code, type, value, usage_count)
  VALUES (v_restaurante, v_codigo, 'percent', 10, 3)
  ON CONFLICT (restaurant_id, code) DO UPDATE SET usage_count = 3;

  SELECT usage_count INTO v_antes FROM public.foodos_coupons
   WHERE restaurant_id = v_restaurante AND upper(code) = upper(v_codigo);

  PERFORM public.decrement_foodos_coupon_usage(v_restaurante, v_codigo);

  SELECT usage_count INTO v_despues FROM public.foodos_coupons
   WHERE restaurant_id = v_restaurante AND upper(code) = upper(v_codigo);

  IF v_antes <> 3 OR v_despues <> 2 THEN
    RAISE EXCEPTION '00186 G3: esperaba 3 -> 2, obtuve % -> %', v_antes, v_despues;
  END IF;

  -- G3b · un código que no existe no revienta y no toca nada.
  PERFORM public.decrement_foodos_coupon_usage(v_restaurante, 'ZZTEST-NO-EXISTE');
  SELECT usage_count INTO v_ajeno FROM public.foodos_coupons
   WHERE restaurant_id = v_restaurante AND upper(code) = upper(v_codigo);
  IF v_ajeno <> 2 THEN
    RAISE EXCEPTION '00186 G3b: un código inexistente movió el contador a %', v_ajeno;
  END IF;

  -- G3c · el suelo: dos llamadas más dejan el contador en 0, nunca en negativo.
  PERFORM public.decrement_foodos_coupon_usage(v_restaurante, v_codigo);
  PERFORM public.decrement_foodos_coupon_usage(v_restaurante, v_codigo);
  PERFORM public.decrement_foodos_coupon_usage(v_restaurante, v_codigo);
  SELECT usage_count INTO v_despues FROM public.foodos_coupons
   WHERE restaurant_id = v_restaurante AND upper(code) = upper(v_codigo);
  IF v_despues <> 0 THEN
    RAISE EXCEPTION '00186 G3c: el contador bajó de 0 (quedó en %)', v_despues;
  END IF;

  DELETE FROM public.foodos_coupons
   WHERE restaurant_id = v_restaurante AND upper(code) = upper(v_codigo);

  -- G4 · la gemela sigue existiendo y con la misma firma: si alguien renombra
  -- el incremento, la cancelación liberaría un cupón que nunca se consumió.
  IF to_regprocedure('public.increment_foodos_coupon_usage(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '00186 G4: desapareció increment_foodos_coupon_usage';
  END IF;

  RAISE NOTICE '00186 OK: cupón liberado (3 -> 2 -> 0, suelo respetado), guardián de permisos intacto';
END
$guard$;
