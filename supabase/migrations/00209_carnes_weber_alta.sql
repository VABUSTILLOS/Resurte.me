-- ============================================================
-- 00209 — Carnes Weber: alta del proveedor (Chihuahua) y su catálogo.
--
-- QUE HACE
-- --------
-- Da de alta el proveedor `carnes-weber` y 92 productos nuevos,
-- más 18 vínculos a productos que YA existen (AB
-- Foods / tienda): en esos NO se duplica el producto, solo se agrega Weber
-- como proveedor alterno y compite por `is_primary` (menor costo/kg = más
-- margen). En la tienda NO aparece la marca: el nombre y la descripción no
-- dicen "Weber"; el proveedor solo se ve en el panel admin.
--
-- CIUDAD
-- ------
-- Los productos nuevos nacen con `product_city_availability`:
-- is_available = true SOLO en Chihuahua (city_id 16) y false en el resto,
-- así no se publican fuera de su plaza (semántica de 00065). Los traslapes
-- conservan sus filas actuales; solo se agrega la de Chihuahua si falta.
--
-- PRECIOS
-- -------
-- Mismas reglas de 00202 (docs/precios-reglas.md):
--   A) precio >= costo        B) precio <= competencia (Alsuper branch 6)
--   precio = LEAST(CEIL(costo_kg*kg*1.20), cap_kg*kg); cap<costo -> OCULTAR.
-- Costo = mejor volumen de la lista (tarima/+100kg/+3 cajas), list_date
-- 2026-10-01. Margen Weber: 1.20 (como FRUGASA; AB Foods sigue en 1.18).
--
-- SE QUEDAN FUERA A PROPÓSITO
--   * "Ruedo tripas" (renglón ilegible: solo 2 columnas de precio).
--   * Los que chocan A vs B entran OCULTOS (se activan desde /admin/productos
--     cuando cambie el costo o el precio del rival).
--
-- Idempotente: NOT EXISTS / ON CONFLICT en todo; re-ejecutar no cambia nada.
-- ============================================================

BEGIN;

INSERT INTO public.suppliers (name, slug, status, city, state, notes)
VALUES (
  'Carnes Weber', 'carnes-weber', 'activo', 'Chihuahua', 'Chihuahua',
  'Lista de precios mayoreo vigente al 01-oct-2026 (carnesweber.com). '
  || 'Carnes de res, cerdo, pollo, pescado y camarón. Costos por kilo al '
  || 'mejor volumen (tarima/+100kg/+3 cajas). La marca no se muestra en tienda.'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      notes = EXCLUDED.notes,
      updated_at = now();

DO $$
DECLARE
  v_supplier bigint;
  v_altas int;
  v_links int;
  v_topes int;
  v_ciudades int;
  v_ocultos int;
  v_precios int;
  v_bajo_costo int;
  v_mas_caros int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'carnes-weber';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00209: no se pudo dar de alta el proveedor carnes-weber';
  END IF;

  -- ── Productos NUEVOS (no traslapes) ──────────────────────────────────
  CREATE TEMP TABLE _weber_alta (
    slug        text PRIMARY KEY,
    name        text NOT NULL,
    description text NOT NULL,
    image_url   text,
    category_id bigint NOT NULL,
    unit        text NOT NULL,
    kg          numeric(12,4) NOT NULL,
    cost        numeric(12,2) NOT NULL,
    hidden      boolean NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_alta
    (slug, name, description, image_url, category_id, unit, kg, cost, hidden)
  VALUES
    ('muslo-bate', 'Muslo bate de pollo', 'Muslo de pollo corte bate (sin muslo ni pierna separados), fresco. Precio por kilo.', '/images/products/ai/muslo-bate.webp', 4, 'kilo', 1, 28.90, false),
    ('pechuga-media-mariposa', 'Pechuga de pollo media mariposa', 'Media pechuga de pollo sin hueso, corte mariposa. Precio por kilo.', '/images/products/ai/pechuga-media-mariposa.webp', 4, 'kilo', 1, 57.90, false),
    ('nuggets-enchiladas-caja-10kg', 'Nuggets enchilados (caja 10 kg)', 'Nuggets de pollo empanizados con toque picante. Caja de 10 kg.', '/images/products/ai/nuggets-enchiladas-caja-10kg.webp', 4, 'caja', 10, 59.90, false),
    ('pollo-empanizado-kfc-caja-1361kg', 'Pollo empanizado tipo KFC (caja 13.61 kg)', 'Piezas de pollo empanizadas estilo Kentucky, congeladas. Caja de 13.61 kg.', '/images/products/ai/pollo-empanizado-kfc-caja-1361kg.webp', 4, 'caja', 13.61, 75.90, false),
    ('papa-lisa-caja', 'Papa lisa para freír (caja)', 'Papa prefría corte liso, congelada. Caja.', '/images/products/ai/papa-lisa-caja.webp', 9, 'caja', 15, 35.90, false),
    ('deditos-papa-caja-10kg', 'Deditos de papa (caja 10 kg)', 'Deditos de papa prefríos, congelados. Caja de 10 kg.', '/images/products/ai/deditos-papa-caja-10kg.webp', 9, 'caja', 10, 61.90, false),
    ('camaron-1620-gigante', 'Camarón gigante 16/20', 'Camarón gigante crudo talla 16/20. Precio por kilo.', '/images/products/ai/camaron-1620-gigante.webp', 4, 'kilo', 1, 187.90, false),
    ('pork-belly-premium-tif', 'Pork belly premium TIF', 'Panceta de cerdo premium TIF, para hornear o asar. Precio por kilo.', '/images/products/ai/pork-belly-premium-tif.webp', 4, 'kilo', 1, 104.90, false),
    ('pork-belly-seabord', 'Pork belly Seabord', 'Panceta de cerdo importada Seabord. Precio por kilo.', '/images/products/ai/pork-belly-seabord.webp', 4, 'kilo', 1, 123.90, false),
    ('chorizo-grapa', 'Chorizo grapa', 'Chorizo de cerdo en grapa, para asar o guisar. Precio por kilo.', '/images/products/ai/chorizo-grapa.webp', 4, 'kilo', 1, 6.00, false),
    ('cuero-puerco', 'Cuero de puerco', 'Cuero de cerdo para chicharrón o guisos. Precio por kilo.', '/images/products/ai/cuero-puerco.webp', 4, 'kilo', 1, 30.90, false),
    ('chamorro-puerco', 'Chamorro de puerco', 'Chamorro de cerdo con hueso, para birria y caldos. Precio por kilo.', '/images/products/ai/chamorro-puerco.webp', 4, 'kilo', 1, 42.90, false),
    ('codillo', 'Codillo de puerco', 'Codillo de cerdo, para hornear o cocer. Precio por kilo.', '/images/products/ai/codillo.webp', 4, 'kilo', 1, 50.90, false),
    ('costilla-back-rib-tira-corta', 'Costilla back rib tira corta', 'Costilla de cerdo back rib en tira larga cortada. Precio por kilo.', '/images/products/ai/costilla-back-rib-tira-corta.webp', 4, 'kilo', 1, 89.90, false),
    ('costilla-puerco-cargada', 'Costilla de puerco cargada', 'Costilla de cerdo cargada de carne. Precio por kilo.', '/images/products/ai/costilla-puerco-cargada.webp', 4, 'kilo', 1, 112.90, false),
    ('costilla-puerco-cargada-cortada', 'Costilla de puerco cargada cortada', 'Costilla de cerdo cargada, cortada lista para guisar. Precio por kilo.', '/images/products/ai/costilla-puerco-cargada-cortada.webp', 4, 'kilo', 1, 125.90, false),
    ('espinazo', 'Espinazo de puerco', 'Espinazo de cerdo para caldos y guisos. Precio por kilo.', '/images/products/ai/espinazo.webp', 4, 'kilo', 1, 29.90, false),
    ('espinazo-cargado', 'Espinazo cargado', 'Espinazo de cerdo con más carne. Precio por kilo.', '/images/products/ai/espinazo-cargado.webp', 4, 'kilo', 1, 30.90, false),
    ('corazon-puerco', 'Corazón de puerco', 'Corazón de cerdo, para guisos y menudería. Precio por kilo.', NULL, 4, 'kilo', 1, 38.90, true),
    ('lomo-ahumado-chimex', 'Lomo ahumado Chimex', 'Lomo de cerdo ahumado, listo para rebanar. Precio por kilo.', '/images/products/ai/lomo-ahumado-chimex.webp', 4, 'kilo', 1, 79.90, false),
    ('lomo-ahumado-cortado', 'Lomo ahumado cortado', 'Lomo de cerdo ahumado, cortado en piezas. Precio por kilo.', '/images/products/ai/lomo-ahumado-cortado.webp', 4, 'kilo', 1, 95.90, false),
    ('lomo-ahumado-cubicado-1kg', 'Lomo ahumado cubicado 1 kg', 'Lomo ahumado en cubos, bolsa de 1 kg.', '/images/products/ai/lomo-ahumado-cubicado-1kg.webp', 4, 'kilo', 1, 77.90, false),
    ('lomo-natural-puerco', 'Lomo natural de puerco', 'Lomo de cerdo natural, sin adobo. Precio por kilo.', '/images/products/ai/lomo-natural-puerco.webp', 4, 'kilo', 1, 65.90, false),
    ('lomo-natural-cortado', 'Lomo natural cortado', 'Lomo de cerdo natural en piezas. Precio por kilo.', '/images/products/ai/lomo-natural-cortado.webp', 4, 'kilo', 1, 79.90, false),
    ('manitas-puerco', 'Manitas de puerco', 'Manitas de cerdo para cocido y vinagre. Precio por kilo.', '/images/products/ai/manitas-puerco.webp', 4, 'kilo', 1, 36.90, false),
    ('manteca-puerco', 'Manteca de puerco', 'Manteca de cerdo refinada, para cocinar. Precio por kilo.', '/images/products/ai/manteca-puerco.webp', 2, 'kilo', 1, 35.90, false),
    ('morcon', 'Morcón', 'Morcón de cerdo, embutido para guisos. Precio por kilo.', '/images/products/ai/morcon.webp', 4, 'kilo', 1, 72.90, false),
    ('tocino-cubicado-1kg', 'Tocino cubicado 1 kg', 'Tocino de cerdo en cubos de 0.5x0.5, bolsa de 1 kg.', '/images/products/ai/tocino-cubicado-1kg.webp', 4, 'kilo', 1, 75.90, false),
    ('tocino-rebanado', 'Tocino rebanado', 'Tocino de cerdo en rebanadas. Precio por kilo.', '/images/products/ai/tocino-rebanado.webp', 4, 'kilo', 1, 126.90, false),
    ('tripa-puerco', 'Tripa de puerco', 'Tripa de cerdo limpia, para guisos. Precio por kilo.', '/images/products/ai/tripa-puerco.webp', 4, 'kilo', 1, 39.90, false),
    ('chicharron-pella', 'Chicharrón pella', 'Chicharrón de cerdo con pella, botana y guisos. Precio por kilo.', '/images/products/ai/chicharron-pella.webp', 4, 'kilo', 1, 123.90, false),
    ('chicharron-prensado', 'Chicharrón prensado', 'Chicharrón prensado de cerdo, para guisos y salsas. Precio por kilo.', '/images/products/ai/chicharron-prensado.webp', 4, 'kilo', 1, 159.90, false),
    ('pierna-puerco-natural', 'Pierna de puerco natural', 'Pulpa de pierna de cerdo natural. Precio por kilo.', '/images/products/ai/pierna-puerco-natural.webp', 4, 'kilo', 1, 62.90, false),
    ('pierna-puerco-natural-cortada', 'Pierna de puerco natural cortada', 'Pulpa de pierna de cerdo natural, cortada. Precio por kilo.', '/images/products/ai/pierna-puerco-natural-cortada.webp', 4, 'kilo', 1, 66.90, false),
    ('pierna-puerco-cubicada', 'Pierna de puerco natural cubicada', 'Pulpa de pierna de cerdo en cubos, para guisos. Precio por kilo.', '/images/products/ai/pierna-puerco-cubicada.webp', 4, 'kilo', 1, 72.90, false),
    ('carne-molida-90-10', 'Carne molida 90/10', 'Carne molida de res 90/10, extra magra. Precio por kilo.', '/images/products/ai/carne-molida-90-10.webp', 4, 'kilo', 1, 115.90, false),
    ('carne-molida-pulpa-natural', 'Carne molida de pulpa natural', 'Carne molida de pulpa natural de res. Precio por kilo.', '/images/products/ai/carne-molida-pulpa-natural.webp', 4, 'kilo', 1, 126.90, false),
    ('carne-molida-pulpa-extralimp', 'Carne molida de pulpa natural extralimpia', 'Carne molida de pulpa natural extra limpia. Precio por kilo.', '/images/products/ai/carne-molida-pulpa-extralimp.webp', 4, 'kilo', 1, 135.90, false),
    ('pescuezo-res-deshuesado', 'Pescuezo de res deshuesado', 'Pescuezo de res deshuesado, para barbacoa y birria. Precio por kilo.', '/images/products/ai/pescuezo-res-deshuesado.webp', 4, 'kilo', 1, 135.90, false),
    ('carne-molida-economica', 'Carne molida económica', 'Carne molida de res económica, para guisos de volumen. Precio por kilo.', '/images/products/ai/carne-molida-economica.webp', 4, 'kilo', 1, 93.90, false),
    ('carne-molida-especial', 'Carne molida especial', 'Carne molida de res especial, para hamburguesas y guisos. Precio por kilo.', '/images/products/ai/carne-molida-especial.webp', 4, 'kilo', 1, 123.90, false),
    ('carne-molida-de-pulpa', 'Carne molida de pulpa', 'Carne molida 100% pulpa de res. Precio por kilo.', '/images/products/ai/carne-molida-de-pulpa.webp', 4, 'kilo', 1, 136.90, false),
    ('pulpa-bola', 'Pulpa bola', 'Pulpa bola de res, para asar, milanesa o guisos. Precio por kilo.', '/images/products/ai/pulpa-bola.webp', 4, 'kilo', 1, 146.90, false),
    ('pulpa-negra', 'Pulpa negra', 'Pulpa negra de res, corte suave para asar. Precio por kilo.', '/images/products/ai/pulpa-negra.webp', 4, 'kilo', 1, 146.90, false),
    ('pulpa-alto-vacio', 'Pulpas alto vacío (bola o negra)', 'Pulpa de res al alto vacío, bola o negra. Precio por kilo.', '/images/products/ai/pulpa-alto-vacio.webp', 4, 'kilo', 1, 172.90, false),
    ('pulpa-bola-negra-natural', 'Pulpa bola o negra natural', 'Pulpa de res natural, bola o negra. Precio por kilo.', '/images/products/ai/pulpa-bola-negra-natural.webp', 4, 'kilo', 1, 161.90, false),
    ('pulpa-sirloin-cubicada-1x1', 'Pulpa de sirloin cubicada 1x1', 'Pulpa de sirloin de res en cubos de 1x1, para brochetas y guisos. Precio por kilo.', '/images/products/ai/pulpa-sirloin-cubicada-1x1.webp', 4, 'kilo', 1, 165.90, false),
    ('pulpa-milanesa', 'Pulpa milanesa', 'Pulpa de res en corte milanesa, delgada para empanizar. Precio por kilo.', '/images/products/ai/pulpa-milanesa.webp', 4, 'kilo', 1, 188.90, false),
    ('cabeza-res-deshuesada', 'Cabeza de res deshuesada', 'Cabeza de res deshuesada, para barbacoa. Precio por kilo.', '/images/products/ai/cabeza-res-deshuesada.webp', 4, 'kilo', 1, 80.90, false),
    ('cachete-res', 'Cachete de res', 'Cachete de res, para barbacoa y birria. Precio por kilo.', '/images/products/ai/cachete-res.webp', 4, 'kilo', 1, 128.90, false),
    ('pescuezo-res-con-hueso', 'Pescuezo de res con hueso', 'Pescuezo de res con hueso, para caldos. Precio por kilo.', '/images/products/ai/pescuezo-res-con-hueso.webp', 4, 'kilo', 1, 136.90, false),
    ('labio-res', 'Labio de res', 'Labio de res para barbacoa y tacos. Precio por kilo.', '/images/products/ai/labio-res.webp', 4, 'kilo', 1, 172.90, false),
    ('pozole-dona-conchita-10pzs', 'Pozole Doña Conchita (10 pzs)', 'Pozole preparado Doña Conchita, paquete de 10 piezas.', '/images/products/ai/pozole-dona-conchita-10pzs.webp', 4, 'paquete', 2.5, 17.90, false),
    ('menudo-mexicano', 'Menudo mexicano', 'Menudo de res estilo mexicano, limpio. Precio por kilo.', '/images/products/ai/menudo-mexicano.webp', 4, 'kilo', 1, 64.90, false),
    ('menudo-mexicano-cortado', 'Menudo mexicano cortado', 'Menudo de res mexicano, cortado listo para cocer. Precio por kilo.', '/images/products/ai/menudo-mexicano-cortado.webp', 4, 'kilo', 1, 64.90, false),
    ('menudo-americano', 'Menudo americano', 'Menudo de res estilo americano. Precio por kilo.', '/images/products/ai/menudo-americano.webp', 4, 'kilo', 1, 89.90, false),
    ('menudo-americano-cortado', 'Menudo americano cortado', 'Menudo americano cortado, listo para cocer. Precio por kilo.', '/images/products/ai/menudo-americano-cortado.webp', 4, 'kilo', 1, 94.90, false),
    ('pata-res', 'Pata de res', 'Pata de res para menudo y caldos. Precio por kilo.', '/images/products/ai/pata-res.webp', 4, 'kilo', 1, 60.00, false),
    ('zancarron', 'Zancarrón', 'Zancarrón de res con hueso, para caldos. Precio por kilo.', '/images/products/ai/zancarron.webp', 4, 'kilo', 1, 49.00, false),
    ('hueso-menudo', 'Hueso para menudo', 'Hueso de res para menudo y caldos. Precio por kilo.', '/images/products/ai/hueso-menudo.webp', 4, 'kilo', 1, 23.90, false),
    ('tripa-res-americana-1361', 'Tripa de res americana (13.61)', 'Tripa de res americana, limpia. Caja de 13.61 kg.', '/images/products/ai/tripa-res-americana-1361.webp', 4, 'caja', 13.61, 63.90, false),
    ('alimento-perro-bolsa-2kg', 'Alimento para perro (bolsa 2 kg)', 'Alimento seco para perro, bolsa de 2 kg.', '/images/products/ai/alimento-perro-bolsa-2kg.webp', 2, 'bolsa', 2, 17.90, true),
    ('premio-hueso-porky', 'Premio hueso porky', 'Premio para perro sabor cerdo, hueso masticable.', '/images/products/ai/premio-hueso-porky.webp', 2, 'pieza', 0.25, 17.90, true),
    ('costilla-tracera-engorda', 'Costilla tracera (engorda)', 'Costilla tracera de res para engorda. Precio por kilo.', '/images/products/ai/costilla-tracera-engorda.webp', 4, 'kilo', 1, 103.90, false),
    ('costilla-cargada-prime', 'Costilla cargada prime', 'Costilla cargada de res calidad prime. Precio por kilo.', '/images/products/ai/costilla-cargada-prime.webp', 4, 'kilo', 1, 159.90, false),
    ('paleta-engorda', 'Paleta (engorda)', 'Paleta de res para engorda, para deshebrar. Precio por kilo.', '/images/products/ai/paleta-engorda.webp', 4, 'kilo', 1, 127.90, false),
    ('aguja-engorda', 'Aguja (engorda)', 'Aguja de res para engorda, para guisos. Precio por kilo.', '/images/products/ai/aguja-engorda.webp', 4, 'kilo', 1, 141.90, false),
    ('diezmillo-c-h-engorda', 'Diezmillo c/h (engorda)', 'Diezmillo de res con hueso, para engorda. Precio por kilo.', '/images/products/ai/diezmillo-c-h-engorda.webp', 4, 'kilo', 1, 141.90, false),
    ('lomo-engorda-premium', 'Lomo engorda premium', 'Lomo de res premium para engorda. Precio por kilo.', '/images/products/ai/lomo-engorda-premium.webp', 4, 'kilo', 1, 165.90, false),
    ('t-bone-engorda', 'T-bone (engorda)', 'T-bone de res para engorda. Precio por kilo.', '/images/products/ai/t-bone-engorda.webp', 4, 'kilo', 1, 174.90, false),
    ('costilla-tracera-chuleta', 'Costilla tracera (chuletas)', 'Costilla tracera de res. Precio por kilo.', '/images/products/ai/costilla-tracera-chuleta.webp', 4, 'kilo', 1, 108.90, false),
    ('costilla-cargada-delantera', 'Costilla cargada delantera', 'Costilla cargada delantera de res. Precio por kilo.', '/images/products/ai/costilla-cargada-delantera.webp', 4, 'kilo', 1, 171.90, false),
    ('chuleta-cero', 'Chuleta cero', 'Chuleta de cerdo cero, para asar. Precio por kilo.', '/images/products/ai/chuleta-cero.webp', 4, 'kilo', 1, 130.90, true),
    ('chuleta-siete', 'Chuleta siete', 'Chuleta de cerdo siete, con hueso. Precio por kilo.', '/images/products/ai/chuleta-siete.webp', 4, 'kilo', 1, 143.25, true),
    ('diezmillo-c-h-chuleta', 'Diezmillo c/h', 'Diezmillo de res con hueso. Precio por kilo.', '/images/products/ai/diezmillo-c-h-chuleta.webp', 4, 'kilo', 1, 143.90, false),
    ('chuleta-lomo', 'Chuleta lomo', 'Chuleta de lomo de cerdo. Precio por kilo.', '/images/products/ai/chuleta-lomo.webp', 4, 'kilo', 1, 177.97, true),
    ('t-bone-engorda-premium', 'T-bone engorda premium', 'T-bone de res premium para engorda. Precio por kilo.', '/images/products/ai/t-bone-engorda-premium.webp', 4, 'kilo', 1, 173.00, false),
    ('porter-house', 'Porter house', 'Corte porter house de res, para parrilla. Precio por kilo.', '/images/products/ai/porter-house.webp', 4, 'kilo', 1, 195.90, false),
    ('tomahawk', 'Tomahawk', 'Tomahawk de res con hueso largo, para parrilla. Precio por kilo.', '/images/products/ai/tomahawk.webp', 4, 'kilo', 1, 195.90, false),
    ('rib-eye', 'Rib eye', 'Rib eye de res, para parrilla. Precio por kilo.', '/images/products/ai/rib-eye.webp', 4, 'kilo', 1, 269.90, false),
    ('tuetano-hueso-cortar', 'Tuétano hueso para cortar', 'Hueso de res con tuétano, para cortar. Precio por kilo.', '/images/products/ai/tuetano-hueso-cortar.webp', 4, 'kilo', 1, 44.90, false),
    ('tuetano-hueso-canoa', 'Tuétano hueso canoa', 'Hueso canoa de res con tuétano, para asar. Precio por kilo.', '/images/products/ai/tuetano-hueso-canoa.webp', 4, 'kilo', 1, 53.90, false),
    ('chamberete', 'Chamberete', 'Chamberete de res, para cocido y deshebrar. Precio por kilo.', '/images/products/ai/chamberete.webp', 4, 'kilo', 1, 110.90, false),
    ('chamberete-cortado', 'Chamberete cortado', 'Chamberete de res cortado, para guisos. Precio por kilo.', '/images/products/ai/chamberete-cortado.webp', 4, 'kilo', 1, 129.90, false),
    ('cicido-rabo', 'Cocido de rabo', 'Rabo de res para cocido. Precio por kilo.', '/images/products/ai/cicido-rabo.webp', 4, 'kilo', 1, 102.90, false),
    ('desebrada-aldilla', 'Deshebrada aldilla', 'Carne de res aldilla para deshebrar. Precio por kilo.', '/images/products/ai/desebrada-aldilla.webp', 4, 'kilo', 1, 169.90, false),
    ('suadero', 'Suadero', 'Suadero de res, para tacos. Precio por kilo.', '/images/products/ai/suadero.webp', 4, 'kilo', 1, 147.90, false),
    ('brisket-deshuesado', 'Brisket deshuesado', 'Brisket de res deshuesado, para ahumar. Precio por kilo.', '/images/products/ai/brisket-deshuesado.webp', 4, 'kilo', 1, 158.90, false),
    ('cocido-pecho-c-h', 'Cocido de pecho c/h', 'Pecho de res con hueso, para cocido. Precio por kilo.', '/images/products/ai/cocido-pecho-c-h.webp', 4, 'kilo', 1, 98.90, false),
    ('carne-hamburguesa-sirloin-900g', 'Carne para hamburguesa sirloin (900 g)', 'Carne para hamburguesa de sirloin, paquete de 900 g.', '/images/products/ai/carne-hamburguesa-sirloin-900g.webp', 4, 'paquete', 0.9, 118.90, false),
    ('carne-hamburguesa-arrachera-900g', 'Carne para hamburguesa arrachera (900 g)', 'Carne para hamburguesa de arrachera, paquete de 900 g.', '/images/products/ai/carne-hamburguesa-arrachera-900g.webp', 4, 'paquete', 0.9, 118.90, false),
    ('carne-hamburguesa-san-francisco-12kg', 'Carne para hamburguesa San Francisco (1.2 kg)', 'Carne para hamburguesa San Francisco, paquete de 1.2 kg.', '/images/products/ai/carne-hamburguesa-san-francisco-12kg.webp', 4, 'paquete', 1.2, 91.90, false);

  INSERT INTO public.products (
    name, slug, description, image_url, images, brand, category_id,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags
  )
  SELECT
    a.name, a.slug, a.description, a.image_url,
    CASE WHEN a.image_url IS NULL THEN NULL ELSE jsonb_build_array(a.image_url) END,
    'Local', a.category_id,
    -- Precio provisional = costo*margen; abajo se recalcula con el tope.
    CEIL(a.cost * 1.20), NULL, 'in_stock', NOT a.hidden, false,
    a.unit, '[]'::jsonb
  FROM _weber_alta a
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_altas = ROW_COUNT;

  -- ── Vínculos proveedor (nuevos + traslapes) ──────────────────────────
  CREATE TEMP TABLE _weber_link (
    slug         text NOT NULL,
    supplier_sku text NOT NULL,
    item_name    text NOT NULL,
    kg           numeric(12,4) NOT NULL,
    cost         numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_link (slug, supplier_sku, item_name, kg, cost) VALUES
    ('ala-adobada-bolsa-5kg', 'ALITA_ADOBADA_IQF_CAJA_1', 'Alita adobada IQF (caja 12 kg)', 12, 55.90),
    ('ala-iqf-pilgrims-caja-12kg', 'ALITA_NATURAL_IQF_CAJA_1', 'Alita natural IQF (caja 12 kg)', 12, 71.90),
    ('muslo-bate', 'MUSLO_BATE', 'Muslo bate de pollo', 1, 28.90),
    ('pechuga-media-mariposa', 'PECHUGA_MEDIA_MARIPOSA', 'Pechuga de pollo media mariposa', 1, 57.90),
    ('pechuga-sin-hueso-br', 'PECHUGA_CHICA_BRAZILENA', 'Pechuga chica brasileña', 1, 76.90),
    ('nugget-pechuga-pilgrims', 'NUGGETS_POLLO_CAJA_10KG', 'Nuggets de pollo (caja 10 kg)', 10, 49.90),
    ('nuggets-enchiladas-caja-10kg', 'NUGGETS_ENCHILADAS_CAJA_', 'Nuggets enchilados (caja 10 kg)', 10, 59.90),
    ('boneless-pechuga-pilgrims', 'BONEL_AMERICANO', 'Boneless americano', 1, 73.90),
    ('boneless-natural-freskecito', 'BONEL_FRESKESITO', 'Boneless freskesito', 1, 118.90),
    ('tender-empanizado-pilgrims', 'TENDER_COCIDO', 'Tender cocido', 1, 74.90),
    ('pechuga-picante-emp-pilgrims', 'PECHUGA_EMPANIZADA', 'Pechuga empanizada', 1, 75.90),
    ('pollo-empanizado-kfc-caja-1361kg', 'POLLO_EMPANIZADO_KFC_CAJ', 'Pollo empanizado tipo KFC (caja 13.61 kg)', 13.61, 75.90),
    ('papa-lisa-caja', 'PAPA_LISA_CAJA', 'Papa lisa para freír (caja)', 15, 35.90),
    ('papa-ondulada-38-payette-caja-1361kg', 'PAPA_ONDULADA_CAJA', 'Papa ondulada para freír (caja)', 15, 36.90),
    ('papa-gajo-10-cut-65-caja-1361kg', 'PAPA_GAJO_CAJA', 'Papa gajo para freír (caja)', 15, 48.90),
    ('papa-rallada-hash-brown-caja-816kg', 'PAPA_HASHBROWN_USA', 'Papa hash brown USA', 1, 59.90),
    ('aros-cebolla-bolsa-907g', 'AROS_CEBOLLA_FREIR', 'Aros de cebolla para freír', 1, 85.90),
    ('deditos-papa-caja-10kg', 'DEDITOS_PAPA_CAJA_10KG', 'Deditos de papa (caja 10 kg)', 10, 61.90),
    ('filete-tilapia-35', 'FILETE_TILAPIA_WEBER', 'Filete de tilapia', 1, 39.90),
    ('camaron-4150', 'CAMARON_4150_MEDIANO_WEB', 'Camarón mediano 41/50', 1, 133.90),
    ('camaron-1620-gigante', 'CAMARON_1620_GIGANTE', 'Camarón gigante 16/20', 1, 187.90),
    ('camaron-cocido-4150', 'CAMARON_COCIDO_WEBER', 'Camarón cocido', 1, 185.90),
    ('pork-belly-premium-tif', 'PORK_BELLY_PREMIUM_TIF', 'Pork belly premium TIF', 1, 104.90),
    ('pork-belly-seabord', 'PORK_BELLY_SEABORD', 'Pork belly Seabord', 1, 123.90),
    ('chorizo-grapa', 'CHORIZO_GRAPA', 'Chorizo grapa', 1, 6.00),
    ('carne-al-pastor-100', 'AL_PASTOR_SALCHICHA_MEDI', 'Carne al pastor (salchicha 1/2 kg)', 1, 33.90),
    ('carne-al-pastor-100', 'AL_PASTOR_BOLSA_5KG', 'Carne al pastor (bolsa 5 kg)', 5, 67.90),
    ('cuero-puerco', 'CUERO_PUERCO', 'Cuero de puerco', 1, 30.90),
    ('chamorro-puerco', 'CHAMORRO_PUERCO', 'Chamorro de puerco', 1, 42.90),
    ('codillo', 'CODILLO', 'Codillo de puerco', 1, 50.90),
    ('costilla-back-rib', 'COSTILLA_BACK_RIB_TIRA_L', 'Costilla back rib tira larga', 1, 79.90),
    ('costilla-back-rib-tira-corta', 'COSTILLA_BACK_RIB_TIRA_C', 'Costilla back rib tira corta', 1, 89.90),
    ('costilla-puerco-cargada', 'COSTILLA_PUERCO_CARGADA', 'Costilla de puerco cargada', 1, 112.90),
    ('costilla-puerco-cargada-cortada', 'COSTILLA_PUERCO_CARGADA_', 'Costilla de puerco cargada cortada', 1, 125.90),
    ('espinazo', 'ESPINAZO', 'Espinazo de puerco', 1, 29.90),
    ('espinazo-cargado', 'ESPINAZO_CARGADO', 'Espinazo cargado', 1, 30.90),
    ('corazon-puerco', 'CORAZON_PUERCO', 'Corazón de puerco', 1, 38.90),
    ('lomo-ahumado-chimex', 'LOMO_AHUMADO_CHIMEX', 'Lomo ahumado Chimex', 1, 79.90),
    ('lomo-ahumado-cortado', 'LOMO_AHUMADO_CORTADO', 'Lomo ahumado cortado', 1, 95.90),
    ('lomo-ahumado-cubicado-1kg', 'LOMO_AHUMADO_CUBICADO_1K', 'Lomo ahumado cubicado 1 kg', 1, 77.90),
    ('lomo-natural-puerco', 'LOMO_NATURAL_PUERCO', 'Lomo natural de puerco', 1, 65.90),
    ('lomo-natural-cortado', 'LOMO_NATURAL_CORTADO', 'Lomo natural cortado', 1, 79.90),
    ('manitas-puerco', 'MANITAS_PUERCO', 'Manitas de puerco', 1, 36.90),
    ('manteca-puerco', 'MANTECA_PUERCO', 'Manteca de puerco', 1, 35.90),
    ('morcon', 'MORCON', 'Morcón', 1, 72.90),
    ('tocino-cubicado-1kg', 'TOCINO_CUBICADO_1KG', 'Tocino cubicado 1 kg', 1, 75.90),
    ('tocino-rebanado', 'TOCINO_REBANADO', 'Tocino rebanado', 1, 126.90),
    ('tripa-puerco', 'TRIPA_PUERCO', 'Tripa de puerco', 1, 39.90),
    ('chicharron-pella', 'CHICHARRON_PELLA', 'Chicharrón pella', 1, 123.90),
    ('chicharron-prensado', 'CHICHARRON_PRENSADO', 'Chicharrón prensado', 1, 159.90),
    ('pierna-puerco-natural', 'PIERNA_PUERCO_NATURAL', 'Pierna de puerco natural', 1, 62.90),
    ('pierna-puerco-natural-cortada', 'PIERNA_PUERCO_NATURAL_CO', 'Pierna de puerco natural cortada', 1, 66.90),
    ('pierna-puerco-cubicada', 'PIERNA_PUERCO_CUBICADA', 'Pierna de puerco natural cubicada', 1, 72.90),
    ('carne-molida-90-10', 'CARNE_MOLIDA_90_10', 'Carne molida 90/10', 1, 115.90),
    ('carne-molida-pulpa-natural', 'CARNE_MOLIDA_PULPA_NATUR', 'Carne molida de pulpa natural', 1, 126.90),
    ('carne-molida-pulpa-extralimp', 'CARNE_MOLIDA_PULPA_EXTRA', 'Carne molida de pulpa natural extralimpia', 1, 135.90),
    ('pescuezo-res-deshuesado', 'PESCUEZO_RES_DESHUESADO', 'Pescuezo de res deshuesado', 1, 135.90),
    ('carne-molida-economica', 'CARNE_MOLIDA_ECONOMICA', 'Carne molida económica', 1, 93.90),
    ('carne-molida-especial', 'CARNE_MOLIDA_ESPECIAL', 'Carne molida especial', 1, 123.90),
    ('carne-molida-de-pulpa', 'CARNE_MOLIDA_DE_PULPA', 'Carne molida de pulpa', 1, 136.90),
    ('pulpa-bola', 'PULPA_BOLA', 'Pulpa bola', 1, 146.90),
    ('pulpa-negra', 'PULPA_NEGRA', 'Pulpa negra', 1, 146.90),
    ('pulpa-alto-vacio', 'PULPA_ALTO_VACIO', 'Pulpas alto vacío (bola o negra)', 1, 172.90),
    ('pulpa-bola-negra-natural', 'PULPA_BOLA_NEGRA_NATURAL', 'Pulpa bola o negra natural', 1, 161.90),
    ('pulpa-sirloin-cubicada-1x1', 'PULPA_SIRLOIN_CUBICADA_1', 'Pulpa de sirloin cubicada 1x1', 1, 165.90),
    ('pulpa-milanesa', 'PULPA_MILANESA', 'Pulpa milanesa', 1, 188.90),
    ('cabeza-res-deshuesada', 'CABEZA_RES_DESHUESADA', 'Cabeza de res deshuesada', 1, 80.90),
    ('cachete-res', 'CACHETE_RES', 'Cachete de res', 1, 128.90),
    ('pescuezo-res-con-hueso', 'PESCUEZO_RES_CON_HUESO', 'Pescuezo de res con hueso', 1, 136.90),
    ('labio-res', 'LABIO_RES', 'Labio de res', 1, 172.90),
    ('pozole-dona-conchita-10pzs', 'POZOLE_DONA_CONCHITA_10P', 'Pozole Doña Conchita (10 pzs)', 2.5, 17.90),
    ('menudo-mexicano', 'MENUDO_MEXICANO', 'Menudo mexicano', 1, 64.90),
    ('menudo-mexicano-cortado', 'MENUDO_MEXICANO_CORTADO', 'Menudo mexicano cortado', 1, 64.90),
    ('menudo-americano', 'MENUDO_AMERICANO', 'Menudo americano', 1, 89.90),
    ('menudo-americano-cortado', 'MENUDO_AMERICANO_CORTADO', 'Menudo americano cortado', 1, 94.90),
    ('pata-res', 'PATA_RES', 'Pata de res', 1, 60.00),
    ('zancarron', 'ZANCARRON', 'Zancarrón', 1, 49.00),
    ('hueso-menudo', 'HUESO_MENUDO', 'Hueso para menudo', 1, 23.90),
    ('tripa-res-americana-1361', 'TRIPA_RES_AMERICANA_1361', 'Tripa de res americana (13.61)', 13.61, 63.90),
    ('alimento-perro-bolsa-2kg', 'ALIMENTO_PERRO_BOLSA_2KG', 'Alimento para perro (bolsa 2 kg)', 2, 17.90),
    ('premio-hueso-porky', 'PREMIO_HUESO_PORKY', 'Premio hueso porky', 0.25, 17.90),
    ('costilla-tracera-engorda', 'COSTILLA_TRACERA_ENGORDA', 'Costilla tracera (engorda)', 1, 103.90),
    ('costilla-cargada-prime', 'COSTILLA_CARGADA_PRIME', 'Costilla cargada prime', 1, 159.90),
    ('paleta-engorda', 'PALETA_ENGORDA', 'Paleta (engorda)', 1, 127.90),
    ('aguja-engorda', 'AGUJA_ENGORDA', 'Aguja (engorda)', 1, 141.90),
    ('diezmillo-c-h-engorda', 'DIEZMILLO_C_H_ENGORDA', 'Diezmillo c/h (engorda)', 1, 141.90),
    ('lomo-engorda-premium', 'LOMO_ENGORDA_PREMIUM', 'Lomo engorda premium', 1, 165.90),
    ('t-bone-engorda', 'T_BONE_ENGORDA', 'T-bone (engorda)', 1, 174.90),
    ('costilla-tracera-chuleta', 'COSTILLA_TRACERA_CHULETA', 'Costilla tracera (chuletas)', 1, 108.90),
    ('costilla-cargada-delantera', 'COSTILLA_CARGADA_DELANTE', 'Costilla cargada delantera', 1, 171.90),
    ('chuleta-cero', 'CHULETA_CERO', 'Chuleta cero', 1, 130.90),
    ('chuleta-siete', 'CHULETA_SIETE', 'Chuleta siete', 1, 143.25),
    ('diezmillo-c-h-chuleta', 'DIEZMILLO_C_H_CHULETA', 'Diezmillo c/h', 1, 143.90),
    ('chuleta-lomo', 'CHULETA_LOMO', 'Chuleta lomo', 1, 177.97),
    ('t-bone-engorda-premium', 'T_BONE_ENGORDA_PREMIUM', 'T-bone engorda premium', 1, 173.00),
    ('porter-house', 'PORTER_HOUSE', 'Porter house', 1, 195.90),
    ('tomahawk', 'TOMAHAWK', 'Tomahawk', 1, 195.90),
    ('rib-eye', 'RIB_EYE', 'Rib eye', 1, 269.90),
    ('tuetano-hueso-cortar', 'TUETANO_HUESO_CORTAR', 'Tuétano hueso para cortar', 1, 44.90),
    ('tuetano-hueso-canoa', 'TUETANO_HUESO_CANOA', 'Tuétano hueso canoa', 1, 53.90),
    ('chamberete', 'CHAMBERETE', 'Chamberete', 1, 110.90),
    ('chamberete-cortado', 'CHAMBERETE_CORTADO', 'Chamberete cortado', 1, 129.90),
    ('cicido-rabo', 'CICIDO_RABO', 'Cocido de rabo', 1, 102.90),
    ('desebrada-aldilla', 'DESEBRADA_ALDILLA', 'Deshebrada aldilla', 1, 169.90),
    ('suadero', 'SUADERO', 'Suadero', 1, 147.90),
    ('brisket-deshuesado', 'BRISKET_DESHUESADO', 'Brisket deshuesado', 1, 158.90),
    ('cocido-pecho-c-h', 'COCIDO_PECHO_C_H', 'Cocido de pecho c/h', 1, 98.90),
    ('carne-hamburguesa-sirloin-900g', 'CARNE_HAMBURGUESA_SIRLOI', 'Carne para hamburguesa sirloin (900 g)', 0.9, 118.90),
    ('carne-hamburguesa-arrachera-900g', 'CARNE_HAMBURGUESA_ARRACH', 'Carne para hamburguesa arrachera (900 g)', 0.9, 118.90),
    ('carne-hamburguesa-san-francisco-12kg', 'CARNE_HAMBURGUESA_SAN_FR', 'Carne para hamburguesa San Francisco (1.2 kg)', 1.2, 91.90);

  INSERT INTO public.product_suppliers
    (product_id, supplier_id, supplier_sku, presentation, cost, list_date, is_primary, notes)
  SELECT p.id, v_supplier, l.supplier_sku, l.item_name, l.cost,
         DATE '2026-10-01', false,
         'Lista Carnes Weber 01-oct-2026. Costo a mejor volumen; la marca no se muestra en tienda.'
  FROM _weber_link l
  JOIN public.products p ON p.slug = l.slug
  ON CONFLICT (product_id, supplier_id, supplier_sku) DO UPDATE
    SET cost = EXCLUDED.cost,
        presentation = EXCLUDED.presentation,
        list_date = EXCLUDED.list_date,
        notes = EXCLUDED.notes;

  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- is_primary: gana el proveedor de MENOR costo/kg por producto (más margen).
  -- El kg por slug replica el criterio de 00202 (tabla _unidad_kg): caja o
  -- presentación cerrada en kg; por kilo = 1.
  CREATE TEMP TABLE _slug_kg (slug text PRIMARY KEY, kg numeric(12,4) NOT NULL) ON COMMIT DROP;
  INSERT INTO _slug_kg (slug, kg)
  SELECT DISTINCT slug, kg FROM _weber_link
  UNION ALL
  VALUES
    ('aguacate-chunky-caja-7264kg', 7.2640),
    ('aros-cebolla-bolsa-907g', 0.9070),
    ('dedos-queso-bolsa-181kg', 1.8100),
    ('hamburguesa-bm-arrachera-caja-30pzs', 4.5000),
    ('hamburguesa-bm-mezquite-caja-30pzs', 4.5000),
    ('hamburguesa-bm-sirloin-caja-30pzs', 4.5000),
    ('papa-conquest-delivery-teja-65-caja-1361kg', 13.6100),
    ('papa-curly-savory-caja-1361kg', 13.6100),
    ('papa-dulce-recta-38-caja-680kg', 6.8000),
    ('papa-gajo-10-cut-65-caja-1361kg', 13.6100),
    ('papa-hash-brown-patty-caja-952kg', 9.5200),
    ('papa-ondulada-38-payette-caja-1361kg', 13.6100),
    ('papa-rallada-hash-brown-caja-816kg', 8.1600),
    ('papa-rejilla-savory-caja-1224kg', 12.2400)
  ON CONFLICT (slug) DO NOTHING;

  WITH costos AS (
    SELECT ps.product_id, ps.id,
           ps.cost / COALESCE(k.kg, 1) AS costo_kg,
           ROW_NUMBER() OVER (
             PARTITION BY ps.product_id
             ORDER BY ps.cost / COALESCE(k.kg, 1) ASC, ps.id ASC
           ) AS rnk
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    LEFT JOIN _slug_kg k ON k.slug = p.slug
    WHERE ps.product_id IN (SELECT product_id FROM public.product_suppliers WHERE supplier_id = v_supplier)
  )
  UPDATE public.product_suppliers ps
  SET is_primary = (c.rnk = 1)
  FROM costos c
  WHERE ps.id = c.id
    AND ps.is_primary IS DISTINCT FROM (c.rnk = 1);

  -- ── Topes Alsuper (solo donde hay comparable por kilo) ───────────────
  CREATE TEMP TABLE _weber_tope (
    slug       text PRIMARY KEY,
    al_id      bigint NOT NULL,
    al_name    text NOT NULL,
    al_format  text NOT NULL,
    al_price   numeric(12,2) NOT NULL,
    al_regular numeric(12,2) NOT NULL,
    cap_kg     numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_tope
    (slug, al_id, al_name, al_format, al_price, al_regular, cap_kg)
  VALUES
    ('ala-adobada-bolsa-5kg', 458060, 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('ala-iqf-pilgrims-caja-12kg', 458060, 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('muslo-bate', 510919, 'MUSLO DE POLLO POSTA XILIMORITA  ALCO 600 GRAMOS', '600 GR', 71.90, 71.90, 119.83),
    ('pechuga-media-mariposa', 369833, 'Pechuga De Pollo Sin Hueso Premium   Kg', 'KG', 99.90, 119.90, 99.90),
    ('pechuga-sin-hueso-br', 369833, 'Pechuga De Pollo Sin Hueso Premium   Kg', 'KG', 99.90, 119.90, 99.90),
    ('nugget-pechuga-pilgrims', 347922, 'Nuggets De Pollo  Tyson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('nuggets-enchiladas-caja-10kg', 347922, 'Nuggets De Pollo  Tyson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('boneless-pechuga-pilgrims', 386927, 'Pollo Bufalo Boneless  Tyson 600 g', '600 GR', 229.90, 229.90, 383.17),
    ('boneless-natural-freskecito', 386927, 'Pollo Bufalo Boneless  Tyson 600 g', '600 GR', 229.90, 229.90, 383.17),
    ('tender-empanizado-pilgrims', 353834, 'Tender De Pollo Empanizado  Tyson 700 g', '700 GR', 204.90, 204.90, 292.71),
    ('pechuga-picante-emp-pilgrims', 529714, 'PECHUGA EMPANIZADA PICANTE  PILGRIMS 700 GRAMOS', '700 GR', 224.90, 249.90, 321.29),
    ('pollo-empanizado-kfc-caja-1361kg', 353834, 'Tender De Pollo Empanizado  Tyson 700 g', '700 GR', 204.90, 204.90, 292.71),
    ('filete-tilapia-35', 472305, 'FILETE DE TILAPIA EMPANIZADO   1 KILOGRAM', 'KG', 152.90, 152.90, 152.90),
    ('camaron-4150', 9167, 'Camarón Crudo Mediano   Por Kg', 'KG', 209.90, 259.90, 209.90),
    ('camaron-cocido-4150', 513844, 'CAMARON COCIDO FRESCO TODO MARISCO 350 GRAMOS', '350 GR', 149.90, 179.90, 428.29),
    ('carne-al-pastor-100', 495679, 'Cerdo Al Pastor Alsuper Kg', 'KG', 139.90, 159.90, 139.90),
    ('chamorro-puerco', 9209, 'Chamorro De Puerco    Kg', 'KG', 84.90, 99.90, 84.90),
    ('costilla-back-rib', 456134, 'Costilla Parrillera    Kg', 'KG', 149.90, 179.90, 149.90),
    ('costilla-back-rib-tira-corta', 456134, 'Costilla Parrillera    Kg', 'KG', 149.90, 179.90, 149.90),
    ('costilla-puerco-cargada', 421784, 'Costilla De Puerco Para Guisar    Kg', 'KG', 169.90, 169.90, 169.90),
    ('costilla-puerco-cargada-cortada', 421784, 'Costilla De Puerco Para Guisar    Kg', 'KG', 169.90, 169.90, 169.90),
    ('espinazo', 12346, 'Espinazo De Puerco    Kg', 'KG', 49.90, 54.90, 49.90),
    ('espinazo-cargado', 12346, 'Espinazo De Puerco    Kg', 'KG', 49.90, 54.90, 49.90),
    ('lomo-natural-puerco', 409729, 'Chuleta De Lomo De Puerco    Kg', 'KG', 94.90, 129.90, 94.90),
    ('lomo-natural-cortado', 409729, 'Chuleta De Lomo De Puerco    Kg', 'KG', 94.90, 129.90, 94.90),
    ('manitas-puerco', 12345, 'Patitas O Manitas De Puerco    Kg', 'KG', 89.90, 119.90, 89.90),
    ('manteca-puerco', 462642, 'Manteca De Cerdo Los Corrales 470 g', '470 GR', 56.90, 56.90, 121.06),
    ('tocino-rebanado', 453622, 'Tocino Ahumado Rebanado Nayar 500 Gr', '500 GR', 89.90, 109.90, 179.80),
    ('chicharron-prensado', 450747, 'Chicharron Prensado   Muma 350 g', '350 GR', 129.90, 129.90, 371.14),
    ('pierna-puerco-natural', 49510, 'Pierna Deshuesada De Puerco Premium    Kg', 'KG', 104.90, 159.90, 104.90),
    ('pierna-puerco-natural-cortada', 49510, 'Pierna Deshuesada De Puerco Premium    Kg', 'KG', 104.90, 159.90, 104.90),
    ('pierna-puerco-cubicada', 49510, 'Pierna Deshuesada De Puerco Premium    Kg', 'KG', 104.90, 159.90, 104.90),
    ('carne-molida-90-10', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('carne-molida-pulpa-natural', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('carne-molida-pulpa-extralimp', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('carne-molida-economica', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('carne-molida-especial', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('carne-molida-de-pulpa', 494535, 'Carne Molida De Pavo   Parson 500 g', '500 GR', 99.90, 99.90, 199.80),
    ('pulpa-bola', 463475, 'Milanesa De Pulpa Bola     Kg', 'KG', 239.90, 359.90, 239.90),
    ('pulpa-negra', 337645, 'Pulpa Negra  Picada    Kg', 'KG', 304.90, 379.90, 304.90),
    ('pulpa-sirloin-cubicada-1x1', 455617, 'Carne Para Hamburguesa De Sirloin   Revuelta 1.32 Kg', '1.32 KG', 346.90, 346.90, 262.80),
    ('pulpa-milanesa', 431478, 'Milanesa De Res  Verdes Motivos 400 g', '400 GR', 214.90, 214.90, 537.25),
    ('pozole-dona-conchita-10pzs', 416002, 'Pozole  Chata 710 g', '710 GR', 64.60, 69.90, 90.99),
    ('menudo-mexicano', 357062, 'Menudo Supremo     0.5 Lt', '0.5 LT', 89.90, 104.90, 179.80),
    ('menudo-mexicano-cortado', 357062, 'Menudo Supremo     0.5 Lt', '0.5 LT', 89.90, 104.90, 179.80),
    ('menudo-americano', 357062, 'Menudo Supremo     0.5 Lt', '0.5 LT', 89.90, 104.90, 179.80),
    ('menudo-americano-cortado', 357062, 'Menudo Supremo     0.5 Lt', '0.5 LT', 89.90, 104.90, 179.80),
    ('aguja-engorda', 12253, 'Aguja Norteña Grill Choice Kg', 'KG', 259.90, 369.90, 259.90),
    ('diezmillo-c-h-engorda', 435598, 'Diezmillo Sin Hueso   Black Angus Kg', 'KG', 369.90, 369.90, 369.90),
    ('t-bone-engorda', 221958, 'T-Bone  Grill Choice 1 Kg', 'KG', 369.90, 399.90, 369.90),
    ('chuleta-cero', 47274, 'Chuleta Ahumada De Puerco    Kg', 'KG', 119.90, 149.90, 119.90),
    ('chuleta-siete', 47274, 'Chuleta Ahumada De Puerco    Kg', 'KG', 119.90, 149.90, 119.90),
    ('diezmillo-c-h-chuleta', 435598, 'Diezmillo Sin Hueso   Black Angus Kg', 'KG', 369.90, 369.90, 369.90),
    ('chuleta-lomo', 47274, 'Chuleta Ahumada De Puerco    Kg', 'KG', 119.90, 149.90, 119.90),
    ('t-bone-engorda-premium', 221958, 'T-Bone  Grill Choice 1 Kg', 'KG', 369.90, 399.90, 369.90),
    ('tuetano-hueso-cortar', 13800, 'Hueso Tuetano    Kg', 'KG', 149.90, 149.90, 149.90),
    ('tuetano-hueso-canoa', 13800, 'Hueso Tuetano    Kg', 'KG', 149.90, 149.90, 149.90),
    ('chamberete', 9191, 'Chamberete Con Hueso    Kg', 'KG', 149.90, 359.90, 149.90),
    ('chamberete-cortado', 9191, 'Chamberete Con Hueso    Kg', 'KG', 149.90, 359.90, 149.90),
    ('desebrada-aldilla', 515287, 'DESHEBRADA DE POLLO ORGANICA COCIDA AIRES DE CAMPO 500 GRAMOS', '500 GR', 242.90, 242.90, 485.80),
    ('brisket-deshuesado', 14035, 'Brisket  Entero    Kg', 'KG', 289.90, 289.90, 289.90);

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, t.al_id, t.al_name, t.al_format,
         t.al_price, t.al_regular, t.cap_kg, TIMESTAMPTZ '2026-10-01'
  FROM _weber_tope t
  JOIN public.products p ON p.slug = t.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  GET DIAGNOSTICS v_topes = ROW_COUNT;

  -- ── Disponibilidad: productos NUEVOS solo en Chihuahua (16) ─────────
  INSERT INTO public.product_city_availability (product_id, city_id, is_available)
  SELECT p.id, c.id, (c.id = 16)
  FROM public.products p
  CROSS JOIN public.cities c
  WHERE p.slug IN (SELECT slug FROM _weber_alta)
    AND c.is_active
  ON CONFLICT (product_id, city_id) DO UPDATE
    SET is_available = EXCLUDED.is_available;

  GET DIAGNOSTICS v_ciudades = ROW_COUNT;

  -- ── Recálculo de precio (00202) para todo lo tocado por Weber ────────
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT p.id,
         p.slug,
         ps.cost AS costo_lista,
         COALESCE(k.kg, 1) AS kg,
         ps.cost / COALESCE(k.kg, 1) AS costo_kg,
         t.cap_kg
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
  LEFT JOIN _slug_kg k ON k.slug = p.slug
  LEFT JOIN _weber_tope t ON t.slug = p.slug;

  -- REGLA A vs B: el rival lo vende más barato de lo que nos cuesta -> ocultar.
  UPDATE public.products p
  SET is_visible = false,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.cap_kg IS NOT NULL
    AND c.cap_kg < c.costo_kg
    AND p.is_visible = true;

  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

  -- Precio: margen 1.20 sobre costo Weber, topado por la competencia.
  -- Solo toca productos donde Weber quedó como is_primary; si otro
  -- proveedor (AB Foods) tiene menor costo/kg, ese producto conserva el
  -- precio que ya calculó 00202 con su propio margen.
  UPDATE public.products p
  SET price = LEAST(
        CEIL(c.costo_kg * c.kg * 1.20),
        COALESCE(c.cap_kg * c.kg, CEIL(c.costo_kg * c.kg * 1.20))
      ),
      sale_price = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND NOT (c.cap_kg IS NOT NULL AND c.cap_kg < c.costo_kg)
    AND p.is_visible = true
    AND EXISTS (
      SELECT 1 FROM public.product_suppliers ps
      WHERE ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
    );

  GET DIAGNOSTICS v_precios = ROW_COUNT;

  -- Disponibilidad en Chihuahua para traslapes VISIBLES que quedaron con
  -- Weber como proveedor primario (p. ej. carne al pastor): se agrega la
  -- fila de Chihuahua si falta; fuera de Chihuahua no se toca nada.
  INSERT INTO public.product_city_availability (product_id, city_id, is_available)
  SELECT p.id, 16, true
  FROM public.products p
  WHERE p.is_visible
    AND EXISTS (
      SELECT 1 FROM public.product_suppliers ps
      WHERE ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.product_city_availability pca
      WHERE pca.product_id = p.id AND pca.city_id = 16
    )
  ON CONFLICT (product_id, city_id) DO NOTHING;

  -- ── Guardas en positivo ──────────────────────────────────────────────
  SELECT count(*) INTO v_bajo_costo
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND p.price < c.costo_kg * c.kg;

  SELECT count(*) INTO v_mas_caros
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND c.cap_kg IS NOT NULL
    AND p.price > c.cap_kg * c.kg;

  IF v_bajo_costo > 0 OR v_mas_caros > 0 THEN
    RAISE EXCEPTION '00209: guarda rota (% visibles bajo costo, % sobre tope)',
      v_bajo_costo, v_mas_caros;
  END IF;

  RAISE NOTICE '00209: % productos nuevos, % vínculos, % topes, % filas ciudad, % ocultos por regla, % precios calculados. Guardas OK.',
    v_altas, v_links, v_topes, v_ciudades, v_ocultos, v_precios;
END $$;

COMMIT;
