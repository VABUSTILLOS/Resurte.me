-- ============================================================
-- 00206 — Imágenes de catálogo generadas por IA (Kie.ai GPT-4o Image).
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
    ('aguacate-hass', '/images/products/ai/aguacate-hass.webp'),
    ('ajonjoli', '/images/products/ai/ajonjoli.webp'),
    ('apio-palitos-aderezo-mr-lucky', '/images/products/ai/apio-palitos-aderezo-mr-lucky.webp'),
    ('arandano-fresco', '/images/products/ai/arandano-fresco.webp'),
    ('arroz-blanco-1kg', '/images/products/ai/arroz-blanco-1kg-v2.webp'),
    ('azucar-refinada-5kg', '/images/products/ai/azucar-refinada-5kg.webp'),
    ('blue-berry', '/images/products/ai/blue-berry.webp'),
    ('chacal', '/images/products/ai/chacal.webp'),
    ('chile-caribe', '/images/products/ai/chile-caribe.webp'),
    ('chile-chilaca', '/images/products/ai/chile-chilaca.webp'),
    ('clavo', '/images/products/ai/clavo.webp'),
    ('coco-rayado', '/images/products/ai/coco-rayado.webp'),
    ('cocoa-polvo-1kg', '/images/products/ai/cocoa-polvo-1kg.webp'),
    ('comino-molido', '/images/products/ai/comino-molido.webp'),
    ('dedos-queso-bolsa-181kg', '/images/products/ai/dedos-queso-bolsa-181kg.webp'),
    ('gragea', '/images/products/ai/gragea.webp'),
    ('granola', '/images/products/ai/granola.webp'),
    ('linaza', '/images/products/ai/linaza.webp'),
    ('papa-conquest-14-caja-1633kg', '/images/products/ai/papa-conquest-14-caja-1633kg.webp'),
    ('papa-conquest-delivery-38-sc-caja-1361kg', '/images/products/ai/papa-conquest-delivery-38-sc-caja-1361kg.webp'),
    ('papa-conquest-delivery-teja-65-caja-1361kg', '/images/products/ai/papa-conquest-delivery-teja-65-caja-1361kg.webp'),
    ('papa-curly-savory-caja-1361kg', '/images/products/ai/papa-curly-savory-caja-1361kg.webp'),
    ('papa-dulce-recta-38-caja-680kg', '/images/products/ai/papa-dulce-recta-38-caja-680kg.webp'),
    ('papa-gajo-10-cut-65-caja-1361kg', '/images/products/ai/papa-gajo-10-cut-65-caja-1361kg.webp'),
    ('papa-hash-brown-patty-caja-952kg', '/images/products/ai/papa-hash-brown-patty-caja-952kg.webp'),
    ('papa-megacrunch-14-caja-1224kg', '/images/products/ai/papa-megacrunch-14-caja-1224kg.webp'),
    ('papa-ondulada-38-payette-caja-1361kg', '/images/products/ai/papa-ondulada-38-payette-caja-1361kg.webp'),
    ('papa-rallada-hash-brown-caja-816kg', '/images/products/ai/papa-rallada-hash-brown-caja-816kg.webp'),
    ('papa-rejilla-savory-caja-1224kg', '/images/products/ai/papa-rejilla-savory-caja-1224kg.webp'),
    ('papa-select-38-cascara-caja-1361kg', '/images/products/ai/papa-select-38-cascara-caja-1361kg.webp'),
    ('papa-select-38-sc-caja-1361kg', '/images/products/ai/papa-select-38-sc-caja-1361kg.webp'),
    ('papa-select-516-sc-caja-1361kg', '/images/products/ai/papa-select-516-sc-caja-1361kg.webp'),
    ('papa-thunder-38-sc-caja-1361kg', '/images/products/ai/papa-thunder-38-sc-caja-1361kg.webp'),
    ('pepita-de-calabaza', '/images/products/ai/pepita-de-calabaza.webp'),
    ('pepita-de-girasol', '/images/products/ai/pepita-de-girasol.webp'),
    ('piloncillo', '/images/products/ai/piloncillo.webp'),
    ('queso-crema-krol-barra-136kg', '/images/products/ai/queso-crema-krol-barra-136kg.webp'),
    ('queso-crema-reny-picot-136kg', '/images/products/ai/queso-crema-reny-picot-136kg.webp'),
    ('queso-crema-reny-picot-caja-8kg', '/images/products/ai/queso-crema-reny-picot-caja-8kg.webp'),
    ('quinoa-1kg', '/images/products/ai/quinoa-1kg.webp')
  ;

  UPDATE products p
  SET image_url  = f.image_url,
      images     = jsonb_build_array(f.image_url),
      updated_at = now()
  FROM _img_ai f
  WHERE p.slug = f.slug;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 40 THEN
    RAISE WARNING '00206: se esperaban 40 productos y se actualizaron %.', v_filas;
  ELSE
    RAISE NOTICE '00206: 40 imágenes de catálogo IA aplicadas.';
  END IF;
END $$;
