-- ============================================================
-- Resurte.me — Seed proveedor AB Foods (lista mayoreo 10-sep-2026)
--
-- 1) Da de alta el proveedor AB Foods (AB Pollo, Chihuahua) con
--    datos de contacto verificados de abpollo.com.
-- 2) Inserta los 51 artículos de su lista de precios como
--    productos OCULTOS (is_visible = false), precio de venta 0.00
--    (pendiente de margen) y stock 'out_of_stock'.
-- 3) Vincula cada producto en product_suppliers con su SKU,
--    presentación y COSTO REAL de la lista (10-sep-2026).
--
-- Idempotente por slug / (product_id, supplier_id, supplier_sku).
-- ============================================================

DO $$
DECLARE
  s_id BIGINT;
BEGIN
  CREATE TEMP TABLE _ab_items (
    sku TEXT, name TEXT, slug TEXT, brand TEXT, cat TEXT,
    description TEXT, unit TEXT, cost NUMERIC, presentation TEXT, tags TEXT
  ) ON COMMIT DROP;

  INSERT INTO _ab_items VALUES
    ('32397', 'Aguacate chunky (caja 7.264 kg, 8/2 lb)', 'aguacate-chunky-caja-7264kg', 'Por definir', 'congelados',
     'Caja 7.264 kg (8/2 lb). Proveedor: AB Foods · art. 32397 · costo mayoreo $979.90 MXN (lista 10-sep-2026).', 'caja', 979.90, 'Caja 7.264 kg (8/2 lb)', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('1000009592', 'Dedos de queso (bolsa 1.81 kg)', 'dedos-queso-bolsa-181kg', 'Por definir', 'congelados',
     'Bolsa 1.81 kg. Proveedor: AB Foods · art. 1000009592 · costo mayoreo $369.90 MXN (lista 10-sep-2026).', 'bolsa', 369.90, 'Bolsa 1.81 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('19636', 'Aros de cebolla empanizados (bolsa 907 g)', 'aros-cebolla-bolsa-907g', 'MC', 'congelados',
     'Bolsa 907 g. Proveedor: AB Foods · art. 19636 · costo mayoreo $104.90 MXN (lista 10-sep-2026).', 'bolsa', 104.90, 'Bolsa 907 g', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('40134', 'Ala 1-2 IQF Pilgrim''s (caja 12 kg)', 'ala-iqf-pilgrims-caja-12kg', 'Pilgrim''s', 'carnes-aves-pescados',
     'Caja 12 kg (precio por kilo). Proveedor: AB Foods · art. 40134 · costo mayoreo $79.90 MXN (lista 10-sep-2026).', 'kilo', 79.90, 'Caja 12 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0116', 'Ala adobada 1-2 (bolsa 5 kg)', 'ala-adobada-bolsa-5kg', 'Por definir', 'carnes-aves-pescados',
     'Bolsa 5 kg (precio por kilo). Proveedor: AB Foods · art. 0116 · costo mayoreo $56.90 MXN (lista 10-sep-2026).', 'kilo', 56.90, 'Bolsa 5 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('8563', 'Ala habanero 1-2 (bolsa 5 kg)', 'ala-habanero-bolsa-5kg', 'Por definir', 'carnes-aves-pescados',
     'Bolsa 5 kg (precio por kilo). Proveedor: AB Foods · art. 8563 · costo mayoreo $69.90 MXN (lista 10-sep-2026).', 'kilo', 69.90, 'Bolsa 5 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('8564', 'Ala botanera 1-2 (bolsa 5 kg)', 'ala-botanera-bolsa-5kg', 'Por definir', 'carnes-aves-pescados',
     'Bolsa 5 kg (precio por kilo). Proveedor: AB Foods · art. 8564 · costo mayoreo $67.90 MXN (lista 10-sep-2026).', 'kilo', 67.90, 'Bolsa 5 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('46300244', 'Hamburguesa BM arrachera (caja 30 pzs de 150 g)', 'hamburguesa-bm-arrachera-caja-30pzs', 'BM', 'carnes-aves-pescados',
     'Caja 30 pzs x 150 g. Proveedor: AB Foods · art. 46300244 · costo mayoreo $534.90 MXN (lista 10-sep-2026).', 'caja', 534.90, 'Caja 30 pzs x 150 g', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('46300245', 'Hamburguesa BM sirloin (caja 30 pzs de 150 g)', 'hamburguesa-bm-sirloin-caja-30pzs', 'BM', 'carnes-aves-pescados',
     'Caja 30 pzs x 150 g. Proveedor: AB Foods · art. 46300245 · costo mayoreo $564.90 MXN (lista 10-sep-2026).', 'caja', 564.90, 'Caja 30 pzs x 150 g', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('46300246', 'Hamburguesa BM mezquite (caja 30 pzs de 150 g)', 'hamburguesa-bm-mezquite-caja-30pzs', 'BM', 'carnes-aves-pescados',
     'Caja 30 pzs x 150 g. Proveedor: AB Foods · art. 46300246 · costo mayoreo $534.90 MXN (lista 10-sep-2026).', 'caja', 534.90, 'Caja 30 pzs x 150 g', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('017103', 'Papa francesa 3/8 Payette (caja 13.61 kg)', 'papa-francesa-38-payette-caja-1361kg', 'Payette', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 017103 · costo mayoreo $549.90 MXN (lista 10-sep-2026).', 'caja', 549.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('017110', 'Papa francesa 1/4 Payette (caja 12.24 kg)', 'papa-francesa-14-payette-caja-1224kg', 'Payette', 'congelados',
     'Caja 12.24 kg. Proveedor: AB Foods · art. 017110 · costo mayoreo $499.90 MXN (lista 10-sep-2026).', 'caja', 499.90, 'Caja 12.24 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('018940', 'Papa ondulada 3/8 Payette (caja 13.61 kg)', 'papa-ondulada-38-payette-caja-1361kg', 'Payette', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 018940 · costo mayoreo $549.90 MXN (lista 10-sep-2026).', 'caja', 549.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('038634', 'Papa hash brown patty (caja 9.52 kg)', 'papa-hash-brown-patty-caja-952kg', 'Por definir', 'congelados',
     'Caja 9.52 kg. Proveedor: AB Foods · art. 038634 · costo mayoreo $549.90 MXN (lista 10-sep-2026).', 'caja', 549.90, 'Caja 9.52 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('361480', 'Papa rallada hash brown (caja 8.16 kg)', 'papa-rallada-hash-brown-caja-816kg', 'Por definir', 'congelados',
     'Caja 8.16 kg. Proveedor: AB Foods · art. 361480 · costo mayoreo $629.90 MXN (lista 10-sep-2026).', 'caja', 629.90, 'Caja 8.16 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('023821', 'Papa Select 5/16 sin cáscara (caja 13.61 kg)', 'papa-select-516-sc-caja-1361kg', 'Por definir', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 023821 · costo mayoreo $579.90 MXN (lista 10-sep-2026).', 'caja', 579.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('023937', 'Papa Select 3/8 sin cáscara (caja 13.61 kg)', 'papa-select-38-sc-caja-1361kg', 'Por definir', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 023937 · costo mayoreo $579.90 MXN (lista 10-sep-2026).', 'caja', 579.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('027805', 'Papa dulce recta 3/8 (caja 6.80 kg)', 'papa-dulce-recta-38-caja-680kg', 'Por definir', 'congelados',
     'Caja 6.80 kg. Proveedor: AB Foods · art. 027805 · costo mayoreo $749.90 MXN (lista 10-sep-2026).', 'caja', 749.90, 'Caja 6.80 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('038740', 'Papa Conquest 1/4 (caja 16.33 kg)', 'papa-conquest-14-caja-1633kg', 'Conquest', 'congelados',
     'Caja 16.33 kg. Proveedor: AB Foods · art. 038740 · costo mayoreo $819.90 MXN (lista 10-sep-2026).', 'caja', 819.90, 'Caja 16.33 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('043386', 'Papa Conquest Delivery 3/8 sin cáscara (caja 13.61 kg)', 'papa-conquest-delivery-38-sc-caja-1361kg', 'Conquest', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 043386 · costo mayoreo $799.90 MXN (lista 10-sep-2026).', 'caja', 799.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('043850', 'Papa Select 3/8 con cáscara (caja 13.61 kg)', 'papa-select-38-cascara-caja-1361kg', 'Por definir', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 043850 · costo mayoreo $749.90 MXN (lista 10-sep-2026).', 'caja', 749.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('048374', 'Papa Conquest Delivery teja 6/5 (caja 13.61 kg)', 'papa-conquest-delivery-teja-65-caja-1361kg', 'Conquest', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 048374 · costo mayoreo $819.90 MXN (lista 10-sep-2026).', 'caja', 819.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('027515', 'Papa Thunder 3/8 con cáscara (caja 13.61 kg)', 'papa-thunder-38-sc-caja-1361kg', 'Thunder', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 027515 · costo mayoreo $709.90 MXN (lista 10-sep-2026).', 'caja', 709.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('046165', 'Papa gajo 10 cut 6/5 (caja 13.61 kg)', 'papa-gajo-10-cut-65-caja-1361kg', 'Por definir', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 046165 · costo mayoreo $729.90 MXN (lista 10-sep-2026).', 'caja', 729.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('470144', 'Papa curly Savory (caja 13.61 kg)', 'papa-curly-savory-caja-1361kg', 'Savory', 'congelados',
     'Caja 13.61 kg. Proveedor: AB Foods · art. 470144 · costo mayoreo $879.90 MXN (lista 10-sep-2026).', 'caja', 879.90, 'Caja 13.61 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('475125', 'Papa Megacrunch 1/4 (caja 12.24 kg)', 'papa-megacrunch-14-caja-1224kg', 'Megacrunch', 'congelados',
     'Caja 12.24 kg. Proveedor: AB Foods · art. 475125 · costo mayoreo $719.90 MXN (lista 10-sep-2026).', 'caja', 719.90, 'Caja 12.24 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('479024', 'Papa rejilla Savory (caja 12.24 kg)', 'papa-rejilla-savory-caja-1224kg', 'Savory', 'congelados',
     'Caja 12.24 kg. Proveedor: AB Foods · art. 479024 · costo mayoreo $699.90 MXN (lista 10-sep-2026).', 'caja', 699.90, 'Caja 12.24 kg', '["ab-foods","congelados","restaurante","taqueria"]'),
    ('15071', 'Pechuga de pollo sin hueso BR', 'pechuga-sin-hueso-br', 'BR', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 15071 · costo mayoreo $61.90 MXN (lista 10-sep-2026).', 'kilo', 61.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('41451', 'Pechuga sin hueso Pilgrim''s (caja 12 kg)', 'pechuga-sh-pilgrims-caja-12kg', 'Pilgrim''s', 'carnes-aves-pescados',
     'Caja 12 kg (precio por kilo). Proveedor: AB Foods · art. 41451 · costo mayoreo $81.90 MXN (lista 10-sep-2026).', 'kilo', 81.90, 'Caja 12 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('8151', 'Pechuga sin hueso AM Soles (caja 10 kg)', 'pechuga-sh-am-soles-caja-10kg', 'Soles', 'carnes-aves-pescados',
     'Caja 10 kg (precio por kilo). Proveedor: AB Foods · art. 8151 · costo mayoreo $58.90 MXN (lista 10-sep-2026).', 'kilo', 58.90, 'Caja 10 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('8160', 'Pechuga sin hueso BR Soles (caja 10 kg)', 'pechuga-sh-br-soles-caja-10kg', 'Soles', 'carnes-aves-pescados',
     'Caja 10 kg (precio por kilo). Proveedor: AB Foods · art. 8160 · costo mayoreo $61.90 MXN (lista 10-sep-2026).', 'kilo', 61.90, 'Caja 10 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('00015', 'Camarón cocido 41/50', 'camaron-cocido-4150', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 00015 · costo mayoreo $122.90 MXN (lista 10-sep-2026).', 'kilo', 122.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('4150', 'Camarón 41/50', 'camaron-4150', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 4150 · costo mayoreo $164.90 MXN (lista 10-sep-2026).', 'kilo', 164.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('9999', 'Camarón cocido 100/200', 'camaron-cocido-100200', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 9999 · costo mayoreo $112.90 MXN (lista 10-sep-2026).', 'kilo', 112.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0201', 'Filete de tilapia 3-5', 'filete-tilapia-35', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 0201 · costo mayoreo $45.90 MXN (lista 10-sep-2026).', 'kilo', 45.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('2336', 'Boneless buffalo Freskecito', 'boneless-buffalo-freskecito', 'Freskecito', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 2336 · costo mayoreo $134.90 MXN (lista 10-sep-2026).', 'kilo', 134.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('5904', 'Boneless de pechuga Pilgrim''s', 'boneless-pechuga-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 5904 · costo mayoreo $125.90 MXN (lista 10-sep-2026).', 'kilo', 125.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('8567', 'Boneless natural Freskecito', 'boneless-natural-freskecito', 'Freskecito', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 8567 · costo mayoreo $134.90 MXN (lista 10-sep-2026).', 'kilo', 134.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0455', 'Nugget de pechuga Pilgrim''s', 'nugget-pechuga-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 0455 · costo mayoreo $92.90 MXN (lista 10-sep-2026).', 'kilo', 92.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('4011', 'Pechuga picante empanizada Pilgrim''s', 'pechuga-picante-emp-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 4011 · costo mayoreo $154.90 MXN (lista 10-sep-2026).', 'kilo', 154.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('4556', 'Hamburguesa empanizada Pilgrim''s', 'hamburguesa-empanizada-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 4556 · costo mayoreo $92.90 MXN (lista 10-sep-2026).', 'kilo', 92.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('6673', 'Tender empanizado Pilgrim''s', 'tender-empanizado-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 6673 · costo mayoreo $142.90 MXN (lista 10-sep-2026).', 'kilo', 142.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('70483', 'Cordon bleu mini', 'cordon-bleu-mini', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 70483 · costo mayoreo $132.90 MXN (lista 10-sep-2026).', 'kilo', 132.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('9943', 'Pechuga grill FC Pilgrim''s', 'pechuga-grill-fc-pilgrims', 'Pilgrim''s', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 9943 · costo mayoreo $169.90 MXN (lista 10-sep-2026).', 'kilo', 169.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('10160', 'Pollo entero congelado Pilgrim''s (caja 14.5 kg)', 'pollo-entero-congelado-pilgrims-caja-145kg', 'Pilgrim''s', 'carnes-aves-pescados',
     'Caja 14.5 kg (precio por kilo). Proveedor: AB Foods · art. 10160 · costo mayoreo $59.90 MXN (lista 10-sep-2026).', 'kilo', 59.90, 'Caja 14.5 kg (precio por kilo)', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0318', 'Costilla back rib de puerco', 'costilla-back-rib', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 0318 · costo mayoreo $144.90 MXN (lista 10-sep-2026).', 'kilo', 144.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0333', 'Carne al pastor 100% carne', 'carne-al-pastor-100', 'Por definir', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 0333 · costo mayoreo $69.90 MXN (lista 10-sep-2026).', 'kilo', 69.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('6093', 'Queso crema Krol barra 1.36 kg', 'queso-crema-krol-barra-136kg', 'Krol', 'lacteos-huevos',
     'Barra 1.36 kg. Proveedor: AB Foods · art. 6093 · costo mayoreo $119.90 MXN (lista 10-sep-2026).', 'pieza', 119.90, 'Barra 1.36 kg', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('6130', 'Queso crema Reny Picot (caja 8 kg)', 'queso-crema-reny-picot-caja-8kg', 'Reny Picot', 'lacteos-huevos',
     'Caja 8 kg. Proveedor: AB Foods · art. 6130 · costo mayoreo $1,049.90 MXN (lista 10-sep-2026).', 'caja', 1049.90, 'Caja 8 kg', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('7503024496123', 'Queso crema Reny Picot 1.36 kg', 'queso-crema-reny-picot-136kg', 'Reny Picot', 'lacteos-huevos',
     'Pieza 1.36 kg. Proveedor: AB Foods · art. 7503024496123 · costo mayoreo $189.90 MXN (lista 10-sep-2026).', 'pieza', 189.90, 'Pieza 1.36 kg', '["ab-foods","proteinas","restaurante","taqueria"]'),
    ('0133', 'Arrachera premium SuKarne', 'arrachera-premium-sukarne', 'SuKarne', 'carnes-aves-pescados',
     'Por kilo. Proveedor: AB Foods · art. 0133 · costo mayoreo $289.90 MXN (lista 10-sep-2026).', 'kilo', 289.90, 'Por kilo', '["ab-foods","proteinas","restaurante","taqueria"]');

  -- ----------------------------------------------------------
  -- 1) Proveedor AB Foods
  -- ----------------------------------------------------------
  INSERT INTO suppliers (
    name, slug, phone, whatsapp, email, website,
    address, city, state, status, notes
  )
  SELECT
    'AB Foods (AB Pollo)', 'ab-foods',
    '(614) 420 2683', '5216142353333',
    'ventas@abpollo.com', 'https://abpollo.com',
    'Av. Mario Vargas Llosa #103, Complejo Industrial',
    'Chihuahua', 'Chihuahua', 'cotizado',
    'Lista de precios mayoreo recibida con vigencia 10-sep-2026 (51 artículos). '
    || 'Entregas locales gratis en compras mayores a $800; foráneas gratis desde $2,000 (área delimitada). '
    || 'Sucursal Cd. Juárez: Taguchi #205, North Gate 32674, Tel. (656) 304 8168. '
    || 'Contacto adicional: hola@abpollo.com · Instagram @ab__foods (WA 614 196 2359). '
    || 'Precios sujetos a cambio sin previo aviso y a disponibilidad.'
  WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.slug = 'ab-foods');

  SELECT id INTO s_id FROM suppliers WHERE slug = 'ab-foods';

  -- ----------------------------------------------------------
  -- 2) Productos (ocultos, precio de venta por definir)
  -- ----------------------------------------------------------
  INSERT INTO products (
    name, slug, description, brand, category_id,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags
  )
  SELECT
    x.name, x.slug, x.description, x.brand, c.id,
    0.00, NULL, 'out_of_stock', false, false,
    x.unit, x.tags::jsonb
  FROM _ab_items x
  JOIN categories c ON c.slug = x.cat
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.slug = x.slug);

  -- ----------------------------------------------------------
  -- 3) Vínculo producto ↔ proveedor con costo de lista
  -- ----------------------------------------------------------
  INSERT INTO product_suppliers (
    product_id, supplier_id, supplier_sku, presentation, cost,
    list_date, is_primary, notes
  )
  SELECT
    p.id, s_id, x.sku, x.presentation, x.cost,
    DATE '2026-09-10', true,
    'Lista de precios mayoreo AB Foods, vigencia 10-sep-2026.'
  FROM _ab_items x
  JOIN products p ON p.slug = x.slug
  WHERE NOT EXISTS (
    SELECT 1 FROM product_suppliers ps
    WHERE ps.product_id = p.id AND ps.supplier_id = s_id AND ps.supplier_sku = x.sku
  );

  RAISE NOTICE 'AB Foods cargado: 51 artículos con costo de lista (ocultos, precio de venta por definir).';
END $$;
