-- ============================================================
-- 00216 — Imágenes e infografías de los productos NO publicados (28).
--
-- QUE HACE
-- --------
-- Los 28 productos ocultos quedan con ficha completa lista para activarse
-- desde /admin/productos (siguen ocultos; esto NO los publica):
--
-- 1. Los 22 ocultos por regla de precios (00202) tenían fotos viejas de
--    Take.app o compartidas; su `image_url` se reapunta a la imagen de
--    catálogo generada en /images/products/ai/<slug>.webp.
-- 2. Los 28 (los 22 + chuleta cero/siete/lomo, mascotas y corazón de
--    puerco de Weber) reciben su infografía nutrimental como segunda
--    imagen, mismo patrón que 00215.
-- 3. corazon-puerco se queda SIN foto principal: OpenAI rechazó
--    persistentemente generar órganos (probados 4 prompts); su ficha
--    muestra la infografía sobre fondo verde.
--
-- Idempotente: fija image_url e images a su valor final.
-- ============================================================

BEGIN;

DO $$
BEGIN
  CREATE TEMP TABLE _ocultos22 (slug text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _ocultos22 (slug) VALUES
    ('chile-chiltepin'),
    ('ciruelo-rojo'),
    ('ciruelo-negro'),
    ('durazno'),
    ('nuez-de-castilla'),
    ('chile-cascabel'),
    ('jitomate-bola'),
    ('camote-amarillo'),
    ('uvas-rojas'),
    ('uvas-verdes'),
    ('mandarina'),
    ('pina-miel'),
    ('pera'),
    ('chile-serrano'),
    ('guayaba'),
    ('manzana-roja'),
    ('apio'),
    ('jitomate-saladet'),
    ('cebolla-blanca'),
    ('nopal'),
    ('germinado-de-soya'),
    ('pimiento-morron');

  CREATE TEMP TABLE _ocultos (slug text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _ocultos (slug) VALUES
    ('chile-chiltepin'),
    ('ciruelo-rojo'),
    ('ciruelo-negro'),
    ('durazno'),
    ('nuez-de-castilla'),
    ('chile-cascabel'),
    ('jitomate-bola'),
    ('camote-amarillo'),
    ('uvas-rojas'),
    ('uvas-verdes'),
    ('mandarina'),
    ('pina-miel'),
    ('pera'),
    ('chile-serrano'),
    ('guayaba'),
    ('manzana-roja'),
    ('apio'),
    ('jitomate-saladet'),
    ('cebolla-blanca'),
    ('nopal'),
    ('germinado-de-soya'),
    ('pimiento-morron'),
    ('chuleta-cero'),
    ('chuleta-siete'),
    ('chuleta-lomo'),
    ('alimento-perro-bolsa-2kg'),
    ('premio-hueso-porky'),
    ('corazon-puerco');

  -- 1) Los 22 de 00202 a su imagen de catálogo AI.
  UPDATE public.products p
  SET image_url = '/images/products/ai/' || p.slug || '.webp',
      updated_at = now()
  FROM _ocultos22 o
  WHERE p.slug = o.slug;

  -- 2) Infografía como 2ª imagen en los 28 (corazón: solo infografía).
  UPDATE public.products p
  SET images = CASE
        WHEN p.slug = 'corazon-puerco'
          THEN jsonb_build_array('/images/products/infografia/' || p.slug || '.webp')
        ELSE jsonb_build_array(
               p.image_url,
               '/images/products/infografia/' || p.slug || '.webp'
             )
      END,
      updated_at = now()
  FROM _ocultos o
  WHERE p.slug = o.slug;

  RAISE NOTICE '00216: 22 ocultos con imagen AI nueva; 28 con infografía (siguen ocultos).';
END $$;

COMMIT;
