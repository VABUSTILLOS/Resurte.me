-- ============================================================
-- 00191 — AB Foods: publicar los 51 artículos de la lista mayoreo
--         vigente al 10-sep-2026, con precio de venta e imagen.
--
-- QUÉ HACE
-- --------
-- Los 51 artículos ya existían (`supabase/seed_ab_foods.sql`, commit
-- 2d8ae2d6) pero nacieron OCULTOS, con `price = 0.00` y sin imagen,
-- porque el margen estaba por definir. Esta migración los pone a la
-- venta:
--
--   · `price = CEIL(costo × 1.18)` — el costo sale de
--     `product_suppliers.cost` (fuente única, revocada para
--     anon/authenticated), NO de 51 números escritos a mano. El 18% es
--     el margen de Resurte y el `CEIL` garantiza que nunca quede por
--     debajo: $979.90 → $1,157, $61.90 → $74.
--   · `is_visible = true`, `stock_status = 'in_stock'`.
--   · `image_url` + `images = [image_url]` (contrato de 00005: la
--     primera es la primaria).
--   · `description` reescrita SIN costo ni SKU del proveedor.
--
-- POR QUÉ SE REESCRIBE LA DESCRIPCIÓN
-- -----------------------------------
-- El seed escribió en `description` el costo de lista literal
-- ("Proveedor: AB Foods · art. 32397 · costo mayoreo $979.90 MXN").
-- Mientras los productos estuvieran ocultos eso no se veía; al
-- publicarlos, la ficha de producto le mostraría a cualquier visitante
-- nuestro costo de compra. La descripción nueva es de cliente y el
-- costo/SKU se quedan donde deben: `product_suppliers`.
--
-- POR QUÉ NO SE ESCRIBE `products.cost`
-- -------------------------------------
-- `anon` puede leer `products.cost` (verificado: `GET
-- /rest/v1/products?select=cost` responde 200) porque `src/lib/data.ts`
-- hace `select("*")` y PostgREST expone toda columna con `GRANT SELECT`
-- de tabla. Escribirlo publicaría el costo de compra. Se deja NULL y el
-- costo vive solo en `product_suppliers.cost`. Consecuencia asumida: la
-- "oferta por margen objetivo" de /admin/productos no aplica a estos 51.
--
-- Idempotente: re-ejecutarla recalcula lo mismo desde el costo de lista.
-- ============================================================

DO $$
DECLARE
  v_filas int;
BEGIN
  -- 1) Lo que se publica: slug → imagen + descripción de cliente.
  CREATE TEMP TABLE _ab_pub (
    slug        text PRIMARY KEY,
    image_url   text NOT NULL,
    description text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _ab_pub (slug, image_url, description) VALUES
    ('aguacate-chunky-caja-7264kg', '/images/products/ab-foods/aguacate-chunky-caja-7264kg.webp', 'Aguacate congelado en cubos, listo para preparar guacamole y salsas sin desperdicio. Caja 7.264 kg (8 bolsas de 2 lb).'),
    ('ala-adobada-bolsa-5kg', '/images/products/108.webp', 'Alitas de pollo adobadas corte 1-2, marinadas y listas para cocinar. Bolsa 5 kg, precio por kilo.'),
    ('ala-botanera-bolsa-5kg', '/images/products/108.webp', 'Alitas de pollo corte 1-2 con sazón botanera. Bolsa 5 kg, precio por kilo.'),
    ('ala-habanero-bolsa-5kg', '/images/products/108.webp', 'Alitas de pollo corte 1-2 con sazón habanero. Bolsa 5 kg, precio por kilo.'),
    ('ala-iqf-pilgrims-caja-12kg', '/images/products/108.webp', 'Alitas de pollo corte 1-2 ultracongeladas (IQF), se separan sin pegarse. Caja 12 kg, precio por kilo.'),
    ('aros-cebolla-bolsa-907g', '/images/products/recipe/aros-de-cebolla.webp', 'Aros de cebolla empanizados, listos para freír. Bolsa 907 g.'),
    ('arrachera-premium-sukarne', '/images/products/116.webp', 'Arrachera premium de res, lista para asar. Precio por kilo.'),
    ('boneless-buffalo-freskecito', '/images/products/wiki-199.webp', 'Boneless de pechuga de pollo con sazón buffalo. Precio por kilo.'),
    ('boneless-natural-freskecito', '/images/products/wiki-199.webp', 'Boneless de pechuga de pollo natural, sin empanizar. Precio por kilo.'),
    ('boneless-pechuga-pilgrims', '/images/products/wiki-199.webp', 'Boneless de pechuga de pollo empanizado, listo para freír. Precio por kilo.'),
    ('camaron-4150', '/images/products/ab-foods/camaron-4150.webp', 'Camarón crudo talla 41/50, limpio y listo para cocinar. Precio por kilo.'),
    ('camaron-cocido-100200', '/images/products/ab-foods/camaron-cocido-100200.webp', 'Camarón cocido talla 100/200, ideal para coctel, tostadas y preparaciones. Precio por kilo.'),
    ('camaron-cocido-4150', '/images/products/ab-foods/camaron-cocido-4150.webp', 'Camarón cocido talla 41/50, listo para servir en frío. Precio por kilo.'),
    ('carne-al-pastor-100', '/images/products/wiki-214.webp', 'Carne de cerdo al pastor 100% carne, marinada. Precio por kilo.'),
    ('cordon-bleu-mini', '/images/products/ab-foods/cordon-bleu-mini.webp', 'Cordon bleu mini relleno de jamón y queso. Precio por kilo.'),
    ('costilla-back-rib', '/images/products/121.webp', 'Costilla back rib de cerdo. Precio por kilo.'),
    ('dedos-queso-bolsa-181kg', '/images/products/ab-foods/dedos-queso-bolsa-181kg.webp', 'Dedos de queso empanizados, listos para freír o freidora de aire. Bolsa 1.81 kg.'),
    ('filete-tilapia-35', '/images/products/126.webp', 'Filete de tilapia talla 3-5. Precio por kilo.'),
    ('hamburguesa-bm-arrachera-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-arrachera-caja-30pzs.webp', 'Hamburguesa de arrachera de 150 g, lista para asar a la parrilla o plancha. Caja 30 piezas.'),
    ('hamburguesa-bm-mezquite-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-mezquite-caja-30pzs.webp', 'Hamburguesa de 150 g con sazón mezquite. Caja 30 piezas.'),
    ('hamburguesa-bm-sirloin-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-sirloin-caja-30pzs.webp', 'Hamburguesa de sirloin de 150 g, lista para asar. Caja 30 piezas.'),
    ('hamburguesa-empanizada-pilgrims', '/images/products/ab-foods/hamburguesa-empanizada-pilgrims.webp', 'Hamburguesa de pollo empanizada. Precio por kilo.'),
    ('nugget-pechuga-pilgrims', '/images/products/186.webp', 'Nugget de pechuga de pollo empanizado. Precio por kilo.'),
    ('papa-conquest-14-caja-1633kg', '/images/products/papas-fritas-congeladas.webp', 'Papa a la francesa Conquest corte 1/4, de alto rendimiento y baja absorción de aceite. Caja 16.33 kg.'),
    ('papa-conquest-delivery-38-sc-caja-1361kg', '/images/products/papas-fritas-congeladas.webp', 'Papa Conquest para reparto, corte 3/8 sin cáscara: se mantiene crujiente más tiempo. Caja 13.61 kg.'),
    ('papa-conquest-delivery-teja-65-caja-1361kg', '/images/products/ab-foods/papa-conquest-delivery-teja-65-caja-1361kg.webp', 'Papa Conquest corte teja 6/5 para reparto, congelada. Caja 13.61 kg.'),
    ('papa-curly-savory-caja-1361kg', '/images/products/ab-foods/papa-curly-savory-caja-1361kg.webp', 'Papa curly en espiral, congelada, para freír. Caja 13.61 kg.'),
    ('papa-dulce-recta-38-caja-680kg', '/images/products/ab-foods/papa-dulce-recta-38-caja-680kg.webp', 'Papa dulce (camote) en tiras rectas corte 3/8, congelada. Caja 6.80 kg.'),
    ('papa-francesa-14-payette-caja-1224kg', '/images/products/generic/papas-a-la-francesa-1kg.webp', 'Papa a la francesa corte 1/4, congelada, para freír. Caja 12.24 kg.'),
    ('papa-francesa-38-payette-caja-1361kg', '/images/products/generic/papas-a-la-francesa-1kg.webp', 'Papa a la francesa corte 3/8, congelada, para freír. Caja 13.61 kg.'),
    ('papa-gajo-10-cut-65-caja-1361kg', '/images/products/ab-foods/papa-gajo-10-cut-65-caja-1361kg.webp', 'Papa en gajo corte 10 cut 6/5, congelada, para freír. Caja 13.61 kg.'),
    ('papa-hash-brown-patty-caja-952kg', '/images/products/ab-foods/papa-hash-brown-patty-caja-952kg.webp', 'Hash brown en disco para desayuno, congelado. Caja 9.52 kg.'),
    ('papa-megacrunch-14-caja-1224kg', '/images/products/papas-fritas-congeladas.webp', 'Papa Megacrunch corte 1/4, extra crujiente y de larga duración en mostrador. Caja 12.24 kg.'),
    ('papa-ondulada-38-payette-caja-1361kg', '/images/products/ab-foods/papa-ondulada-38-payette-caja-1361kg.webp', 'Papa ondulada corte 3/8, congelada, para freír. Caja 13.61 kg.'),
    ('papa-rallada-hash-brown-caja-816kg', '/images/products/ab-foods/papa-rallada-hash-brown-caja-816kg.webp', 'Papa rallada estilo hash brown, congelada. Caja 8.16 kg.'),
    ('papa-rejilla-savory-caja-1224kg', '/images/products/ab-foods/papa-rejilla-savory-caja-1224kg.webp', 'Papa rejilla (waffle), congelada, para freír. Caja 12.24 kg.'),
    ('papa-select-38-cascara-caja-1361kg', '/images/products/papas-fritas-congeladas.webp', 'Papa a la francesa Select corte 3/8 con cáscara, congelada. Caja 13.61 kg.'),
    ('papa-select-38-sc-caja-1361kg', '/images/products/papas-fritas-congeladas.webp', 'Papa a la francesa Select corte 3/8 sin cáscara, congelada. Caja 13.61 kg.'),
    ('papa-select-516-sc-caja-1361kg', '/images/products/papas-fritas-congeladas.webp', 'Papa a la francesa Select corte 5/16 sin cáscara, congelada. Caja 13.61 kg.'),
    ('papa-thunder-38-sc-caja-1361kg', '/images/products/papas-fritas-congeladas.webp', 'Papa a la francesa Thunder corte 3/8 con cáscara, congelada. Caja 13.61 kg.'),
    ('pechuga-grill-fc-pilgrims', '/images/products/105.webp', 'Pechuga de pollo a la parrilla, fileteada y lista para servir. Precio por kilo.'),
    ('pechuga-picante-emp-pilgrims', '/images/products/106.webp', 'Pechuga de pollo picante empanizada. Precio por kilo.'),
    ('pechuga-sh-am-soles-caja-10kg', '/images/products/105.webp', 'Pechuga de pollo sin hueso de libre pastoreo. Caja 10 kg, precio por kilo.'),
    ('pechuga-sh-br-soles-caja-10kg', '/images/products/105.webp', 'Pechuga de pollo sin hueso. Caja 10 kg, precio por kilo.'),
    ('pechuga-sh-pilgrims-caja-12kg', '/images/products/105.webp', 'Pechuga de pollo sin hueso congelada. Caja 12 kg, precio por kilo.'),
    ('pechuga-sin-hueso-br', '/images/products/105.webp', 'Pechuga de pollo sin hueso. Precio por kilo.'),
    ('pollo-entero-congelado-pilgrims-caja-145kg', '/images/products/generic/pollo-entero.webp', 'Pollo entero congelado. Caja 14.5 kg, precio por kilo.'),
    ('queso-crema-krol-barra-136kg', '/images/products/ab-foods/queso-crema-krol-barra-136kg.webp', 'Queso crema para untar. Barra 1.36 kg.'),
    ('queso-crema-reny-picot-136kg', '/images/products/ab-foods/queso-crema-reny-picot-136kg.webp', 'Queso crema tipo americano. Pieza 1.36 kg.'),
    ('queso-crema-reny-picot-caja-8kg', '/images/products/ab-foods/queso-crema-reny-picot-caja-8kg.webp', 'Queso crema tipo americano. Caja 8 kg.'),
    ('tender-empanizado-pilgrims', '/images/products/ab-foods/tender-empanizado-pilgrims.webp', 'Tender de pechuga empanizado, listo para freír. Precio por kilo.')
  ;

  -- 2) El costo de lista de AB Foods, uno por producto.
  --    `DISTINCT ON` para que un producto con varias listas del mismo
  --    proveedor resuelva a una sola fila (la primaria más reciente).
  CREATE TEMP TABLE _ab_costo ON COMMIT DROP AS
  SELECT DISTINCT ON (p.slug)
         p.slug,
         ps.cost
  FROM products p
  JOIN product_suppliers ps ON ps.product_id = p.id
  JOIN suppliers s          ON s.id = ps.supplier_id
  WHERE s.slug = 'ab-foods'
    AND ps.cost IS NOT NULL
  ORDER BY p.slug, ps.is_primary DESC, ps.list_date DESC NULLS LAST, ps.id;

  -- 3) Publicar. El JOIN con _ab_costo es la guarda: un slug sin costo
  --    de AB Foods no se toca, así que la migración no puede pisar por
  --    accidente un producto homónimo de otro proveedor.
  UPDATE products p
  SET price        = CEIL(c.cost * 1.18),
      sale_price   = NULL,
      is_visible   = true,
      stock_status = 'in_stock',
      image_url    = x.image_url,
      images       = jsonb_build_array(x.image_url),
      description  = x.description,
      updated_at   = now()
  FROM _ab_pub x
  JOIN _ab_costo c ON c.slug = x.slug
  WHERE p.slug = x.slug;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 51 THEN
    RAISE WARNING
      '00191: se esperaban 51 artículos de AB Foods y se publicaron %. Revisa que el seed 2d8ae2d6 y el proveedor ab-foods sigan ahí.',
      v_filas;
  ELSE
    RAISE NOTICE '00191: 51 artículos de AB Foods publicados con precio = CEIL(costo * 1.18).';
  END IF;
END $$;
