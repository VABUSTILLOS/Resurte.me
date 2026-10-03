-- ============================================================
-- 00218 — Imágenes e infografías de los productos ocultos agregados por
-- scripts/archive (add_missing_products.js / add-more-products.js).
--
-- QUE HACE
-- --------
-- Completa la ficha de los 78 productos ocultos que faltaban
-- (quesos, chiles secos por variedad, abarrotes gourmet, aceites, bebidas,
-- aderezos, café, cocina árabe/asiática/latina), agregados a mano con
-- scripts archive y nunca versionados en migraciones:
-- 1. `image_url` reapuntado a la imagen de catálogo generada en
--    /images/products/ai/<slug>.webp (antes: fotos viejas recipe/ o
--    genéricas de Take.app).
-- 2. `images = [principal, infografía]`: la infografía nutrimental/de uso
--    como 2ª imagen, mismo patrón que 00215, 00216 y 00217.
--
-- SIGUEN OCULTOS: esto no publica nada; solo deja la ficha lista para
-- activarse desde /admin/productos.
--
-- Idempotente: fija image_url e images a su valor final, solo en productos
-- con is_visible = false.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_img int;
  v_total int;
BEGIN
  CREATE TEMP TABLE _ocultos_arch (slug text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _ocultos_arch (slug) VALUES
    ('queso-cheddar-rebanado-200g'),
    ('queso-amarillo-americano-200g'),
    ('papas-fritas-congeladas'),
    ('mostaza-3l'),
    ('pepinillos-1kg'),
    ('lechuga-iceberg'),
    ('crema-mexicana-1l'),
    ('chile-guajillo-seco'),
    ('chile-ancho-seco'),
    ('chile-arbol-seco'),
    ('manteca-cerdo-1kg'),
    ('pasta-achiote'),
    ('arroz-sushi-5kg'),
    ('alga-nori-50hojas'),
    ('salsa-soya-5l'),
    ('sriracha-740ml'),
    ('wasabi-polvo-250g'),
    ('vinagre-arroz-1l'),
    ('aceite-ajonjoli-500ml'),
    ('queso-mozzarella-1kg'),
    ('pepperoni-1kg'),
    ('pure-tomate-3kg'),
    ('salsa-pomodoro-2kg'),
    ('aceitunas-negras-1kg'),
    ('levadura-instantanea-500g'),
    ('harina-fuerza-5kg'),
    ('cajas-pizza-25pz'),
    ('aderezo-blue-cheese-1l'),
    ('ajo-en-polvo-500g'),
    ('arroz-morelos-5kg'),
    ('tostadas-maiz-20pz'),
    ('salsa-huichol-500ml'),
    ('surimi-1kg'),
    ('carbon-vegetal-5kg'),
    ('pimienta-negra-gruesa'),
    ('cebollitas-cambray'),
    ('aceite-oliva-1l'),
    ('cafe-grano-1kg'),
    ('jarabe-vainilla-1l'),
    ('jarabe-caramelo-1l'),
    ('chocolate-polvo-1kg'),
    ('harina-hotcakes-1kg'),
    ('miel-maple-500ml'),
    ('filtros-cafe-100pz'),
    ('vinagre-balsamico-500ml'),
    ('garbanzo-lata-3kg'),
    ('arandanos-500g'),
    ('semillas-girasol-500g'),
    ('aderezo-cesar-1l'),
    ('azucar-glass-1kg'),
    ('polvo-hornear-500g'),
    ('bicarbonato-500g'),
    ('nuez-pecana-500g'),
    ('harina-pastel-1kg'),
    ('leche-polvo-1kg'),
    ('frutos-rojos-congelados'),
    ('jocoque-1kg'),
    ('carne-cerdo-trompo'),
    ('garbanzo-seco-5kg'),
    ('sumac-250g'),
    ('zaatar-250g'),
    ('yogurt-griego-1l'),
    ('bulgur-1kg'),
    ('cardamomo-100g'),
    ('queso-costeno-500g'),
    ('carne-mechada-1kg'),
    ('chorizo-colombiano-500g'),
    ('dulce-leche-1kg'),
    ('obleas-12pz'),
    ('suero-costeno-1l'),
    ('aji-dulce-500g'),
    ('papelon-1kg'),
    ('coca-cola-2-5l'),
    ('pepsi-2-5l'),
    ('clamato-1l'),
    ('tajin-500g'),
    ('chamoy-1l'),
    ('escarchado-michelada');

  UPDATE public.products p
  SET image_url = '/images/products/ai/' || p.slug || '.webp',
      images = jsonb_build_array(
        '/images/products/ai/' || p.slug || '.webp',
        '/images/products/infografia/' || p.slug || '.webp'
      ),
      updated_at = now()
  FROM _ocultos_arch o
  WHERE p.slug = o.slug
    AND p.is_visible = false;

  GET DIAGNOSTICS v_img = ROW_COUNT;

  SELECT count(*) INTO v_total FROM _ocultos_arch;
  IF v_img <> v_total THEN
    RAISE WARNING '00218: se esperaban % productos y se actualizaron % (¿alguno está visible o no existe?).', v_total, v_img;
  ELSE
    RAISE NOTICE '00218: % productos ocultos con imagen AI + infografía (siguen ocultos).', v_img;
  END IF;
END $$;

COMMIT;
