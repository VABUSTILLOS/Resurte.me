-- ============================================================
-- 00196 — FRUGASA: proveedor y costos de lista (18-sep-2026)
--
-- QUE HACE
-- --------
-- Da de alta el proveedor `frugasa` y vincula 74 productos de la tienda
-- con su articulo de la lista de precios vigente al 18-sep-2026
-- (folio "Precios 1853", "Modificar: RESTAURANT 2").
--
-- El COSTO vive SOLO aqui. No se escribe en `products.cost` (lo lee
-- `anon` con la llave publica: seria publicar nuestro margen) ni en
-- `products.description`. Es la misma regla que fijo `00191` para
-- AB Foods y que `00192` hizo cumplir revocando el GRANT de tabla.
--
-- LA LISTA ES POR KILO
-- --------------------
-- El PDF no trae columna de unidad. Se verifico que es por kilo
-- comparando contra el precio REGULAR de Alsuper: en 35 articulos el
-- costo de FRUGASA cae entre el 25 % y el 84 % del retail (mediana
-- ~55 %), que es exactamente el diferencial de un mayorista. Cuando la
-- columna "Opcion" no dice kilo, lo dice explicitamente ("O Manojo",
-- "P MJO GDE", "P 30 Pzas").
--
-- Por eso `cost` es el precio POR KILO de la lista. El factor de
-- conversion a la unidad de venta de cada producto (100 g, 500 g, 5 kg)
-- NO se guarda aqui: vive en la migracion `00198`, que es la unica que
-- calcula precios, para que la regla se lea en un solo lugar.
--
-- Idempotente: re-ejecutarla refresca costo, presentacion y fecha.
-- ============================================================

BEGIN;

INSERT INTO public.suppliers (name, slug, status, city, state, notes)
VALUES (
  'FRUGASA', 'frugasa', 'activo', 'Chihuahua', 'Chihuahua',
  'Lista de precios "Precios 1853" (RESTAURANT 2) vigente al 18-sep-2026. '
  'Frutas, verduras, chiles secos, especias y granos. Precios POR KILO.'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = now();

DO $$
DECLARE
  v_supplier bigint;
  v_filas int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'frugasa';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00196: no se pudo dar de alta el proveedor frugasa';
  END IF;

  -- Costo de lista POR KILO de cada articulo de FRUGASA.
  CREATE TEMP TABLE _frugasa_costo (
    slug          text PRIMARY KEY,
    supplier_sku  text NOT NULL,
    presentation  text,
    cost          numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _frugasa_costo (slug, supplier_sku, presentation, cost) VALUES
    ('aguacate-hass', 'R0002', 'T Selecto, P E Selecto.', 63.00),
    ('betabel', 'R0006', 'T 25 LBS, P BTO.', 13.80),
    ('cebolla-blanca', 'R0012', 'T LG, O USA.', 54.00),
    ('cebolla-morada', 'R0013', 'T LG, O USA.', 35.10),
    ('champinon', 'R0017', 'T 12, O MEX.', 27.00),
    ('guayaba', 'R0027', 'P E Selecto.', 48.95),
    ('chile-jalapeno', 'R0028', 'P Empaque.', 27.00),
    ('mandarina', 'R0034', 'P Empaque.', 84.40),
    ('manzana-roja', 'R0036', 'T 100, P Empaque.', 57.55),
    ('pimiento-morron', 'R0040', 'T XL, C Verde Exp..', 50.00),
    ('naranja-valencia', 'R0041', 'P Empaque.', 39.70),
    ('nopal', 'R0042', 'P Penca.', 47.25),
    ('papa-blanca', 'R0043', 'C Papa Gallo, P Empaque.', 39.95),
    ('pepino', 'R0045', 'T Selecto, C Nacional.', 17.00),
    ('pera', 'R0047', 'T 100, T Anjou.', 61.00),
    ('platano-macho', 'R0049', 'T Comercial.', 28.70),
    ('sandia', 'R0052', 'T Rayada.', 13.50),
    ('jitomate-bola', 'R0053', 'T 5X6 3T, O Inv. nacional.', 47.00),
    ('jitomate-saladet', 'R0054', 'T LG, O Inv. nacional.', 33.50),
    ('tomate-verde', 'R0055', 'C Nacional, T S/Hoja.', 27.05),
    ('toronja', 'R0056', 'P Empaque.', 37.80),
    ('uvas-rojas', 'R0059', 'T Globo, O USA.', 105.00),
    ('uvas-verdes', 'R0058', 'T Sin semilla, O USA.', 115.00),
    ('zanahoria', 'R0060', 'T 50 LBS, T Leña.', 12.00),
    ('chile-poblano', 'R0063', 'P Empaque.', 40.50),
    ('chile-serrano', 'R0064', 'P Empaque.', 46.70),
    ('chile-habanero', 'R0134', NULL, 160.40),
    ('jengibre-fresco', 'R0030', NULL, 121.50),
    ('limon-agrio', 'R0033', 'T Agrio.', 34.55),
    ('kale-organico-1kg', 'R0211', NULL, 57.40),
    ('frijol-negro-1kg', 'R0088', 'T Negra(o).', 39.15),
    ('arroz-blanco-1kg', 'R0074', NULL, 29.45),
    ('lenteja-1kg', 'R0101', NULL, 40.50),
    ('quinoa-1kg', 'R0250', NULL, 129.60),
    ('semilla-chia-1kg', 'R0248', NULL, 141.75),
    ('consome-de-pollo-1kg', 'R0109', 'T Pollo.', 52.65),
    ('sal-de-mar-fina-1kg', 'R0120', 'T De Mesa.', 11.65),
    ('azucar-refinada-5kg', 'R0166', 'T Normal.', 27.30),
    ('cocoa-polvo-1kg', 'R0249', NULL, 309.70),
    ('pimenton', 'R0113', NULL, 170.10),
    ('hoja-de-laurel', 'R0099', NULL, 137.70),
    ('comino-molido', 'R0082', 'P Molido(a).', 103.95),
    ('oregano-molido-100g', 'R0106', 'P Molido(a).', 87.75),
    ('canela-en-polvo', 'R0076', 'P Molido(a).', 168.75),
    ('pimienta-negra-molida', 'R0116', 'C Negro(a), P Molido(a).', 247.05),
    ('pasas', 'R0107', NULL, 91.80),
    ('almendras-500g', 'R0072', 'P Entera(o).', 247.05),
    ('nuez-de-castilla', 'R0067', 'P Mitad.', 486.00),
    ('achiote', 'R0069', NULL, 114.75),
    ('ajo', 'R0003', 'C Blanco(a), P Molido(a).', 70.90),
    ('apio', 'R0005', 'T 24, O MEX.', 32.00),
    ('brocoli', 'R0007', 'O MEX, P CROWN.', 40.00),
    ('chayote', 'R0018', 'C Verde.', 16.80),
    ('cilantro', 'R0065', 'T 60, P Generica.', 5.20),
    ('col-blanca', 'R0051', 'C Verde 1a Nac., P Empaque.', 8.75),
    ('coliflor', 'R0061', 'T 12, O MEX.', 40.50),
    ('elote', 'R0084', 'P Blanco.', 9.45),
    ('epazote', 'R0110', 'P MJO GDE.', 20.15),
    ('espinaca', 'R0021', 'P Generica.', 8.20),
    ('fresa', 'R0025', 'T 8 Pz Gaitan.', 59.00),
    ('hierbabuena-fresca', 'R0094', NULL, 14.20),
    ('lechuga-romana', 'R0032', 'T Orejona Lisa, P Tradicional.', 21.00),
    ('mango-ataulfo', 'R0035', 'T Ataulfo, P E Selecto.', 122.40),
    ('melon-chino', 'R0038', 'T 12, O MEX.', 18.90),
    ('papaya-maradol', 'R0044', 'P Kilo.', 33.15),
    ('perejil', 'R0046', 'T Liso, P Generica.', 6.90),
    ('pina-miel', 'R0048', 'T Miel.', 42.95),
    ('rabano', 'R0050', 'T 1  LBS, P 30 Pzas..', 14.40),
    ('romero-fresco', 'R0140', 'P MJO.', 40.40),
    ('tomillo-fresco', 'R0123', NULL, 162.00),
    ('zarzamora', 'R0146', NULL, 81.00),
    ('germinado-de-soya', 'R0089', 'P Mv.', 51.30),
    ('cebolla-cambray', 'R0015', 'T Cambray, P Generica.', 6.55),
    ('jitomate-cherry', 'R0133', 'T 12, T Bola.', 43.90);

  -- La guarda es el JOIN por slug: un slug que no exista en la tienda no
  -- inserta nada, asi que la migracion no puede vincular un homonimo.
  INSERT INTO public.product_suppliers
    (product_id, supplier_id, supplier_sku, presentation, cost, list_date, is_primary, notes)
  SELECT p.id, v_supplier, c.supplier_sku, c.presentation, c.cost,
         DATE '2026-09-18', true,
         'Lista FRUGASA "Precios 1853" (RESTAURANT 2). Costo por kilo.'
  FROM _frugasa_costo c
  JOIN public.products p ON p.slug = c.slug
  ON CONFLICT (product_id, supplier_id, supplier_sku) DO UPDATE
    SET cost = EXCLUDED.cost,
        presentation = EXCLUDED.presentation,
        list_date = EXCLUDED.list_date,
        is_primary = EXCLUDED.is_primary,
        notes = EXCLUDED.notes,
        updated_at = now();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 74 THEN
    RAISE WARNING
      '00196: se esperaban 74 vinculos con FRUGASA y se escribieron %. Revisa que los slugs sigan existiendo.',
      v_filas;
  ELSE
    RAISE NOTICE '00196: % articulos de FRUGASA vinculados con su costo de lista.', v_filas;
  END IF;
END $$;

COMMIT;
