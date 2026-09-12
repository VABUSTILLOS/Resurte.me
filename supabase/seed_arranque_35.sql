-- ============================================================
-- Resurte.me — Semilla del catálogo de arranque (35 referencias)
--
-- Carga las 35 referencias del documento "Arranque comercial y
-- captación de proveedores" (Chihuahua capital) como productos
-- OCULTOS (is_visible = false) y con precio por confirmar (0.00),
-- listos para activarse por ciudad desde /admin/disponibilidad en
-- cuanto haya cotización real de un proveedor verificado.
--
-- Disciplina del documento de traspaso: no se inventan precios,
-- marcas ni presentaciones; cada referencia lleva en su descripción
-- la presentación exacta a cotizar.
--
-- USO (SQL Editor de Supabase):
--   1. Aplica primero la migración 00065_product_city_availability.sql.
--   2. Ejecuta este script completo. Es idempotente: no duplica
--      categorías ni productos que ya existan (por slug).
--   3. Activa productos por ciudad en /admin/disponibilidad y su
--      visibilidad/precio en /admin/productos o /admin/visibilidad.
--
-- Tags por segmento (colecciones del marketplace):
--   taqueria / restaurante / cafeteria  +  tag de familia
--   (empaques, limpieza, secos, cafe)   +  'arranque'
-- ============================================================

DO $$
DECLARE
  c_empaques BIGINT;
  c_limpieza BIGINT;
  c_secos    BIGINT;
  c_cafe     BIGINT;
BEGIN
  -- ----------------------------------------------------------
  -- 1) Categorías de arranque (idempotente por slug)
  -- ----------------------------------------------------------
  INSERT INTO categories (name, slug, icon)
  SELECT x.name, x.slug, x.icon
  FROM (VALUES
    ('Empaques y desechables',    'empaques-desechables',    '📦'),
    ('Limpieza institucional',    'limpieza-institucional',  '🧼'),
    ('Abarrotes secos',           'abarrotes-secos',         '🥫'),
    ('Café e insumos de bebidas', 'cafe-insumos-bebidas',    '☕')
  ) AS x(name, slug, icon)
  WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = x.slug);

  SELECT id INTO c_empaques FROM categories WHERE slug = 'empaques-desechables';
  SELECT id INTO c_limpieza FROM categories WHERE slug = 'limpieza-institucional';
  SELECT id INTO c_secos    FROM categories WHERE slug = 'abarrotes-secos';
  SELECT id INTO c_cafe     FROM categories WHERE slug = 'cafe-insumos-bebidas';

  -- ----------------------------------------------------------
  -- 2) Las 35 referencias de arranque
  --    price = 0 y stock_status = 'out_of_stock' de forma
  --    intencional: "precio por confirmar" hasta tener cotización.
  --    is_visible = false: no aparecen en la tienda hasta activarse.
  -- ----------------------------------------------------------
  INSERT INTO products (
    name, slug, description, brand, category_id,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags
  )
  SELECT
    x.name, x.slug, x.description, 'Por definir', x.category_id,
    0.00, NULL, 'out_of_stock', false, false,
    x.unit, x.tags::jsonb
  FROM (VALUES
    -- ============ EMPAQUES Y DESECHABLES (19) ============
    ('Servilleta de mesa económica (caja institucional)',
     'servilleta-mesa-economica-caja',
     'Caja institucional. Cotizar: piezas por caja y medidas. Ref. 1 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Contenedor para llevar de una división (caja)',
     'contenedor-llevar-una-division-caja',
     'Caja. Cotizar: material, capacidad y tipo de cierre. Ref. 2 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Bolsa de basura grande uso rudo (paquete)',
     'bolsa-basura-grande-uso-rudo',
     'Paquete. Cotizar: medida y espesor (calibre). Ref. 3 del plan de arranque.',
     c_empaques, 'paquete',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Papel aluminio alimentario (rollo)',
     'papel-aluminio-alimentario-rollo',
     'Rollo. Cotizar: ancho, longitud y espesor. Ref. 5 del plan de arranque.',
     c_empaques, 'rollo',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Vaso caliente de 12 oz (caja)',
     'vaso-caliente-12oz-caja',
     'Caja. Cotizar: material y diámetro. Par con tapa vaso-caliente-12oz. Ref. 6 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","cafeteria"]'),
    ('Tapa para vaso caliente de 12 oz (caja)',
     'tapa-vaso-caliente-12oz-caja',
     'Caja. Compatibilidad comprobada con vaso-caliente-12oz-caja. Ref. 7 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","cafeteria"]'),
    ('Bolsa kraft mediana para llevar (paquete)',
     'bolsa-kraft-mediana-llevar',
     'Paquete. Cotizar: dimensiones y resistencia. Ref. 8 del plan de arranque.',
     c_empaques, 'paquete',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Papel alimentario para envolver burritos (paquete)',
     'papel-envolver-burritos',
     'Paquete. Cotizar: medida y resistencia a grasa. Ref. 9 del plan de arranque.',
     c_empaques, 'paquete',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Recipiente para salsa de 2 oz (caja)',
     'recipiente-salsa-2oz-caja',
     'Caja. Cotizar: material y unidades. Par con tapa-recipiente-salsa-2oz. Ref. 12 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Tapa para recipiente de salsa de 2 oz (caja)',
     'tapa-recipiente-salsa-2oz-caja',
     'Caja. Compatibilidad comprobada con recipiente-salsa-2oz-caja. Ref. 13 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Toalla de papel para manos (caja)',
     'toalla-papel-manos-caja',
     'Caja. Cotizar: formato compatible con dispensador. Ref. 14 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Vaso frío de 16 oz (caja)',
     'vaso-frio-16oz-caja',
     'Caja. Cotizar: material y diámetro. Par con tapa-vaso-frio-16oz. Ref. 15 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Tapa para vaso frío de 16 oz (caja)',
     'tapa-vaso-frio-16oz-caja',
     'Caja. Compatibilidad comprobada con vaso-frio-16oz-caja. Ref. 16 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Contenedor para llevar de tres divisiones (caja)',
     'contenedor-llevar-tres-divisiones-caja',
     'Caja. Cotizar: material, capacidad y tipo de cierre. Ref. 19 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante"]'),
    ('Película adherente alimentaria (rollo)',
     'pelicula-adherente-alimentaria-rollo',
     'Rollo. Cotizar: ancho y longitud. Ref. 21 del plan de arranque.',
     c_empaques, 'rollo',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Papel higiénico institucional (caja)',
     'papel-higienico-institucional-caja',
     'Caja. Cotizar: metros por rollo y compatibilidad con dispensador. Ref. 23 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Tenedor desechable (caja)',
     'tenedor-desechable-caja',
     'Caja. Cotizar: material y piezas. Ref. 30 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Cuchara desechable (caja)',
     'cuchara-desechable-caja',
     'Caja. Cotizar: material y piezas. Ref. 31 del plan de arranque.',
     c_empaques, 'caja',
     '["arranque","empaques","taqueria","restaurante","cafeteria"]'),
    ('Portavasos de cartón (paquete)',
     'portavasos-carton-paquete',
     'Paquete. Cotizar: capacidad y compatibilidad con vasos de 12/16 oz. Ref. 46 del plan de arranque.',
     c_empaques, 'paquete',
     '["arranque","empaques","cafeteria","taqueria","restaurante"]'),
    -- ============ LIMPIEZA INSTITUCIONAL (5) ============
    ('Lavatrastes líquido (garrafa)',
     'lavatrastes-liquido-garrafa',
     'Garrafa. Cotizar: volumen y dilución. Ref. 4 del plan de arranque.',
     c_limpieza, 'garrafa',
     '["arranque","limpieza","taqueria","restaurante","cafeteria"]'),
    ('Desengrasante de cocina (garrafa)',
     'desengrasante-cocina-garrafa',
     'Garrafa. Cotizar: superficies admitidas y dilución. Ref. 11 del plan de arranque.',
     c_limpieza, 'garrafa',
     '["arranque","limpieza","taqueria","restaurante","cafeteria"]'),
    ('Jabón líquido para manos (garrafa)',
     'jabon-liquido-manos-garrafa',
     'Garrafa. Cotizar: volumen y compatibilidad con dispensador. Ref. 20 del plan de arranque.',
     c_limpieza, 'garrafa',
     '["arranque","limpieza","taqueria","restaurante","cafeteria"]'),
    ('Limpiador de pisos (garrafa)',
     'limpiador-pisos-garrafa',
     'Garrafa. Cotizar: volumen y dilución. Ref. 22 del plan de arranque.',
     c_limpieza, 'garrafa',
     '["arranque","limpieza","taqueria","restaurante","cafeteria"]'),
    ('Fibra para lavado de utensilios (paquete)',
     'fibra-lavado-utensilios-paquete',
     'Paquete. Cotizar: abrasividad y superficies admitidas. Ref. 27 del plan de arranque.',
     c_limpieza, 'paquete',
     '["arranque","limpieza","taqueria","restaurante","cafeteria"]'),
    -- ============ ABARROTES SECOS (6) ============
    ('Aceite vegetal para cocinar (envase institucional)',
     'aceite-vegetal-institucional',
     'Envase institucional. Cotizar: tipo de aceite y litros. Ref. 10 del plan de arranque.',
     c_secos, 'envase',
     '["arranque","secos","taqueria","restaurante"]'),
    ('Azúcar estándar (saco o paquete)',
     'azucar-estandar-saco',
     'Saco o paquete. Cotizar: kilogramos. Ref. 18 del plan de arranque.',
     c_secos, 'saco',
     '["arranque","secos","taqueria","restaurante","cafeteria"]'),
    ('Frijol pinto seco (saco)',
     'frijol-pinto-seco-saco',
     'Saco. Cotizar: kilogramos y calidad. Ref. 24 del plan de arranque.',
     c_secos, 'saco',
     '["arranque","secos","taqueria","restaurante"]'),
    ('Arroz blanco (saco)',
     'arroz-blanco-saco',
     'Saco. Cotizar: kilogramos y tipo de grano. Ref. 25 del plan de arranque.',
     c_secos, 'saco',
     '["arranque","secos","taqueria","restaurante"]'),
    ('Consomé o sazonador de pollo (bote institucional)',
     'consome-pollo-bote-institucional',
     'Bote institucional. Cotizar: peso y rendimiento. Ref. 36 del plan de arranque.',
     c_secos, 'bote',
     '["arranque","secos","taqueria","restaurante"]'),
    ('Puré de tomate (envase institucional)',
     'pure-tomate-institucional',
     'Envase institucional. Cotizar: peso y composición. Ref. 37 del plan de arranque.',
     c_secos, 'envase',
     '["arranque","secos","taqueria","restaurante"]'),
    -- ============ CAFÉ E INSUMOS DE BEBIDAS (5) ============
    ('Café en grano para espresso (bolsa 1 kg)',
     'cafe-grano-espresso-1kg',
     'Bolsa de 1 kg. Cotizar: perfil de tueste y fecha de tueste. Ref. 17 del plan de arranque.',
     c_cafe, 'bolsa 1 kg',
     '["arranque","cafe","cafeteria"]'),
    ('Leche entera UHT (caja)',
     'leche-entera-uht-caja',
     'Caja. Cotizar: unidades, litros por unidad y caducidad. Ref. 34 del plan de arranque.',
     c_cafe, 'caja',
     '["arranque","cafe","cafeteria","restaurante"]'),
    ('Azúcar en sobres (caja)',
     'azucar-sobres-caja',
     'Caja. Cotizar: piezas y gramos por sobre. Ref. 47 del plan de arranque.',
     c_cafe, 'caja',
     '["arranque","cafe","cafeteria","restaurante"]'),
    ('Chocolate en polvo para bebidas (bolsa institucional)',
     'chocolate-polvo-bebidas-bolsa',
     'Bolsa institucional. Cotizar: peso y rendimiento. Ref. 48 del plan de arranque.',
     c_cafe, 'bolsa',
     '["arranque","cafe","cafeteria"]'),
    ('Jarabe de vainilla para bebidas (botella)',
     'jarabe-vainilla-bebidas-botella',
     'Botella. Cotizar: volumen y rendimiento. Ref. 49 del plan de arranque.',
     c_cafe, 'botella',
     '["arranque","cafe","cafeteria"]')
  ) AS x(name, slug, description, category_id, unit, tags)
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.slug = x.slug);

  RAISE NOTICE 'Catálogo de arranque listo: 4 categorías y 35 referencias (ocultas, precio por confirmar).';
END $$;
