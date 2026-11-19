-- ============================================================
-- 00227 — FRUGASA: refresco de costos con la lista "Precios 1897"
--         (vigencia 13-nov-2026) y recálculo de precios
--
-- QUE HACE
-- --------
-- Sustituye los costos de la lista "Precios 1853" (18-sep-2026, la que
-- cargaron `00196` y `00200`) por los de la lista "Precios 1897"
-- (13-nov-2026, perfil "RESTAURANT 2") en los 135 productos vinculados
-- a FRUGASA, y recalcula el precio de venta con la regla vigente
-- (`00202`, margen 1.20 de `00198`):
--
--     precio = LEAST( CEIL(costo_kg * kg * 1.20), cap_kg * kg )
--     si cap_kg < costo_kg  ->  OCULTAR (borrando publish_at /
--     unpublish_at, como manda `00203`)
--
-- El costo de FRUGASA es POR KILO; el factor de conversión a la unidad
-- de venta de cada producto es el de `00198` (tabla `_factor`, idéntica).
-- El tope sale de `public.competitor_prices` (MIN por producto), leído
-- en vivo al correr la migración.
--
-- ALCANCE (igual que `00226` con AB Foods)
-- ----------------------------------------
-- * Se actualiza el costo de TODOS los artículos de la lista que están
--   vinculados (129), cambie o no el número: también se refrescan
--   `presentation`, `list_date` y `notes`.
-- * El precio SOLO se recalcula donde FRUGASA es `is_primary` Y el
--   costo cambió. Si otro proveedor es el primario, su costo manda y
--   el de FRUGASA queda como referencia.
-- * Un artículo oculto cuyo costo nuevo SÍ admite precio válido
--   (cap >= costo) también se re-precía, pero NO se reactiva solo:
--   queda en el NOTICE final para reactivarlo desde /admin/productos.
-- * Al recalcular se limpia `sale_price` (decisión de `00198`: una
--   oferta vieja puede quedar por debajo del costo nuevo).
--
-- SIN ALTAS, A PROPÓSITO
-- ----------------------
-- La lista trae ~49 renglones sin producto vinculado: son variantes de
-- artículos ya vinculados (ajo morado, morrón amarillo/rojo, limón
-- persa/lima, champiñón T4/cremini...) o artículos que `00200` dejó
-- fuera a propósito (HUEVO R0097 por kilo vs pieza, VARIOS R0124,
-- CARBONATO R0241 y los chiles secos que la tienda ya vende: guajillo,
-- pasilla, chipotle y de árbol). El vínculo artículo-producto de
-- FRUGASA se cura a mano (`00196`/`00200`); esta migración no crea
-- productos.
--
-- SANEAMIENTO DE PRECIOS QUE YA ROMPÍAN LAS REGLAS (paso 5c)
-- -----------------------------------------------------------
-- Al primer intento de correrla, la guarda final (paso 7) detuvo la
-- migración por `achiote`: su costo NO cambió ($114.75 en las dos
-- listas), pero su precio visible era $6.32 contra un tope de $6.318
-- por unidad de 50 g — dos décimas de centavo por encima, un redondeo
-- viejo. Como el paso 5 solo recalcula donde el costo cambió, ese
-- precio quedaba fuera del alcance del refresco y la guarda no podía
-- pasar. Verificado con information_schema: la columna
-- `products.price` es numérica de 2 decimales, así que $6.318 se
-- guarda redondeado a $6.32 y vuelve a romper el tope. Por eso la
-- fórmula de esta migración redondea el tope HACIA ABAJO al centavo
-- (FLOOR(tope * 100) / 100) en los pasos 5b y 5c, y oculta cuando ni
-- al centavo existe precio válido (tope al centavo < costo). El paso
-- 5c aplica la fórmula a TODO primario visible de FRUGASA cuyo
-- precio rompa las reglas aunque su costo no haya cambiado. En este
-- refresco el saneamiento solo alcanza a achiote: $6.32 -> $6.31.
--
-- LOS 6 QUE LA LISTA YA NO TRAE
-- -----------------------------
-- mango-ataulfo (R0035), germinado-de-soya (R0089), tuna-fruta (R0057),
-- uva-negra (R0161), te-de-limon (R0212) y chile-cascabel (R0108
-- "T Cascabel."). No se borran ni se ocultan: conservan su costo del
-- 18-sep-2026 y solo cambia su nota.
--
-- CÓMO SE LEYÓ LA LISTA
-- ----------------------
-- El PDF es digital (trae capa de texto): los 178 renglones se
-- extrajeron tal cual. Cada producto vinculado se emparejó por SKU +
-- columna "Opción" contra lo cargado en `00196`/`00200`. Dos
-- presentaciones cambiaron de texto en el sistema de FRUGASA:
-- cebolla-amarilla pasa de "T LG, O USA." a "T Jumbo, O USA." (es el
-- único renglón R0014 de la lista) y ciruelo-rojo conserva su costo
-- porque el SKU R0066 sigue en $115.00. La columna "Original" de la
-- propia lista confirma la lectura en los artículos que no se movían
-- desde septiembre.
--
-- Idempotente: re-ejecutarla no cambia ninguna fila (las guardas de
-- conteo son sobre el vínculo, no sobre el cambio).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_en_lista int;
  v_costos int;
  v_precios int;
  v_ocultos int;
  v_saneo int;
  v_saneo_slugs text;
  v_sin_cambio int;
  v_reactivables text;
  v_malos text;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'frugasa';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00227: falta el proveedor frugasa; corre 00196 primero';
  END IF;

  -- 1) La lista nueva: costo POR KILO por producto vinculado.
  CREATE TEMP TABLE _lista (
    slug         text PRIMARY KEY,
    sku          text NOT NULL,
    presentation text,
    costo        numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _lista (slug, sku, presentation, costo) VALUES
    ('acelga', 'R0001', 'T 24, P Generica.', 8.90),
    ('achiote', 'R0069', NULL, 114.75),
    ('aguacate-hass', 'R0002', 'T Selecto, P E Selecto.', 66.20),
    ('ajo', 'R0003', 'C Blanco(a), P Molido(a).', 39.85),
    ('ajonjoli', 'R0070', NULL, 121.50),
    ('albahaca', 'R0071', NULL, 57.95),
    ('alfalfa-germinado', 'R0004', 'O Manojo.', 6.00),
    ('almendras-500g', 'R0072', 'P Entera(o).', 247.05),
    ('amaranto', 'R0073', NULL, 87.75),
    ('anis', 'R0246', NULL, 270.00),
    ('apio', 'R0005', 'T 24, O MEX.', 23.00),
    ('apio-palitos-aderezo-mr-lucky', 'R0230', NULL, 35.00),
    ('arandano-fresco', 'R0129', NULL, 141.75),
    ('arroz-blanco-1kg', 'R0074', NULL, 27.00),
    ('avena', 'R0164', NULL, 24.30),
    ('azucar-refinada-5kg', 'R0166', 'T Normal.', 27.30),
    ('betabel', 'R0006', 'T 25 LBS, P BTO.', 14.20),
    ('blue-berry', 'R0145', NULL, 81.00),
    ('brocoli', 'R0007', 'O MEX, P CROWN.', 30.00),
    ('cacahuate-enchilado', 'R0077-1', 'T Enchilado.', 56.70),
    ('cacahuate-japones', 'R0077-1', 'T Japones.', 91.80),
    ('cacahuate-natural-tostado', 'R0077', 'T Natural tostado.', 49.95),
    ('calabaza', 'R0009', 'C X, P E Selecto.', 24.50),
    ('camote-amarillo', 'R0008', 'C Amarillo, C Nacional.', 29.70),
    ('canela-en-polvo', 'R0076', 'P Molido(a).', 182.25),
    ('cebolla-amarilla', 'R0014', 'T Jumbo, O USA.', 23.00),
    ('cebolla-blanca', 'R0012', 'T LG, O USA.', 30.00),
    ('cebolla-cambray', 'R0015', 'T Cambray, P Generica.', 8.30),
    ('cebolla-morada', 'R0013', 'T LG, O USA.', 28.00),
    ('chacal', 'R0142', NULL, 74.25),
    ('champinon', 'R0017', 'T 12, O MEX.', 27.00),
    ('chayote', 'R0018', 'C Verde.', 16.75),
    ('chicharo', 'R0158', 'T Vaina.', 29.70),
    ('chile-caribe', 'R0062', 'P Empaque.', 63.45),
    ('chile-chilaca', 'R0016', 'P P. Especial.', 78.50),
    ('chile-chiltepin', 'R0108', 'T Chiltepín.', 2632.50),
    ('chile-colorin', 'R0108', 'T Colorin.', 121.50),
    ('chile-de-la-tierra', 'R0108', 'T De la Tierra.', 202.50),
    ('chile-habanero', 'R0134', NULL, 176.10),
    ('chile-jalapeno', 'R0028', 'P Empaque.', 37.80),
    ('chile-mirasol', 'R0108', 'T Mirasol.', 236.25),
    ('chile-morita', 'R0108', 'T Morita.', 147.15),
    ('chile-pasado', 'R0108', 'T Pasado.', 248.40),
    ('chile-poblano', 'R0063', 'P Empaque.', 71.75),
    ('chile-serrano', 'R0064', 'P Empaque.', 54.00),
    ('cilantro', 'R0065', 'T 60, P Generica.', 5.15),
    ('ciruela-pasa', 'R0163', NULL, 141.75),
    ('ciruelo-negro', 'R0066', 'C Negro(a), O USA.', 115.00),
    ('ciruelo-rojo', 'R0066', 'C Rojo, O USA.', 115.00),
    ('clavo', 'R0079', 'P Entera(o).', 295.00),
    ('coco-rayado', 'R0080', NULL, 91.80),
    ('cocoa-polvo-1kg', 'R0249', NULL, 227.50),
    ('col-blanca', 'R0051', 'C Verde 1a Nac., P Empaque.', 10.65),
    ('coliflor', 'R0061', 'T 12, O MEX.', 37.00),
    ('comino-molido', 'R0082', 'P Molido(a).', 103.95),
    ('consome-de-pollo-1kg', 'R0109', 'T Pollo.', 54.00),
    ('curcuma', 'R0243', NULL, 168.75),
    ('durazno', 'R0020', 'O USA, P Empaque.', 166.20),
    ('ejote', 'R0083', 'P Empaque.', 54.00),
    ('elote', 'R0084', 'P Blanco.', 9.45),
    ('ensalada-cesar-mr-lucky', 'R0219', NULL, 64.00),
    ('ensalada-primavera-mr-lucky', 'R0222', NULL, 47.00),
    ('epazote', 'R0110', 'P MJO GDE.', 20.15),
    ('esparrago', 'R0023', 'P Palillo.', 175.50),
    ('espinaca', 'R0021', 'P Generica.', 9.20),
    ('frambuesa', 'R0147', NULL, 81.00),
    ('fresa', 'R0025', 'T 8 Pz Gaitan.', 92.00),
    ('frijol-negro-1kg', 'R0088', 'T Negra(o).', 39.85),
    ('gragea', 'R0091-1', NULL, 67.50),
    ('granola', 'R0092', NULL, 81.00),
    ('guayaba', 'R0027', 'P E Selecto.', 48.60),
    ('haba', 'R0093', NULL, 130.15),
    ('hierbabuena-fresca', 'R0094', NULL, 14.20),
    ('hoja-de-laurel', 'R0099', NULL, 137.70),
    ('jamaica', 'R0098', NULL, 117.45),
    ('jengibre-fresco', 'R0030', NULL, 121.50),
    ('jicama', 'R0029', 'P Empaque.', 28.30),
    ('jitomate-bola', 'R0053', 'T 5X6 3T, O Inv. nacional.', 69.15),
    ('jitomate-cherry', 'R0133', 'T 12, T Bola.', 43.90),
    ('jitomate-saladet', 'R0054', 'T LG, O Inv. nacional.', 66.90),
    ('kale-organico-1kg', 'R0211', NULL, 57.40),
    ('kiwi', 'R0031', 'O USA, P Tradicional.', 128.00),
    ('lechuga-romana', 'R0032', 'T Orejona Lisa, P Tradicional.', 21.00),
    ('lenteja-1kg', 'R0101', NULL, 20.95),
    ('limon-agrio', 'R0033', 'T Agrio.', 27.70),
    ('linaza', 'R0244', NULL, 39.15),
    ('maiz-rosero', 'R0132', NULL, 40.50),
    ('mandarina', 'R0034', 'P Empaque.', 54.00),
    ('manzana-golden', 'R0037', 'T 100, P Empaque.', 49.00),
    ('manzana-roja', 'R0036', 'T 100, P Empaque.', 57.20),
    ('mejorana-fresca', 'R0153', NULL, 205.20),
    ('melon-chino', 'R0038', 'T 12, O MEX.', 25.50),
    ('melon-honeydew', 'R0039', 'T Mixto, O MEX.', 28.25),
    ('menta-fresca', 'R0102', NULL, 15.20),
    ('naranja-valencia', 'R0041', 'P Empaque.', 41.10),
    ('nopal', 'R0042', 'P Penca.', 47.25),
    ('nuez-de-castilla', 'R0067', 'P Mitad.', 486.00),
    ('oregano-molido-100g', 'R0106', 'P Molido(a).', 87.75),
    ('papa-blanca', 'R0043', 'C Papa Gallo, P Empaque.', 40.20),
    ('papaya-maradol', 'R0044', 'P Kilo.', 42.20),
    ('pasas', 'R0107', NULL, 88.45),
    ('pepino', 'R0045', 'T Selecto, C Nacional.', 22.50),
    ('pepita-de-calabaza', 'R0115', 'T Calabaza.', 148.50),
    ('pepita-de-girasol', 'R0115', 'T Girasol.', 56.70),
    ('pera', 'R0047', 'T 100, T Anjou.', 56.75),
    ('perejil', 'R0046', 'T Liso, P Generica.', 7.00),
    ('piloncillo', 'R0117', NULL, 44.55),
    ('pimenton', 'R0113', NULL, 170.10),
    ('pimienta-negra-molida', 'R0116', 'C Negro(a), P Molido(a).', 236.25),
    ('pimiento-morron', 'R0040', 'T XL, C Verde Exp..', 67.50),
    ('pina-miel', 'R0048', 'T Miel.', 33.60),
    ('platano-macho', 'R0049', 'T Comercial.', 26.20),
    ('poro', 'R0143', NULL, 26.55),
    ('quinoa-1kg', 'R0250', NULL, 116.10),
    ('rabano', 'R0050', 'T 1 LBS, P 30 Pzas..', 14.35),
    ('romero-fresco', 'R0140', 'P MJO.', 40.40),
    ('sal-de-mar-fina-1kg', 'R0120', 'T De Mesa.', 13.50),
    ('sandia', 'R0052', 'T Rayada.', 21.60),
    ('semilla-chia-1kg', 'R0248', NULL, 141.75),
    ('tamarindo', 'R0121', NULL, 94.50),
    ('tapioca', 'R0245', NULL, 83.70),
    ('tomate-verde', 'R0055', 'C Nacional, T S/Hoja.', 45.70),
    ('tomillo-fresco', 'R0123', NULL, 162.00),
    ('toronja', 'R0056', 'P Empaque.', 36.45),
    ('trigo-entero', 'R0174', NULL, 17.55),
    ('uvas-rojas', 'R0059', 'T Globo, O USA.', 96.50),
    ('uvas-verdes', 'R0058', 'T Sin semilla, O USA.', 105.00),
    ('zanahoria', 'R0060', 'T 50 LBS, T Leña.', 12.00),
    ('zarzamora', 'R0146', NULL, 81.00);

  -- Los que la lista ya no trae (conservan costo y fecha; solo nota).
  CREATE TEMP TABLE _bajas (slug text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _bajas (slug) VALUES
    ('chile-cascabel'),
    ('germinado-de-soya'),
    ('mango-ataulfo'),
    ('te-de-limon'),
    ('tuna-fruta'),
    ('uva-negra');

  -- Factor de 00198: peso de UNA unidad de venta de la tienda.
  CREATE TEMP TABLE _factor (
    slug   text PRIMARY KEY,
    factor numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _factor (slug, factor) VALUES
    ('aguacate-hass', 1.0000),
    ('betabel', 1.0000),
    ('cebolla-blanca', 1.0000),
    ('cebolla-morada', 1.0000),
    ('champinon', 1.0000),
    ('guayaba', 1.0000),
    ('chile-jalapeno', 1.0000),
    ('mandarina', 1.0000),
    ('manzana-roja', 1.0000),
    ('pimiento-morron', 1.0000),
    ('naranja-valencia', 1.0000),
    ('nopal', 1.0000),
    ('papa-blanca', 1.0000),
    ('pepino', 1.0000),
    ('pera', 1.0000),
    ('platano-macho', 1.0000),
    ('sandia', 1.0000),
    ('jitomate-bola', 1.0000),
    ('jitomate-saladet', 1.0000),
    ('tomate-verde', 1.0000),
    ('toronja', 1.0000),
    ('uvas-rojas', 1.0000),
    ('uvas-verdes', 1.0000),
    ('zanahoria', 1.0000),
    ('chile-poblano', 1.0000),
    ('chile-serrano', 1.0000),
    ('chile-habanero', 0.1000),
    ('jengibre-fresco', 0.1000),
    ('limon-agrio', 1.0000),
    ('kale-organico-1kg', 1.0000),
    ('frijol-negro-1kg', 1.0000),
    ('arroz-blanco-1kg', 1.0000),
    ('lenteja-1kg', 1.0000),
    ('quinoa-1kg', 1.0000),
    ('semilla-chia-1kg', 1.0000),
    ('consome-de-pollo-1kg', 1.0000),
    ('sal-de-mar-fina-1kg', 1.0000),
    ('azucar-refinada-5kg', 5.0000),
    ('cocoa-polvo-1kg', 1.0000),
    ('pimenton', 0.1000),
    ('hoja-de-laurel', 0.0200),
    ('comino-molido', 0.5000),
    ('oregano-molido-100g', 0.1000),
    ('canela-en-polvo', 0.1000),
    ('pimienta-negra-molida', 0.5000),
    ('pasas', 0.2000),
    ('almendras-500g', 0.5000),
    ('nuez-de-castilla', 0.2000),
    ('achiote', 0.0500),
    ('ajo', 1.0000),
    ('apio', 1.0000),
    ('brocoli', 1.0000),
    ('chayote', 1.0000),
    ('cilantro', 1.0000),
    ('col-blanca', 1.0000),
    ('coliflor', 1.0000),
    ('elote', 1.0000),
    ('epazote', 1.0000),
    ('espinaca', 1.0000),
    ('fresa', 1.0000),
    ('hierbabuena-fresca', 1.0000),
    ('lechuga-romana', 1.0000),
    ('mango-ataulfo', 1.0000),
    ('melon-chino', 1.0000),
    ('papaya-maradol', 1.0000),
    ('perejil', 1.0000),
    ('pina-miel', 1.0000),
    ('rabano', 1.0000),
    ('romero-fresco', 1.0000),
    ('tomillo-fresco', 1.0000),
    ('zarzamora', 1.0000),
    ('germinado-de-soya', 1.0000),
    ('cebolla-cambray', 1.0000),
    ('jitomate-cherry', 1.0000);

  -- 2) Guardas de vínculo: todo slug de _lista y de _bajas debe tener
  --    su renglón de FRUGASA con el mismo SKU. Si la tienda cambió un
  --    slug o un vínculo, la migración se detiene ANTES de escribir.
  SELECT string_agg(l.slug, ', ') INTO v_malos
  FROM _lista l
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.supplier_id = v_supplier
      AND ps.supplier_sku = l.sku
      AND p.slug = l.slug
  );
  IF v_malos IS NOT NULL THEN
    RAISE EXCEPTION '00227: slugs de la lista sin vínculo FRUGASA con ese SKU: %', v_malos;
  END IF;

  SELECT string_agg(b.slug, ', ') INTO v_malos
  FROM _bajas b
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.supplier_id = v_supplier
      AND p.slug = b.slug
  );
  IF v_malos IS NOT NULL THEN
    RAISE EXCEPTION '00227: slugs fuera de lista sin vínculo FRUGASA: %', v_malos;
  END IF;

  -- 3) Foto del estado ANTES de escribir: costo viejo/nuevo, factor,
  --    tope por kilo, precio y visibilidad actuales.
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT p.id AS product_id,
         p.slug,
         ps.is_primary,
         ps.cost AS costo_viejo,
         l.costo AS costo_nuevo,
         COALESCE(f.factor, 1) AS factor,
         cap.cap_kg,
         p.price AS precio_viejo,
         p.is_visible
  FROM _lista l
  JOIN public.products p ON p.slug = l.slug
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id
   AND ps.supplier_id = v_supplier
   AND ps.supplier_sku = l.sku
  LEFT JOIN _factor f ON f.slug = l.slug
  LEFT JOIN (
    SELECT product_id, MIN(unit_price) AS cap_kg
    FROM public.competitor_prices
    WHERE unit_price IS NOT NULL
    GROUP BY product_id
  ) cap ON cap.product_id = p.id;

  SELECT count(*) INTO v_en_lista FROM _calc;
  IF v_en_lista <> 129 THEN
    RAISE EXCEPTION '00227: se esperaban 129 artículos de la lista vinculados y se encontraron %', v_en_lista;
  END IF;

  SELECT count(*) INTO v_sin_cambio FROM _calc WHERE costo_nuevo = costo_viejo;

  -- Artículos hoy ocultos cuyo costo nuevo ya admite precio válido:
  -- se re-precian en el paso 5 pero NO se reactivan solos.
  SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_reactivables
  FROM _calc
  WHERE is_primary
    AND NOT is_visible
    AND costo_nuevo <> costo_viejo
    AND (cap_kg IS NULL OR FLOOR(cap_kg * factor * 100) / 100 >= costo_nuevo * factor);

  -- 4) Costos: se refresca costo, presentación, fecha y nota de los 129.
  UPDATE public.product_suppliers ps
  SET cost = l.costo,
      presentation = l.presentation,
      list_date = DATE '2026-11-13',
      notes = 'Lista de precios FRUGASA "Precios 1897" (RESTAURANT 2), vigencia 13-nov-2026. Costo por kilo.',
      updated_at = now()
  FROM _lista l
  JOIN public.products p ON p.slug = l.slug
  WHERE ps.product_id = p.id
    AND ps.supplier_id = v_supplier
    AND ps.supplier_sku = l.sku
    AND (ps.cost IS DISTINCT FROM l.costo
      OR ps.presentation IS DISTINCT FROM l.presentation
      OR ps.list_date IS DISTINCT FROM DATE '2026-11-13');

  SELECT count(*) INTO v_costos FROM _calc WHERE costo_nuevo <> costo_viejo;

  -- 5a) Ocultar los primarios cuyo tope quedó por debajo del costo
  --     nuevo (solo si el costo cambió). Se limpia la publicación
  --     programada, como manda 00203.
  UPDATE public.products p
  SET is_visible = false,
      publish_at = NULL,
      unpublish_at = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.product_id
    AND c.is_primary
    AND c.costo_nuevo <> c.costo_viejo
    AND c.cap_kg IS NOT NULL
    AND FLOOR(c.cap_kg * c.factor * 100) / 100 < c.costo_nuevo * c.factor;

  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

  -- 5b) Recalcular el precio donde FRUGASA es primario, el costo
  --     cambió y existe precio válido (tope ausente o >= costo).
  UPDATE public.products p
  SET price = LEAST(
        CEIL(c.costo_nuevo * c.factor * 1.20),
        COALESCE(FLOOR(c.cap_kg * c.factor * 100) / 100, CEIL(c.costo_nuevo * c.factor * 1.20))
      ),
      sale_price = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.product_id
    AND c.is_primary
    AND c.costo_nuevo <> c.costo_viejo
    AND (c.cap_kg IS NULL
         OR FLOOR(c.cap_kg * c.factor * 100) / 100 >= c.costo_nuevo * c.factor);

  GET DIAGNOSTICS v_precios = ROW_COUNT;

  -- 5c) Saneamiento: primarios VISIBLES de FRUGASA cuyo precio ya
  --     rompía las reglas aunque su costo no haya cambiado (el caso
  --     achiote). Se oculta si el tope quedó bajo el costo; si hay
  --     precio válido, se aplica la fórmula. Los que el paso 5b ya
  --     dejó en la fórmula no se tocan (su precio ya es la fórmula).
  CREATE TEMP TABLE _saneo ON COMMIT DROP AS
  SELECT p.id AS product_id,
         p.slug,
         ps.cost AS costo,
         COALESCE(f.factor, 1) AS factor,
         cap.cap_kg,
         p.price AS precio_viejo,
         LEAST(
           CEIL(ps.cost * COALESCE(f.factor, 1) * 1.20),
           COALESCE(FLOOR(cap.cap_kg * COALESCE(f.factor, 1) * 100) / 100,
                    CEIL(ps.cost * COALESCE(f.factor, 1) * 1.20))
         ) AS precio_nuevo
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id
   AND ps.supplier_id = v_supplier
   AND ps.is_primary
  LEFT JOIN _factor f ON f.slug = p.slug
  LEFT JOIN (
    SELECT product_id, MIN(unit_price) AS cap_kg
    FROM public.competitor_prices
    WHERE unit_price IS NOT NULL
    GROUP BY product_id
  ) cap ON cap.product_id = p.id
  WHERE p.is_visible
    AND (p.price < ps.cost * COALESCE(f.factor, 1)
      OR (cap.cap_kg IS NOT NULL
          AND p.price > cap.cap_kg * COALESCE(f.factor, 1)));

  SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_saneo_slugs FROM _saneo;

  UPDATE public.products p
  SET is_visible = false,
      publish_at = NULL,
      unpublish_at = NULL,
      updated_at = now()
  FROM _saneo s
  WHERE p.id = s.product_id
    AND s.cap_kg IS NOT NULL
    AND FLOOR(s.cap_kg * s.factor * 100) / 100 < s.costo * s.factor;

  UPDATE public.products p
  SET price = s.precio_nuevo,
      sale_price = NULL,
      updated_at = now()
  FROM _saneo s
  WHERE p.id = s.product_id
    AND (s.cap_kg IS NULL
         OR FLOOR(s.cap_kg * s.factor * 100) / 100 >= s.costo * s.factor)
    AND p.price IS DISTINCT FROM s.precio_nuevo;

  GET DIAGNOSTICS v_saneo = ROW_COUNT;

  -- 6) Los que salieron de la lista: solo la nota.
  UPDATE public.product_suppliers ps
  SET notes = 'La lista FRUGASA "Precios 1897" (13-nov-2026) ya no trae este artículo; se conserva el costo de la lista del 18-sep-2026 ("Precios 1853").',
      updated_at = now()
  FROM _bajas b
  JOIN public.products p ON p.slug = b.slug
  WHERE ps.product_id = p.id
    AND ps.supplier_id = v_supplier;

  -- 7) Guardas en positivo sobre TODO primario visible de FRUGASA:
  --    ningún precio por debajo del costo de su unidad de venta ni
  --    por encima del tope.
  SELECT string_agg(p.slug, ', ') INTO v_malos
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id
   AND ps.supplier_id = v_supplier
   AND ps.is_primary
  LEFT JOIN _factor f ON f.slug = p.slug
  LEFT JOIN (
    SELECT product_id, MIN(unit_price) AS cap_kg
    FROM public.competitor_prices
    WHERE unit_price IS NOT NULL
    GROUP BY product_id
  ) cap ON cap.product_id = p.id
  WHERE p.is_visible
    AND (p.price < ps.cost * COALESCE(f.factor, 1)
      OR (cap.cap_kg IS NOT NULL AND p.price > cap.cap_kg * COALESCE(f.factor, 1)));

  IF v_malos IS NOT NULL THEN
    RAISE EXCEPTION '00227: productos visibles que rompen las reglas tras el refresco: %', v_malos;
  END IF;

  RAISE NOTICE '00227: % artículos de la lista vinculados (129 esperados).', v_en_lista;
  RAISE NOTICE '00227: % costos cambiaron, % quedaron igual.', v_costos, v_sin_cambio;
  RAISE NOTICE '00227: % precios recalculados (FRUGASA primario, costo cambiado).', v_precios;
  RAISE NOTICE '00227: % productos ocultados por tope bajo costo.', v_ocultos;
  IF v_saneo_slugs IS NOT NULL THEN
    RAISE NOTICE '00227: saneamiento de precios que ya rompían las reglas (costo sin cambio): %', v_saneo_slugs;
  END IF;
  RAISE NOTICE '00227: 6 artículos fuera de la lista conservaron su costo del 18-sep-2026.';
  IF v_reactivables IS NOT NULL THEN
    RAISE NOTICE '00227: ocultos que ya admiten precio válido (reactivar desde /admin/productos): %', v_reactivables;
  END IF;
END $$;

COMMIT;
