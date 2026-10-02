-- ============================================================
-- 00212 — Corrección: las papas Weber tenían el costo por kilo guardado
-- como si fuera el costo por caja.
--
-- EL ERROR
-- --------
-- En 00209 los renglones "para freír" de Carnes Weber se transcribieron
-- con `cost` = precio POR KILO de la lista (p. ej. papa lisa $35.90/kg)
-- pero `kg` = contenido de la caja (15 kg). El cálculo heredado de 00202
-- hace costo_kg = cost/kg ($2.39) y el precio de venta salió CEIL(2.39 ×
-- 15 × 1.20) = $44 la caja de 15 kg: por debajo del costo real ($538.50).
--
-- Lo correcto: costo_caja = costo_kg × kg_caja.
--   papa-lisa-caja        15 kg × $35.90 = $538.50 → venta CEIL(538.50×1.20) = $647
--   deditos-papa-caja-10kg 10 kg × $61.90 = $619.00 → venta CEIL(619×1.20)   = $743
--   papa-gajo-10-cut (traslape, Weber primario) 13.61 kg × $48.90 = $665.53
--     → venta CEIL(665.53×1.20) = $799
--
-- Sin tope Alsuper en los tres (los falsos positivos se descartaron en la
-- curación de 00209), así que solo aplica la regla A.
--
-- Idempotente: fija los costos a su valor correcto; re-ejecutar no cambia
-- nada.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_costos int;
  v_precios int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'carnes-weber';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00212: falta el proveedor carnes-weber; corre 00209 primero';
  END IF;

  CREATE TEMP TABLE _fix (
    slug      text PRIMARY KEY,
    cost_caja numeric(12,2) NOT NULL,
    kg        numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _fix (slug, cost_caja, kg) VALUES
    ('papa-lisa-caja',                   538.50, 15.0000),
    ('deditos-papa-caja-10kg',           619.00, 10.0000),
    ('papa-gajo-10-cut-65-caja-1361kg',  665.53, 13.6100);

  UPDATE public.product_suppliers ps
  SET cost = f.cost_caja,
      notes = 'Lista Carnes Weber 01-oct-2026. Costo POR CAJA corregido en 00212 (era costo/kg guardado como costo/caja). La marca no se muestra en tienda.',
      updated_at = now()
  FROM _fix f
  JOIN public.products p ON p.slug = f.slug
  WHERE ps.product_id = p.id
    AND ps.supplier_id = v_supplier
    AND ps.cost <> f.cost_caja;

  GET DIAGNOSTICS v_costos = ROW_COUNT;

  -- Precio de venta = CEIL(costo_caja × 1.20); solo donde Weber es
  -- primario en ese producto y el precio actual quedó por debajo del
  -- costo corregido.
  UPDATE public.products p
  SET price = CEIL(f.cost_caja * 1.20),
      updated_at = now()
  FROM _fix f
  WHERE p.slug = f.slug
    AND p.price < f.cost_caja
    AND EXISTS (
      SELECT 1 FROM public.product_suppliers ps
      WHERE ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
    );

  GET DIAGNOSTICS v_precios = ROW_COUNT;

  RAISE NOTICE '00212: % costos corregidos, % precios recalculados.', v_costos, v_precios;
END $$;

COMMIT;
