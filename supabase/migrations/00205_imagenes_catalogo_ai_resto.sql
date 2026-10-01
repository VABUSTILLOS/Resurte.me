-- ============================================================
-- 00205 — Imágenes de catálogo generadas por IA (Kie.ai GPT-4o Image).
--
-- POR QUE NOMBRES NUEVOS
-- ----------------------
-- `next.config.ts` sirve `/images/**` con `Cache-Control: immutable,
-- max-age=31536000`: reutilizar la ruta vieja dejaría a los navegadores un
-- año con la imagen anterior. Todas viven en `/images/products/ai/<slug>.webp`.
--
-- QUE REEMPLAZA
-- -------------
-- Imágenes genéricas mal puestas, fotos de receta que no coinciden con el
-- producto, numeradas de Take.app compartidas entre SKUs distintos y fotos
-- Wikimedia reutilizadas. Incluye el aguacate chunky, cuya foto de 00194
-- contenía AJOS (descarga mal rotulada); su crédito Wikimedia se retiró de
-- src/content/image-credits.ts porque la imagen IA no requiere atribución.
--
-- Se mantienen intactas: fotos reales de resurte.com (Take.app), las demás
-- fotos de AB Foods con atribución y las fotos locales con nombre propio.
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

DO $$
DECLARE
  v_filas int;
BEGIN
  CREATE TEMP TABLE _img_ai (slug text PRIMARY KEY, image_url text NOT NULL) ON COMMIT DROP;

  INSERT INTO _img_ai (slug, image_url) VALUES
    ('ala-botanera-bolsa-5kg', '/images/products/ai/ala-botanera-bolsa-5kg.webp'),
    ('ala-habanero-bolsa-5kg', '/images/products/ai/ala-habanero-bolsa-5kg.webp'),
    ('ala-iqf-pilgrims-caja-12kg', '/images/products/ai/ala-iqf-pilgrims-caja-12kg.webp'),
    ('albahaca', '/images/products/ai/albahaca.webp'),
    ('alfalfa-germinado', '/images/products/ai/alfalfa-germinado.webp'),
    ('almendras-500g', '/images/products/ai/almendras-500g.webp'),
    ('amaranto', '/images/products/ai/amaranto.webp'),
    ('anis', '/images/products/ai/anis.webp'),
    ('aros-cebolla-bolsa-907g', '/images/products/ai/aros-cebolla-bolsa-907g.webp'),
    ('arrachera-premium-sukarne', '/images/products/ai/arrachera-premium-sukarne.webp'),
    ('arroz-blanco-1kg', '/images/products/ai/arroz-blanco-1kg.webp'),
    ('avena', '/images/products/ai/avena.webp'),
    ('boneless-buffalo-freskecito', '/images/products/ai/boneless-buffalo-freskecito.webp'),
    ('boneless-natural-freskecito', '/images/products/ai/boneless-natural-freskecito.webp'),
    ('boneless-pechuga-pilgrims', '/images/products/ai/boneless-pechuga-pilgrims.webp'),
    ('cacahuate-enchilado', '/images/products/ai/cacahuate-enchilado.webp'),
    ('cacahuate-japones', '/images/products/ai/cacahuate-japones.webp'),
    ('cacahuate-natural-tostado', '/images/products/ai/cacahuate-natural-tostado.webp'),
    ('calabaza', '/images/products/ai/calabaza.webp'),
    ('canela-en-polvo', '/images/products/ai/canela-en-polvo.webp'),
    ('carne-al-pastor-100', '/images/products/ai/carne-al-pastor-100.webp'),
    ('cebolla-amarilla', '/images/products/ai/cebolla-amarilla.webp'),
    ('cebolla-cambray', '/images/products/ai/cebolla-cambray.webp'),
    ('champinon', '/images/products/ai/champinon.webp'),
    ('chicharo', '/images/products/ai/chicharo.webp'),
    ('chile-cascabel', '/images/products/ai/chile-cascabel.webp'),
    ('chile-chiltepin', '/images/products/ai/chile-chiltepin.webp'),
    ('chile-colorin', '/images/products/ai/chile-colorin.webp'),
    ('chile-de-la-tierra', '/images/products/ai/chile-de-la-tierra.webp'),
    ('chile-mirasol', '/images/products/ai/chile-mirasol.webp'),
    ('chile-morita', '/images/products/ai/chile-morita.webp'),
    ('chile-pasado', '/images/products/ai/chile-pasado.webp'),
    ('ciruela-pasa', '/images/products/ai/ciruela-pasa.webp'),
    ('consome-de-pollo-1kg', '/images/products/ai/consome-de-pollo-1kg.webp'),
    ('costilla-back-rib', '/images/products/ai/costilla-back-rib.webp'),
    ('curcuma', '/images/products/ai/curcuma.webp'),
    ('ejote', '/images/products/ai/ejote.webp'),
    ('epazote', '/images/products/ai/epazote.webp'),
    ('filete-tilapia-35', '/images/products/ai/filete-tilapia-35.webp'),
    ('fresa', '/images/products/ai/fresa.webp'),
    ('frijol-negro-1kg', '/images/products/ai/frijol-negro-1kg.webp'),
    ('germinado-de-soya', '/images/products/ai/germinado-de-soya.webp'),
    ('haba', '/images/products/ai/haba.webp'),
    ('hierbabuena-fresca', '/images/products/ai/hierbabuena-fresca.webp'),
    ('hoja-de-laurel', '/images/products/ai/hoja-de-laurel.webp'),
    ('jamaica', '/images/products/ai/jamaica.webp'),
    ('jengibre-fresco', '/images/products/ai/jengibre-fresco.webp'),
    ('jitomate-cherry', '/images/products/ai/jitomate-cherry.webp'),
    ('kale-organico-1kg', '/images/products/ai/kale-organico-1kg.webp'),
    ('lenteja-1kg', '/images/products/ai/lenteja-1kg.webp'),
    ('maiz-rosero', '/images/products/ai/maiz-rosero.webp'),
    ('mango-ataulfo', '/images/products/ai/mango-ataulfo.webp'),
    ('mejorana-fresca', '/images/products/ai/mejorana-fresca.webp'),
    ('menta-fresca', '/images/products/ai/menta-fresca.webp'),
    ('nuez-de-castilla', '/images/products/ai/nuez-de-castilla.webp'),
    ('nugget-pechuga-pilgrims', '/images/products/ai/nugget-pechuga-pilgrims.webp'),
    ('oregano-molido-100g', '/images/products/ai/oregano-molido-100g.webp'),
    ('papa-francesa-14-payette-caja-1224kg', '/images/products/ai/papa-francesa-14-payette-caja-1224kg.webp'),
    ('papa-francesa-38-payette-caja-1361kg', '/images/products/ai/papa-francesa-38-payette-caja-1361kg.webp'),
    ('pasas', '/images/products/ai/pasas.webp'),
    ('pechuga-grill-fc-pilgrims', '/images/products/ai/pechuga-grill-fc-pilgrims.webp'),
    ('pechuga-picante-emp-pilgrims', '/images/products/ai/pechuga-picante-emp-pilgrims.webp'),
    ('pechuga-sh-am-soles-caja-10kg', '/images/products/ai/pechuga-sh-am-soles-caja-10kg.webp'),
    ('pechuga-sh-br-soles-caja-10kg', '/images/products/ai/pechuga-sh-br-soles-caja-10kg.webp'),
    ('pechuga-sh-pilgrims-caja-12kg', '/images/products/ai/pechuga-sh-pilgrims-caja-12kg.webp'),
    ('pechuga-sin-hueso-br', '/images/products/ai/pechuga-sin-hueso-br.webp'),
    ('pera', '/images/products/ai/pera.webp'),
    ('pimenton', '/images/products/ai/pimenton.webp'),
    ('pimiento-morron', '/images/products/ai/pimiento-morron.webp'),
    ('platano-macho', '/images/products/ai/platano-macho.webp'),
    ('pollo-entero-congelado-pilgrims-caja-145kg', '/images/products/ai/pollo-entero-congelado-pilgrims-caja-145kg.webp'),
    ('romero-fresco', '/images/products/ai/romero-fresco.webp'),
    ('sal-de-mar-fina-1kg', '/images/products/ai/sal-de-mar-fina-1kg.webp'),
    ('semilla-chia-1kg', '/images/products/ai/semilla-chia-1kg.webp'),
    ('tamarindo', '/images/products/ai/tamarindo.webp'),
    ('tapioca', '/images/products/ai/tapioca.webp'),
    ('tomillo-fresco', '/images/products/ai/tomillo-fresco.webp'),
    ('trigo-entero', '/images/products/ai/trigo-entero.webp'),
    ('zarzamora', '/images/products/ai/zarzamora.webp')
  ;

  UPDATE products p
  SET image_url  = f.image_url,
      images     = jsonb_build_array(f.image_url),
      updated_at = now()
  FROM _img_ai f
  WHERE p.slug = f.slug;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 79 THEN
    RAISE WARNING '00205: se esperaban 79 productos y se actualizaron %.', v_filas;
  ELSE
    RAISE NOTICE '00205: 79 imágenes de catálogo IA aplicadas.';
  END IF;
END $$;
