-- ============================================================
-- 00194 — AB Foods: las 22 fichas de marca se cambian por fotos reales.
--
-- POR QUE HAY QUE CAMBIAR EL NOMBRE DEL ARCHIVO
-- ---------------------------------------------
-- `next.config.ts` sirve `/images/**` y `*.webp` con
-- `Cache-Control: public, max-age=31536000, immutable`. Si la foto nueva
-- ocupara el mismo `<slug>.webp` que la ficha de marca, **el navegador de cada
-- cliente que ya visito la ficha seguiria mostrandola durante un anio**: el
-- `immutable` le dice explicitamente que no vuelva a preguntar. Por eso las
-- fotos viven en `<slug>-foto.webp` y esta migracion reapunta `image_url` e
-- `images`.
--
-- DE DONDE VIENEN LAS FOTOS
-- -------------------------
-- Wikimedia Commons, con licencia libre. **17 de las 22 exigen atribucion**
-- (CC BY / CC BY-SA); las otras 5 son CC0 o dominio publico. La atribucion no
-- es opcional: vive en `src/content/image-credits.ts` y se publica en
-- `/creditos`. `src/lib/image-credits.contract.test.ts` comprueba que cada foto
-- tenga entrada y que ninguna licencia que exija atribucion quede sin autor ni
-- enlace.
--
-- Son fotos del **tipo** de alimento, no del SKU exacto: unas papas curly, no
-- «Papa Curly Savory caja 13.61 kg». Se dice en `/creditos`.
--
-- Idempotente: re-ejecutarla deja el mismo estado. La guarda exige el vinculo
-- con `ab-foods`, asi que no puede tocar un producto homonimo de otro
-- proveedor.
-- ============================================================

DO $$
DECLARE
  v_filas int;
BEGIN
  CREATE TEMP TABLE _ab_fotos (slug text PRIMARY KEY, image_url text NOT NULL) ON COMMIT DROP;

  INSERT INTO _ab_fotos (slug, image_url) VALUES
    ('aguacate-chunky-caja-7264kg', '/images/products/ab-foods/aguacate-chunky-caja-7264kg-foto.webp'),
    ('camaron-4150', '/images/products/ab-foods/camaron-4150-foto.webp'),
    ('camaron-cocido-100200', '/images/products/ab-foods/camaron-cocido-100200-foto.webp'),
    ('camaron-cocido-4150', '/images/products/ab-foods/camaron-cocido-4150-foto.webp'),
    ('cordon-bleu-mini', '/images/products/ab-foods/cordon-bleu-mini-foto.webp'),
    ('dedos-queso-bolsa-181kg', '/images/products/ab-foods/dedos-queso-bolsa-181kg-foto.webp'),
    ('hamburguesa-bm-arrachera-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-arrachera-caja-30pzs-foto.webp'),
    ('hamburguesa-bm-mezquite-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-mezquite-caja-30pzs-foto.webp'),
    ('hamburguesa-bm-sirloin-caja-30pzs', '/images/products/ab-foods/hamburguesa-bm-sirloin-caja-30pzs-foto.webp'),
    ('hamburguesa-empanizada-pilgrims', '/images/products/ab-foods/hamburguesa-empanizada-pilgrims-foto.webp'),
    ('papa-conquest-delivery-teja-65-caja-1361kg', '/images/products/ab-foods/papa-conquest-delivery-teja-65-caja-1361kg-foto.webp'),
    ('papa-curly-savory-caja-1361kg', '/images/products/ab-foods/papa-curly-savory-caja-1361kg-foto.webp'),
    ('papa-dulce-recta-38-caja-680kg', '/images/products/ab-foods/papa-dulce-recta-38-caja-680kg-foto.webp'),
    ('papa-gajo-10-cut-65-caja-1361kg', '/images/products/ab-foods/papa-gajo-10-cut-65-caja-1361kg-foto.webp'),
    ('papa-hash-brown-patty-caja-952kg', '/images/products/ab-foods/papa-hash-brown-patty-caja-952kg-foto.webp'),
    ('papa-ondulada-38-payette-caja-1361kg', '/images/products/ab-foods/papa-ondulada-38-payette-caja-1361kg-foto.webp'),
    ('papa-rallada-hash-brown-caja-816kg', '/images/products/ab-foods/papa-rallada-hash-brown-caja-816kg-foto.webp'),
    ('papa-rejilla-savory-caja-1224kg', '/images/products/ab-foods/papa-rejilla-savory-caja-1224kg-foto.webp'),
    ('queso-crema-krol-barra-136kg', '/images/products/ab-foods/queso-crema-krol-barra-136kg-foto.webp'),
    ('queso-crema-reny-picot-136kg', '/images/products/ab-foods/queso-crema-reny-picot-136kg-foto.webp'),
    ('queso-crema-reny-picot-caja-8kg', '/images/products/ab-foods/queso-crema-reny-picot-caja-8kg-foto.webp'),
    ('tender-empanizado-pilgrims', '/images/products/ab-foods/tender-empanizado-pilgrims-foto.webp')
  ;

  UPDATE products p
  SET image_url  = f.image_url,
      images     = jsonb_build_array(f.image_url),
      updated_at = now()
  FROM _ab_fotos f
  WHERE p.slug = f.slug
    AND EXISTS (
      SELECT 1
      FROM product_suppliers ps
      JOIN suppliers s ON s.id = ps.supplier_id
      WHERE ps.product_id = p.id AND s.slug = 'ab-foods'
    );

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> 22 THEN
    RAISE WARNING '00194: se esperaban 22 fotos y se aplicaron %.', v_filas;
  ELSE
    RAISE NOTICE '00194: 22 fotos reales aplicadas a los articulos de AB Foods.';
  END IF;
END $$;
