-- ============================================================
-- 00225 — AB Foods: la lista del 13-oct-2026 reemplaza la del 10-sep.
--
-- DE DONDE SALE
-- -------------
-- Lista de precios mayoreo de AB Foods (abpollo.com) con vigencia
-- "del 13 de Octubre del 2026 al 13 de Octubre del 2026". Llego como PDF
-- escaneado (sin capa de texto: cada celda es una imagen), asi que los 54
-- renglones se leyeron con OCR y cada una de las 43 celdas de precio
-- distintas se verifico a 12 escalas/niveles de reconocimiento antes de
-- escribir un solo numero aqui.
--
-- QUE HACE
-- --------
--  1. Refresca el costo de lista de los 50 articulos que la lista trae y ya
--     existian en el catalogo (`product_suppliers.cost`, `list_date` ->
--     2026-10-13). Son los mismos SKU: la lista nueva no renombra ninguno.
--  2. Da de alta los 4 articulos que la lista trae y el catalogo no tenia
--     (ver "ALTAS" abajo).
--  3. Recalcula el precio de venta de los articulos de AB Foods que son
--     PRIMARIO en `product_suppliers`, con la regla vigente de `00202`:
--
--         precio = LEAST( CEIL(costo * 1.18), cap_kg * kg )
--
--     donde `kg` es el peso de una unidad de venta y `cap_kg` el menor
--     `unit_price` de `competitor_prices` (la tabla privada que mantiene
--     `scripts/alsuper-prices-sync.mjs`). Si el rival lo vende mas barato
--     de lo que nos cuesta, el articulo se OCULTA (regla A vs B).
--
-- QUE **NO** HACE, Y POR QUE
-- --------------------------
--  · No toca el precio de los articulos donde AB Foods NO es el primario
--    (21 de los 51). Ahi la tienda compra a Weber/Distmar y el precio se
--    rige por el costo de ese proveedor; lo unico que cambia es el costo
--    de referencia de AB Foods, que sirve para comparar proveedores.
--  · No re-normaliza el margen de un articulo cuyo costo NO cambio. El
--    unico caso donde eso importa es `papa-select-516-sc-caja-1361kg`:
--    es el unico articulo de AB Foods que quedo en el regimen de `00214`
--    (1.20, sin tope, $696) y su costo sigue en $579.90. Esta migracion
--    no lo mueve a $685: no es un cambio de lista. Queda anotado como
--    deuda, no como efecto colateral silencioso.
--  · No borra ni oculta `boneless-natural-freskecito` (SKU 8567). La
--    lista nueva ya no lo trae, pero el producto se vende con el costo de
--    **Weber** ($118.90), no con el de AB Foods: dejar de aparecer en esta
--    lista no lo deja sin costo. Se le cambia solo la nota para que el
--    siguiente que lea `product_suppliers` sepa por que su `list_date`
--    sigue siendo 10-sep-2026.
--
-- ALTAS: LOS 4 ARTICULOS NUEVOS ENTRAN OCULTOS
-- --------------------------------------------
-- La lista trae 4 articulos que el catalogo no tenia: papa francesa 1/4
-- McCain (12.24 kg), papa ondulada McCain (16.33 kg), papa gajo McCain
-- (13.61 kg) y papa Conquest Delivery 3/8 **con** cascara (13.61 kg).
--
-- Entran con `is_visible = false` a proposito. Tres de ellos son el mismo
-- corte y la misma presentacion que un articulo que la tienda YA vende, a
-- **costo por kilo identico** (McCain 1/4 = Payette 1/4 a $40.84/kg, gajo
-- McCain = gajo 10 cut a $55.10/kg, ondulada McCain = ondulada Payette a
-- $40.4x/kg): publicarlos dejaria dos fichas indistinguibles al mismo
-- precio. El cuarto (Conquest Delivery 3/8 con cascara) si es una
-- especificacion nueva, y la tienda ya vende el par S/C-C/C de Select 3/8,
-- asi que es el candidato natural a publicar primero.
--
-- Es el mismo camino que recorrieron los 51 originales: `seed_ab_foods.sql`
-- los dio de alta OCULTOS con su costo y su vinculo a proveedor, y `00191`
-- los publico despues, ya con margen decidido. Ocultos no se pierde nada
-- —el SKU y su costo entran al ledger y la siguiente lista los sigue
-- actualizando— y publicarlos es un toggle en `/admin/productos`. La razon
-- de cada uno queda en `admin_note`, que es privada.
--
-- Idempotente: re-ejecutarla deja el mismo estado (los costos y los precios
-- se fijan a su valor calculado y las altas van con `WHERE NOT EXISTS`).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_nota     text := 'Lista de precios mayoreo AB Foods, vigencia 13-oct-2026.';
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
    RAISE EXCEPTION '00225: falta el proveedor ab-foods (corre el seed primero)';
  END IF;

  -- ----------------------------------------------------------
  -- 1) La lista del 13-oct-2026: articulo -> costo y peso de la
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
    ('01265',        499.90, 12.2400),
    ('00399',        659.90, 16.3300),
    ('017103',       549.90, 13.6100),
    ('017110',       499.90, 12.2400),
    ('018940',       549.90, 13.6100),
    ('038634',       569.90,  9.5200),
    ('361480',       649.90,  8.1600),
    ('023821',       579.90, 13.6100),
    ('023937',       579.90, 13.6100),
    ('027805',       769.90,  6.8000),
    ('038740',       839.90, 16.3300),
    ('043386',       839.90, 13.6100),
    ('043850',       779.90, 13.6100),
    ('048336',       749.90, 13.6100),
    ('048374',       849.90, 13.6100),
    ('027515',       749.90, 13.6100),
    ('046165',       749.90, 13.6100),
    ('470144',       899.90, 13.6100),
    ('475125',       776.90, 12.2400),
    ('479024',       769.90, 12.2400),
    ('3627',         749.90, 13.6100),
    ('15071',         64.90,  1.0000),
    ('41451',         85.90,  1.0000),
    ('8151',          61.90,  1.0000),
    ('8160',          64.90,  1.0000),
    ('00015',        126.90,  1.0000),
    ('4150',         169.90,  1.0000),
    ('9999',         117.90,  1.0000),
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

  -- Articulos de la lista que no llegaron a ninguna fila de proveedor:
  -- son las altas del paso 4 (se esperan exactamente 4).
  SELECT string_agg(l.sku, ', ' ORDER BY l.sku) INTO v_nuevos
  FROM _lista l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_suppliers ps
    WHERE ps.supplier_id = v_supplier AND ps.supplier_sku = l.sku
  );

  SELECT count(*) INTO v_cambian FROM _calc WHERE cambio;

  -- ----------------------------------------------------------
  -- 3) Costo de lista nuevo para los articulos que ya existian.
  -- ----------------------------------------------------------
  UPDATE public.product_suppliers ps
  SET cost = l.costo,
      list_date = DATE '2026-10-13',
      notes = v_nota,
      updated_at = now()
  FROM _lista l
  WHERE ps.supplier_id = v_supplier
    AND ps.supplier_sku = l.sku
    AND (ps.cost, ps.list_date, ps.notes)
        IS DISTINCT FROM (l.costo, DATE '2026-10-13', v_nota);

  -- ----------------------------------------------------------
  -- 4) Altas: los 4 articulos que la lista trae y el catalogo no.
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
    ('01265', 'papa-francesa-14-mccain-caja-1224kg',
     'Papa francesa 1/4 McCain (caja 12.24 kg)', 'McCain', 'caja', 'Caja 12.24 kg',
     'Papa a la francesa corte 1/4, congelada, para freír. Caja 12.24 kg.',
     '/images/products/ai/papa-francesa-14-payette-caja-1224kg.webp',
     'Alta 00225 (lista AB Foods 13-oct-2026). Oculto: mismo corte y misma presentación que papa-francesa-14-payette-caja-1224kg, a idéntico costo por kilo. Publicar solo si se deja de comprar el de Payette.'),
    ('00399', 'papa-ondulada-mccain-caja-1633kg',
     'Papa ondulada McCain (caja 16.33 kg)', 'McCain', 'caja', 'Caja 16.33 kg',
     'Papa ondulada corte 3/8, congelada, para freír. Caja 16.33 kg.',
     '/images/products/ai/papa-ondulada-38-payette-caja-1361kg.webp',
     'Alta 00225 (lista AB Foods 13-oct-2026). Oculto: mismo corte que papa-ondulada-38-payette-caja-1361kg y mismo costo por kilo; la caja es de 16.33 kg en vez de 13.61 kg.'),
    ('048336', 'papa-conquest-delivery-38-cc-caja-1361kg',
     'Papa Conquest Delivery 3/8 con cáscara (caja 13.61 kg)', 'Conquest', 'caja', 'Caja 13.61 kg',
     'Papa corte 3/8 con cáscara, congelada, para freír. Caja 13.61 kg.',
     NULL,
     'Alta 00225 (lista AB Foods 13-oct-2026). Oculto por defecto. Especificación nueva: la tienda vende la versión SIN cáscara (papa-conquest-delivery-38-sc-caja-1361kg) y ya vende el par S/C-C/C de Select 3/8, así que es el candidato natural a publicar primero. Sin foto propia (no se reutiliza la de la versión sin cáscara: sería engañosa).'),
    ('3627', 'papa-gajo-mccain-caja-1361kg',
     'Papa gajo McCain (caja 13.61 kg)', 'McCain', 'caja', 'Caja 13.61 kg',
     'Papa en gajo (10 cut), congelada, para freír. Caja 13.61 kg.',
     '/images/products/ai/papa-gajo-10-cut-65-caja-1361kg.webp',
     'Alta 00225 (lista AB Foods 13-oct-2026). Oculto: mismo corte y misma presentación que papa-gajo-10-cut-65-caja-1361kg, a idéntico costo por kilo.');

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
         a.unit, '["ab-foods","congelados","restaurante","taqueria"]'::jsonb,
         a.admin_note, 0
  FROM _altas a
  JOIN _lista l ON l.sku = a.sku
  JOIN public.categories c ON c.slug = 'congelados'
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_altas = ROW_COUNT;

  INSERT INTO public.product_suppliers (
    product_id, supplier_id, supplier_sku, presentation, cost,
    list_date, is_primary, notes
  )
  SELECT p.id, v_supplier, a.sku, a.presentation, l.costo,
         DATE '2026-10-13', true, v_nota
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
  -- 6) El articulo que la lista nueva ya no trae.
  -- ----------------------------------------------------------
  UPDATE public.product_suppliers ps
  SET notes = 'Lista de precios mayoreo AB Foods, vigencia 10-sep-2026. '
              'El articulo 8567 (Boneless natural Freskecito) NO aparece en la lista '
              'del 13-oct-2026: se conserva el ultimo costo conocido y el precio no '
              'se toca (la tienda lo compra a carnes-weber).',
      updated_at = now()
  WHERE ps.supplier_id = v_supplier
    AND ps.supplier_sku = '8567'
    AND ps.notes NOT LIKE '%NO aparece en la lista%';

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
    RAISE EXCEPTION '00225: % articulos VISIBLES de AB Foods quedaron por debajo del costo', v_bajo;
  END IF;
  IF v_caros > 0 THEN
    RAISE EXCEPTION '00225: % articulos VISIBLES de AB Foods quedaron mas caros que la competencia', v_caros;
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

  RAISE NOTICE '00225: % costos de lista actualizados, % precios recalculados, % altas (ocultas), % ocultos por tope.',
    v_cambian, v_precios, v_altas, v_ocultos;
  RAISE NOTICE '00225: altas de la lista que no existian en el catalogo: %', COALESCE(v_nuevos, '(ninguna)');
  RAISE NOTICE '00225: sin recalcular (costo igual en las dos listas): %', COALESCE(v_sin_rec, '(ninguno)');
END $$;

COMMIT;
