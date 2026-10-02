-- ============================================================
-- 00210 — Cuatro ajustes de imagen pedidos por el usuario.
--
-- QUE CAMBIA
-- ----------
-- 1. cordon-bleu-mini: la última foto Wikimedia (CC BY-SA) se reemplaza por
--    una imagen generada en casa (/images/products/ai/). Con esto el
--    registro de atribuciones (src/content/image-credits.ts) queda vacío y
--    /creditos pasa a explicar la política en vez de listar autores.
-- 2. perejil: la imagen SECUNDARIA (montón de perejil fresco,
--    cmilw6kb5000204l8hoc09tg9) pasa a ser la PRINCIPAL; el manojo atado
--    (cmilw6t51000104jq0du3blee) queda como secundaria. Solo se reordenan:
--    son URLs de Take.app ya servidas, no hay problema de cache immutable.
-- 3. sandia y 4. toronja: su foto de Take.app se cambia por imágenes
--    generadas acordes al estilo del catálogo (producto real: sandía entera
--    con trozo, toronja entera y mitad).
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

BEGIN;

UPDATE public.products
SET image_url  = '/images/products/ai/cordon-bleu-mini.webp',
    images     = jsonb_build_array('/images/products/ai/cordon-bleu-mini.webp'),
    updated_at = now()
WHERE slug = 'cordon-bleu-mini';

UPDATE public.products
SET image_url  = 'https://storage.googleapis.com/takeapp/media/cmilw6kb5000204l8hoc09tg9.png',
    images     = jsonb_build_array(
                   'https://storage.googleapis.com/takeapp/media/cmilw6kb5000204l8hoc09tg9.png',
                   'https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png'
                 ),
    updated_at = now()
WHERE slug = 'perejil';

UPDATE public.products
SET image_url  = '/images/products/ai/sandia.webp',
    images     = jsonb_build_array('/images/products/ai/sandia.webp'),
    updated_at = now()
WHERE slug = 'sandia';

UPDATE public.products
SET image_url  = '/images/products/ai/toronja.webp',
    images     = jsonb_build_array('/images/products/ai/toronja.webp'),
    updated_at = now()
WHERE slug = 'toronja';

DO $$
DECLARE
  v int;
BEGIN
  SELECT count(*) INTO v
  FROM public.products
  WHERE slug IN ('cordon-bleu-mini', 'sandia', 'toronja')
    AND image_url LIKE '/images/products/ai/%.webp';
  IF v <> 3 THEN
    RAISE WARNING '00210: se esperaban 3 productos con imagen IA y hay %.', v;
  ELSE
    RAISE NOTICE '00210: cordon bleu, sandía y toronja con imagen nueva; perejil reordenado.';
  END IF;
END $$;

COMMIT;
