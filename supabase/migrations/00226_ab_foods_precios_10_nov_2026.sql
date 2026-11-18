-- ============================================================
-- 00226 — AB Foods: la lista del 10-nov-2026 reemplaza la del 13-oct.
--
-- DE DONDE SALE
-- -------------
-- Lista de precios mayoreo de AB Foods (abpollo.com) con vigencia
-- "del 10 de Noviembre del 2026 al 10 de Noviembre del 2026". Llego
-- como PDF escaneado (sin capa de texto: cada celda es una imagen).
-- Los 49 renglones se leyeron de la imagen y las secciones con
-- cambios (papas y pechugas) se verificaron en un render a 300 dpi;
-- los 28 articulos cuyo costo NO cambio coinciden al centavo con la
-- lista del 13-oct-2026, lo que valida la lectura de los que si
-- cambiaron.
--
-- QUE HACE
-- --------
--  1. Refresca el costo de lista de los 47 articulos que la lista
--     trae y ya existian en el catalogo (`product_suppliers.cost`,
--     `list_date` -> 2026-11-10). 19 costos se movieron (18 suben,
--     1 baja: el camaron 41/50) y 28 quedaron identicos.
--  2. Da de alta los 2 articulos que la lista trae y el catalogo no
--     tenia (ver "ALTAS" abajo).
--  3. Recalcula el precio de venta de los articulos de AB Foods que
--     son PRIMARIO en `product_suppliers`, con la regla vigente de
--     `00202`:
--
--         precio = LEAST( CEIL(costo * 1.18), cap_kg * kg )
--
--     donde `kg` es el peso de una unidad de venta y `cap_kg` el
--     menor `unit_price` de `competitor_prices` (la tabla privada
--     que mantiene `scripts/alsuper-prices-sync.mjs`). Si el rival
--     lo vende mas barato de lo que nos cuesta, el articulo se
--     OCULTA (regla A vs B).
--
-- QUE **NO** HACE, Y POR QUE
-- --------------------------
--  · No toca el precio de los articulos donde AB Foods NO es el
--    primario. Ahi la tienda compra a Weber/Distmar y el precio se
--    rige por el costo de ese proveedor; lo unico que cambia es el
--    costo de referencia de AB Foods.
--  · No re-normaliza el margen de un articulo cuyo costo NO cambio
--    (misma deuda anotada en `00225`: `papa-select-516-sc-caja-1361kg`
--    sigue en el regimen de `00214` y su costo no se movio).
--  · No borra ni oculta los 7 articulos que la lista nueva ya no
--    trae (ver paso 6): las 4 papas McCain que entraron ocultas en
--    `00225` (01265, 00399, 048336, 3627) y las pechugas 41451,
--    8151 y 8160. Solo se les cambia la nota y conservan su
--    `list_date` = 2026-10-13.
--
-- LAS PECHUGAS 10144 Y 26061 SON ARTICULOS DISTINTOS
-- --------------------------------------------------
-- La lista del 10-nov trae dos pechugas con codigos que el catalogo
-- no tenia: 10144 "PECHUGA S/H PILGRIMS NAC. C/12KG" ($99.90) y
-- 26061 "PECHUGA S/H C.H AM C/10 KG" ($69.90). La descripcion y la
-- presentacion coinciden con articulos existentes (41451 Pilgrims
-- caja 12 kg y 8151 AM Soles caja 10 kg), pero Victor confirmo que
-- son articulos DISTINTOS, no un cambio de codigo. Por eso entran
-- como altas ocultas y los articulos 41451/8151/8160 conservan su
-- costo de la lista del 13-oct-2026, sin tocar su precio.
--
-- ALTAS: LOS 2 ARTICULOS NUEVOS ENTRAN OCULTOS
-- --------------------------------------------
-- Entran con `is_visible = false`, sin foto propia (no se reutiliza
-- la foto de otra pechuga: seria enganosa) y con la razon en
-- `admin_note`. Publicarlos es un toggle en `/admin/productos`.
-- Es el mismo camino de las altas de `00225`.
--
-- Idempotente: re-ejecutarla deja el mismo estado (los costos y los
-- precios se fijan a su valor calculado y las altas van con
-- `WHERE NOT EXISTS`). Si la lista trajera un SKU desconocido que
-- no sea una de las 2 altas esperadas, la migracion ABORTA (paso 2)
-- en vez de saltarse su costo en silencio.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_nota     text := 'Lista de precios mayoreo AB Foods, vigencia 10-nov-2026.';
  v_cambian  int;
  v_precios  int;
  v_altas    int;
  v_ocultos  int;
  v_bajo     int;
  v_caros    int;
  v_nuevos   text;
  v_sin_rec  text;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'ab-foods';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00226: falta el proveedor ab-foods (corre el seed primero)';
  END IF;

  -- ----------------------------------------------------------
  -- 1) La lista del 10-nov-2026: articulo -> costo y peso de la
  --    unidad de venta (`kg` = 1 cuando la lista cotiza por kilo).
  -- ----------------------------------------------------------
  CREATE TEMP TABLE _lista (
    sku   text PRIMARY KEY,
    costo numeric(12,2) NOT NULL,
    kg    numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _lista (sku, costo, kg) VALUES
    ('32397',        979.90,  7.2640),
    ('1000009592',   369.90,  1.8100),
    ('19636',        114.90,  0.9070),
    ('40134',         79.90,  1.0000),
    ('0116',          59.90,  1.0000),
    ('8563',          69.90,  1.0000),
    ('8564',          67.90,  1.0000),
    ('46300244',     534.90,  4.5000),
    ('46300245',     574.90,  4.5000),
    ('46300246',     534.90,  4.5000),
    ('017103',       579.90, 13.6100),
    ('017110',       524.90, 12.2400),
    ('018940',       579.90, 13.6100),
    ('038634',       579.90,  9.5200),
    ('361480',       679.90,  8.1600),
    ('023821',       599.90, 13.6100),
    ('023937',       599.90, 13.6100),
    ('027805',       799.90,  6.8000),
    ('038740',       839.90, 16.3300),
    ('043386',       869.90, 13.6100),
    ('043850',       824.90, 13.6100),
    ('048374',       889.90, 13.6100),
    ('027515',       799.90, 13.6100),
    ('046165',       799.90, 13.6100),
    ('470144',       899.90, 13.6100),
    ('475125',       799.90, 12.2400),
    ('479024',       799.90, 12.2400),
    ('10144',         99.90,  1.0000),
    ('15071',         76.90,  1.0000),
    ('26061',         69.90,  1.0000),
    ('00015',        132.90,  1.0000),
    ('4150',         159.90,  1.0000),
    ('9999',         119.90,  1.0000),
    ('0201',          47.90,  1.0000),
    ('2336',         138.90,  1.0000),
    ('5904',         125.90,  1.0000),
    ('0455',          94.90,  1.0000),
    ('4011',         162.90,  1.0000),
    ('4556',          94.90,  1.0000),
    ('6673',         146.90,  1.0000),
    ('70483',        137.90,  1.0000),
    ('9943',         174.90,  1.0000),
    ('10160',         62.50,  1.0000),
    ('0318',         149.90,  1.0000),
    ('0333',          74.90,  1.0000),
    ('6093',         124.90,  1.3600),
    ('6130',        1049.90,  8.0000),
    ('7503024496123', 189.90, 1.3600),
    ('0133',         299.90,  1.0000);

  -- ----------------------------------------------------------
  -- 2) Foto del estado ANTERIOR: costo vigente, peso, tope del
  --    rival y si AB Foods manda el precio de este articulo.
  --    Se toma antes de escribir para poder decir despues que
  --    cambio y que no.
  -- ----------------------------------------------------------
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT p.id,
         p.slug,
         p.price AS precio_antes,
         ps.cost AS costo_antes,
         l.costo AS costo_nuevo,
         l.kg,
         (ps.cost IS DISTINCT FROM l.costo) AS cambio,
         ps.is_primary,
         (SELECT min(cp.unit_price)
            FROM public.competitor_prices cp
           WHERE cp.product_id = p.id AND cp.unit_price IS NOT NULL) AS cap_kg
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id AND ps.supplier_id = v_supplier
  JOIN _lista l ON l.sku = ps.supplier_sku
  WHERE p.deleted_at IS NULL;

  -- Articulos de la lista que no llegaron a ninguna fila de
  -- proveedor: deben ser exactamente las 2 altas del paso 4.
  -- Cualquier otro SKU aqui es un error de lectura o de catalogo
  -- y la migracion aborta en vez de saltarse un costo en silencio.
  SELECT string_agg(l.sku, ', ' ORDER BY l.sku) INTO v_nuevos
  FROM _lista l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_suppliers ps
    WHERE ps.supplier_id = v_supplier AND ps.supplier_sku = l.sku
  );

  IF COALESCE(v_nuevos, '') <> '10144, 26061' THEN
    RAISE EXCEPTION '00226: altas inesperadas en la lista (se esperaban 10144, 26061): %',
      COALESCE(v_nuevos, '(ninguna)');
  END IF;

  SELECT count(*) INTO v_cambian FROM _calc WHERE cambio;

  -- ----------------------------------------------------------
  -- 3) Costo de lista nuevo para los articulos que ya existian.
  -- ----------------------------------------------------------
  UPDATE public.product_suppliers ps
  SET cost = l.costo,
      list_date = DATE '2026-11-10',
      notes = v_nota,
      updated_at = now()
  FROM _lista l
  WHERE ps.supplier_id = v_supplier
    AND ps.supplier_sku = l.sku
    AND (ps.cost, ps.list_date, ps.notes)
        IS DISTINCT FROM (l.costo, DATE '2026-11-10', v_nota);

  -- ----------------------------------------------------------
  -- 4) Altas: los 2 articulos que la lista trae y el catalogo no.
  --    Nacen OCULTOS (ver la cabecera) y con la descripcion de
  --    cliente: nunca costo ni SKU del proveedor.
  -- ----------------------------------------------------------
  CREATE TEMP TABLE _altas (
    sku          text PRIMARY KEY,
    slug         text NOT NULL,
    name         text NOT NULL,
    brand        text NOT NULL,
    unit         text NOT NULL,
    presentation text NOT NULL,
    description  text NOT NULL,
    image_url    text,
    admin_note   text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _altas (sku, slug, name, brand, unit, presentation, description, image_url, admin_note) VALUES
    ('10144', 'pechuga-sh-pilgrims-nac-caja-12kg',
     'Pechuga sin hueso Pilgrims Nac. (caja 12 kg)', 'Pilgrim''s', 'kilo', 'Caja 12 kg (precio por kilo)',
     'Pechuga de pollo sin hueso Pilgrims, nacional, congelada. Precio por kilo; se surte en caja de 12 kg.',
     NULL,
     'Alta 00226 (lista AB Foods 10-nov-2026). Oculto por defecto: articulo nuevo en la lista. Victor confirmo que NO es el mismo articulo que pechuga-sh-pilgrims-caja-12kg (art. 41451), que sigue en el catalogo con su costo de la lista 13-oct-2026. Sin foto propia. Publicar desde /admin/productos si se decide venderlo.'),
    ('26061', 'pechuga-sh-ch-am-caja-10kg',
     'Pechuga sin hueso C.H AM (caja 10 kg)', 'C.H', 'kilo', 'Caja 10 kg (precio por kilo)',
     'Pechuga de pollo sin hueso C.H AM, congelada. Precio por kilo; se surte en caja de 10 kg.',
     NULL,
     'Alta 00226 (lista AB Foods 10-nov-2026). Oculto por defecto: articulo nuevo en la lista. Victor confirmo que NO es el mismo articulo que pechuga-sh-am-soles-caja-10kg (art. 8151), que sigue en el catalogo con su costo de la lista 13-oct-2026. Sin foto propia. Publicar desde /admin/productos si se decide venderlo.');

  INSERT INTO public.products (
    name, slug, description, brand, category_id, image_url, images,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags, admin_note, sort_order
  )
  SELECT a.name, a.slug, a.description, a.brand, c.id,
         a.image_url,
         CASE WHEN a.image_url IS NULL THEN '[]'::jsonb
              ELSE jsonb_build_array(a.image_url) END,
         CEIL(l.costo * 1.18),
         NULL, 'in_stock', false, false,
         a.unit, '["ab-foods","proteinas","restaurante","taqueria"]'::jsonb,
         a.admin_note, 0
  FROM _altas a
  JOIN _lista l ON l.sku = a.sku
  JOIN public.categories c ON c.slug = 'carnes-aves-pescados'
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_altas = ROW_COUNT;

  INSERT INTO public.product_suppliers (
    product_id, supplier_id, supplier_sku, presentation, cost,
    list_date, is_primary, notes
  )
  SELECT p.id, v_supplier, a.sku, a.presentation, l.costo,
         DATE '2026-11-10', true, v_nota
  FROM _altas a
  JOIN _lista l ON l.sku = a.sku
  JOIN public.products p ON p.slug = a.slug
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_suppliers ps
    WHERE ps.product_id = p.id
      AND ps.supplier_id = v_supplier
      AND ps.supplier_sku = a.sku
  );

  -- ----------------------------------------------------------
  -- 5) Precio de venta, SOLO donde AB Foods manda el precio y
  --    SOLO donde el costo de lista cambio (ver cabecera).
  --
  --    Regla A vs B: si el tope del rival queda por debajo del
  --    costo no existe precio valido y el articulo se oculta.
  --    Ocultar por SQL tiene que limpiar `publish_at` /
  --    `unpublish_at`, o el job `scheduled-publishing` lo
  --    republica solo a un precio bajo costo (`00203`).
  -- ----------------------------------------------------------
  UPDATE public.products p
  SET is_visible = false,
      publish_at = NULL,
      unpublish_at = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.is_primary
    AND c.cap_kg IS NOT NULL
    AND c.cap_kg < c.costo_nuevo / c.kg
    AND p.is_visible;
  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

  UPDATE public.products p
  SET price = LEAST(
        CEIL(c.costo_nuevo * 1.18),
        COALESCE(c.cap_kg * c.kg, CEIL(c.costo_nuevo * 1.18))
      ),
      sale_price = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.is_primary
    AND c.cambio
    AND NOT (c.cap_kg IS NOT NULL AND c.cap_kg < c.costo_nuevo / c.kg)
    AND p.price IS DISTINCT FROM LEAST(
          CEIL(c.costo_nuevo * 1.18),
          COALESCE(c.cap_kg * c.kg, CEIL(c.costo_nuevo * 1.18))
        );
  GET DIAGNOSTICS v_precios = ROW_COUNT;

  -- ----------------------------------------------------------
  -- 6) Los articulos que la lista nueva ya no trae.
  -- ----------------------------------------------------------
  UPDATE public.product_suppliers ps
  SET notes = 'Lista de precios mayoreo AB Foods, vigencia 13-oct-2026. '
              'El articulo NO aparece en la lista del 10-nov-2026: se conserva '
              'el ultimo costo conocido y el precio no se toca (el articulo '
              'sigue oculto, como entro en 00225).',
      updated_at = now()
  WHERE ps.supplier_id = v_supplier
    AND ps.supplier_sku IN ('01265', '00399', '048336', '3627')
    AND ps.notes NOT LIKE '%NO aparece en la lista del 10-nov-2026%';

  UPDATE public.product_suppliers ps
  SET notes = 'Lista de precios mayoreo AB Foods, vigencia 13-oct-2026. '
              'El articulo NO aparece en la lista del 10-nov-2026: la lista '
              'trae otras pechugas (10144 y 26061) que Victor confirmo son '
              'articulos distintos, dados de alta en 00226. Se conserva el '
              'ultimo costo conocido y el precio no se toca.',
      updated_at = now()
  WHERE ps.supplier_id = v_supplier
    AND ps.supplier_sku IN ('41451', '8151', '8160')
    AND ps.notes NOT LIKE '%NO aparece en la lista del 10-nov-2026%';

  -- ----------------------------------------------------------
  -- 7) Guardas en positivo: las dos reglas se comprueban, no se
  --    suponen. Miran lo VISIBLE, que es lo que se puede comprar.
  -- ----------------------------------------------------------
  SELECT count(*) INTO v_bajo
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND c.is_primary
    AND p.price < c.costo_nuevo;

  SELECT count(*) INTO v_caros
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND c.is_primary
    AND c.cap_kg IS NOT NULL
    AND p.price > c.cap_kg * c.kg + 0.01;

  IF v_bajo > 0 THEN
    RAISE EXCEPTION '00226: % articulos VISIBLES de AB Foods quedaron por debajo del costo', v_bajo;
  END IF;
  IF v_caros > 0 THEN
    RAISE EXCEPTION '00226: % articulos VISIBLES de AB Foods quedaron mas caros que la competencia', v_caros;
  END IF;

  SELECT string_agg(p.slug, ', ' ORDER BY p.slug) INTO v_sin_rec
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE c.is_primary AND NOT c.cambio
    AND p.is_visible
    AND p.price IS DISTINCT FROM LEAST(
          CEIL(c.costo_nuevo * 1.18),
          COALESCE(c.cap_kg * c.kg, CEIL(c.costo_nuevo * 1.18))
        );

  RAISE NOTICE '00226: % costos de lista actualizados, % precios recalculados, % altas (ocultas), % ocultos por tope.',
    v_cambian, v_precios, v_altas, v_ocultos;
  RAISE NOTICE '00226: altas de la lista que no existian en el catalogo: %', COALESCE(v_nuevos, '(ninguna)');
  RAISE NOTICE '00226: sin recalcular (costo igual en las dos listas): %', COALESCE(v_sin_rec, '(ninguno)');
END $$;

COMMIT;
