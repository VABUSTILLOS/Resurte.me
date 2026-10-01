-- ============================================================
-- 00208 — Imágenes de catálogo generadas por IA (Kie.ai GPT-4o Image).
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
    ('arandano-fresco', '/images/products/ai/arandano-fresco-v3.webp'),
    ('tuna-fruta', '/images/products/ai/tuna-fruta-v2.webp')
  ;

  UPDATE products p
  SET image_url  = f.image_url,
      images     = jsonb_build_array(f.image_url),
      updated_at = now()
  FROM _img_ai f
  WHERE p.slug = f.slug;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 2 THEN
    RAISE WARNING '00208: se esperaban 2 productos y se actualizaron %.', v_filas;
  ELSE
    RAISE NOTICE '00208: 2 imágenes de catálogo IA aplicadas.';
  END IF;
END $$;
