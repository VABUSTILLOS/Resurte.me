-- Migration 00021: Restore old-store (GCS) images and fix broken .png image_urls
-- 1) 84 products whose image_url points at /images/products/{id}.png (404) are remapped to the
--    equivalent .webp file that exists locally and serves HTTP 200.
--    (All 84 already have .webp in their images array, so no images rewrite is needed.)
-- 2) 51 products are re-pointed to their original old-store photos
--    (storage.googleapis.com/takeapp). Galleries include only URLs validated HTTP 200.
-- NOTE: uses jsonb_build_array / to_jsonb to avoid JSON literals with embedded double
--       quotes (copy-paste into SQL editors can corrupt those quotes).
-- Generated: 2026-08-06T19:21:35.151840+00:00

BEGIN;

-- ============ Part 1: .png image_url -> .webp (84 products) ============
-- 7 Plátano Macho
UPDATE products SET image_url = '/images/products/7.webp', updated_at = now() WHERE image_url = '/images/products/7.png';

-- 8 Fresa
UPDATE products SET image_url = '/images/products/8.webp', updated_at = now() WHERE image_url = '/images/products/8.png';

-- 10 Mango Ataúlfo
UPDATE products SET image_url = '/images/products/10.webp', updated_at = now() WHERE image_url = '/images/products/10.png';

-- 34 Epazote
UPDATE products SET image_url = '/images/products/34.webp', updated_at = now() WHERE image_url = '/images/products/34.png';

-- 49 Hongo Portobello
UPDATE products SET image_url = '/images/products/49.webp', updated_at = now() WHERE image_url = '/images/products/49.png';

-- 50 Champiñón
UPDATE products SET image_url = '/images/products/50.webp', updated_at = now() WHERE image_url = '/images/products/50.png';

-- 51 Arroz Blanco 1kg
UPDATE products SET image_url = '/images/products/51.webp', updated_at = now() WHERE image_url = '/images/products/51.png';

-- 52 Arroz Blanco 5kg
UPDATE products SET image_url = '/images/products/52.webp', updated_at = now() WHERE image_url = '/images/products/52.png';

-- 53 Frijol Negro 1kg
UPDATE products SET image_url = '/images/products/53.webp', updated_at = now() WHERE image_url = '/images/products/53.png';

-- 54 Frijol Negro 5kg
UPDATE products SET image_url = '/images/products/54.webp', updated_at = now() WHERE image_url = '/images/products/54.png';

-- 55 Frijol Bayo 1kg
UPDATE products SET image_url = '/images/products/55.webp', updated_at = now() WHERE image_url = '/images/products/55.png';

-- 56 Frijol Peruano 1kg
UPDATE products SET image_url = '/images/products/56.webp', updated_at = now() WHERE image_url = '/images/products/56.png';

-- 57 Lenteja 1kg
UPDATE products SET image_url = '/images/products/57.webp', updated_at = now() WHERE image_url = '/images/products/57.png';

-- 59 Aceite de Canola 1L
UPDATE products SET image_url = '/images/products/59.webp', updated_at = now() WHERE image_url = '/images/products/59.png';

-- 60 Aceite de Canola 5L
UPDATE products SET image_url = '/images/products/60.webp', updated_at = now() WHERE image_url = '/images/products/60.png';

-- 61 Aceite de Maíz 1L
UPDATE products SET image_url = '/images/products/61.webp', updated_at = now() WHERE image_url = '/images/products/61.png';

-- 64 Pasta Spaghetti 500g
UPDATE products SET image_url = '/images/products/64.webp', updated_at = now() WHERE image_url = '/images/products/64.png';

-- 68 Harina de Trigo 1kg
UPDATE products SET image_url = '/images/products/68.webp', updated_at = now() WHERE image_url = '/images/products/68.png';

-- 71 Sal de Mar Fina 1kg
UPDATE products SET image_url = '/images/products/71.webp', updated_at = now() WHERE image_url = '/images/products/71.png';

-- 72 Sal Gruesa 1kg
UPDATE products SET image_url = '/images/products/72.webp', updated_at = now() WHERE image_url = '/images/products/72.png';

-- 75 Orégano Molido 100g
UPDATE products SET image_url = '/images/products/75.webp', updated_at = now() WHERE image_url = '/images/products/75.png';

-- 77 Salsa Maggi 200ml
UPDATE products SET image_url = '/images/products/77.webp', updated_at = now() WHERE image_url = '/images/products/77.png';

-- 80 Catsup 1kg
UPDATE products SET image_url = '/images/products/80.webp', updated_at = now() WHERE image_url = '/images/products/80.png';

-- 81 Mayonesa 1kg
UPDATE products SET image_url = '/images/products/81.webp', updated_at = now() WHERE image_url = '/images/products/81.png';

-- 83 Consomé de Pollo 1kg
UPDATE products SET image_url = '/images/products/83.webp', updated_at = now() WHERE image_url = '/images/products/83.png';

-- 85 Vinagre Blanco 1L
UPDATE products SET image_url = '/images/products/85.webp', updated_at = now() WHERE image_url = '/images/products/85.png';

-- 90 Leche Descremada 1L
UPDATE products SET image_url = '/images/products/90.webp', updated_at = now() WHERE image_url = '/images/products/90.png';

-- 91 Leche Evaporada 360ml
UPDATE products SET image_url = '/images/products/91.webp', updated_at = now() WHERE image_url = '/images/products/91.png';

-- 92 Media Crema 240ml
UPDATE products SET image_url = '/images/products/92.webp', updated_at = now() WHERE image_url = '/images/products/92.png';

-- 93 Leche Condensada 370ml
UPDATE products SET image_url = '/images/products/93.webp', updated_at = now() WHERE image_url = '/images/products/93.png';

-- 96 Huevo Rojo 18pz
UPDATE products SET image_url = '/images/products/96.webp', updated_at = now() WHERE image_url = '/images/products/96.png';

-- 97 Queso Oaxaca 400g
UPDATE products SET image_url = '/images/products/97.webp', updated_at = now() WHERE image_url = '/images/products/97.png';

-- 98 Queso Fresco 500g
UPDATE products SET image_url = '/images/products/98.webp', updated_at = now() WHERE image_url = '/images/products/98.png';

-- 99 Queso Panela 400g
UPDATE products SET image_url = '/images/products/99.webp', updated_at = now() WHERE image_url = '/images/products/99.png';

-- 100 Queso Manchego 400g
UPDATE products SET image_url = '/images/products/100.webp', updated_at = now() WHERE image_url = '/images/products/100.png';

-- 102 Yogurt Natural 1L
UPDATE products SET image_url = '/images/products/102.webp', updated_at = now() WHERE image_url = '/images/products/102.png';

-- 105 Pechuga de Pollo
UPDATE products SET image_url = '/images/products/105.webp', updated_at = now() WHERE image_url = '/images/products/105.png';

-- 106 Milanesa de Pollo
UPDATE products SET image_url = '/images/products/106.webp', updated_at = now() WHERE image_url = '/images/products/106.png';

-- 107 Pierna y Muslo de Pollo
UPDATE products SET image_url = '/images/products/107.webp', updated_at = now() WHERE image_url = '/images/products/107.png';

-- 108 Alitas de Pollo
UPDATE products SET image_url = '/images/products/108.webp', updated_at = now() WHERE image_url = '/images/products/108.png';

-- 111 Milanesa de Res
UPDATE products SET image_url = '/images/products/111.webp', updated_at = now() WHERE image_url = '/images/products/111.png';

-- 112 Carne Molida 80/20
UPDATE products SET image_url = '/images/products/112.webp', updated_at = now() WHERE image_url = '/images/products/112.png';

-- 113 Diezmillo de Res
UPDATE products SET image_url = '/images/products/113.webp', updated_at = now() WHERE image_url = '/images/products/113.png';

-- 116 Arrachera
UPDATE products SET image_url = '/images/products/116.webp', updated_at = now() WHERE image_url = '/images/products/116.png';

-- 117 Ribeye
UPDATE products SET image_url = '/images/products/117.webp', updated_at = now() WHERE image_url = '/images/products/117.png';

-- 118 T-Bone
UPDATE products SET image_url = '/images/products/118.webp', updated_at = now() WHERE image_url = '/images/products/118.png';

-- 119 Chuleta de Cerdo
UPDATE products SET image_url = '/images/products/119.webp', updated_at = now() WHERE image_url = '/images/products/119.png';

-- 120 Lomo de Cerdo
UPDATE products SET image_url = '/images/products/120.webp', updated_at = now() WHERE image_url = '/images/products/120.png';

-- 121 Costilla de Cerdo
UPDATE products SET image_url = '/images/products/121.webp', updated_at = now() WHERE image_url = '/images/products/121.png';

-- 122 Tocino
UPDATE products SET image_url = '/images/products/122.webp', updated_at = now() WHERE image_url = '/images/products/122.png';

-- 123 Jamón de Pierna
UPDATE products SET image_url = '/images/products/123.webp', updated_at = now() WHERE image_url = '/images/products/123.png';

-- 124 Chorizo
UPDATE products SET image_url = '/images/products/124.webp', updated_at = now() WHERE image_url = '/images/products/124.png';

-- 126 Filete de Tilapia
UPDATE products SET image_url = '/images/products/126.webp', updated_at = now() WHERE image_url = '/images/products/126.png';

-- 127 Filete de Basa
UPDATE products SET image_url = '/images/products/127.webp', updated_at = now() WHERE image_url = '/images/products/127.png';

-- 128 Camarón Pacotilla
UPDATE products SET image_url = '/images/products/128.webp', updated_at = now() WHERE image_url = '/images/products/128.png';

-- 129 Camarón U12-U15
UPDATE products SET image_url = '/images/products/129.webp', updated_at = now() WHERE image_url = '/images/products/129.png';

-- 130 Pulpo
UPDATE products SET image_url = '/images/products/130.webp', updated_at = now() WHERE image_url = '/images/products/130.png';

-- 131 Mojarra Entera
UPDATE products SET image_url = '/images/products/131.webp', updated_at = now() WHERE image_url = '/images/products/131.png';

-- 132 Huachinango Entero
UPDATE products SET image_url = '/images/products/132.webp', updated_at = now() WHERE image_url = '/images/products/132.png';

-- 133 Camarón Seco
UPDATE products SET image_url = '/images/products/133.webp', updated_at = now() WHERE image_url = '/images/products/133.png';

-- 134 Salmón
UPDATE products SET image_url = '/images/products/134.webp', updated_at = now() WHERE image_url = '/images/products/134.png';

-- 137 Pan para Hot Dog
UPDATE products SET image_url = '/images/products/137.webp', updated_at = now() WHERE image_url = '/images/products/137.png';

-- 138 Pan para Hamburguesa
UPDATE products SET image_url = '/images/products/138.webp', updated_at = now() WHERE image_url = '/images/products/138.png';

-- 147 Sprite 2L
UPDATE products SET image_url = '/images/products/147.webp', updated_at = now() WHERE image_url = '/images/products/147.png';

-- 149 Sidral Mundet 2L
UPDATE products SET image_url = '/images/products/149.webp', updated_at = now() WHERE image_url = '/images/products/149.png';

-- 150 Agua Bonafont 1.5L
UPDATE products SET image_url = '/images/products/150.webp', updated_at = now() WHERE image_url = '/images/products/150.png';

-- 151 Agua Mineral 1.5L
UPDATE products SET image_url = '/images/products/151.webp', updated_at = now() WHERE image_url = '/images/products/151.png';

-- 152 Agua Mineral Saborizada 1.5L
UPDATE products SET image_url = '/images/products/152.webp', updated_at = now() WHERE image_url = '/images/products/152.png';

-- 160 Sabritas Clásicas 170g
UPDATE products SET image_url = '/images/products/160.webp', updated_at = now() WHERE image_url = '/images/products/160.png';

-- 162 Cacahuate Salado 200g
UPDATE products SET image_url = '/images/products/162.webp', updated_at = now() WHERE image_url = '/images/products/162.png';

-- 163 Galletas Marías 200g
UPDATE products SET image_url = '/images/products/163.webp', updated_at = now() WHERE image_url = '/images/products/163.png';

-- 164 Galletas Saladas 200g
UPDATE products SET image_url = '/images/products/164.webp', updated_at = now() WHERE image_url = '/images/products/164.png';

-- 169 Detergente Líquido 1L
UPDATE products SET image_url = '/images/products/169.webp', updated_at = now() WHERE image_url = '/images/products/169.png';

-- 170 Detergente en Polvo 1kg
UPDATE products SET image_url = '/images/products/170.webp', updated_at = now() WHERE image_url = '/images/products/170.png';

-- 172 Limpiador Multiusos 500ml
UPDATE products SET image_url = '/images/products/172.webp', updated_at = now() WHERE image_url = '/images/products/172.png';

-- 173 Limpiavidrios 500ml
UPDATE products SET image_url = '/images/products/173.webp', updated_at = now() WHERE image_url = '/images/products/173.png';

-- 175 Fibras para Trastes 3pz
UPDATE products SET image_url = '/images/products/175.webp', updated_at = now() WHERE image_url = '/images/products/175.png';

-- 177 Servilletas 100pz
UPDATE products SET image_url = '/images/products/177.webp', updated_at = now() WHERE image_url = '/images/products/177.png';

-- 178 Papel de Cocina 2pz
UPDATE products SET image_url = '/images/products/178.webp', updated_at = now() WHERE image_url = '/images/products/178.png';

-- 182 Helado Vainilla 1L
UPDATE products SET image_url = '/images/products/182.webp', updated_at = now() WHERE image_url = '/images/products/182.png';

-- 183 Paletas de Hielo 12pz
UPDATE products SET image_url = '/images/products/183.webp', updated_at = now() WHERE image_url = '/images/products/183.png';

-- 184 Filete de Tilapia Congelado 1kg
UPDATE products SET image_url = '/images/products/184.webp', updated_at = now() WHERE image_url = '/images/products/184.png';

-- 185 Camarón Congelado 1kg
UPDATE products SET image_url = '/images/products/185.webp', updated_at = now() WHERE image_url = '/images/products/185.png';

-- 186 Nuggets de Pollo 1kg
UPDATE products SET image_url = '/images/products/186.webp', updated_at = now() WHERE image_url = '/images/products/186.png';


-- ============ Part 2: restore old-store GCS photos (51 products, validated 200) ============
-- 1 Manzana Roja
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png', 'https://storage.googleapis.com/takeapp/media/cmihojint000k04if2qg48em7.png'), updated_at = now() WHERE id = 1;

-- 2 Manzana Verde
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png'), updated_at = now() WHERE id = 2;

-- 3 Aguacate Hass
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png', 'https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png'), updated_at = now() WHERE id = 3;

-- 4 Naranja Valencia
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png'), updated_at = now() WHERE id = 4;

-- 5 Limón Agrio
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png'), updated_at = now() WHERE id = 5;

-- 6 Plátano Tabasco
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png'), updated_at = now() WHERE id = 6;

-- 9 Papaya Maradol
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png'), updated_at = now() WHERE id = 9;

-- 11 Mango Manila
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png'), updated_at = now() WHERE id = 11;

-- 12 Sandía
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png'), updated_at = now() WHERE id = 12;

-- 13 Melón Chino
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png'), updated_at = now() WHERE id = 13;

-- 14 Piña Miel
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png'), updated_at = now() WHERE id = 14;

-- 15 Toronja
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png'), updated_at = now() WHERE id = 15;

-- 16 Uvas Verdes
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png'), updated_at = now() WHERE id = 16;

-- 17 Uvas Rojas
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png'), updated_at = now() WHERE id = 17;

-- 18 Guayaba
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png'), updated_at = now() WHERE id = 18;

-- 19 Mandarina
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png'), updated_at = now() WHERE id = 19;

-- 20 Jitomate Saladet
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png'), updated_at = now() WHERE id = 20;

-- 21 Jitomate Bola
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png'), updated_at = now() WHERE id = 21;

-- 22 Tomate Verde
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png'), updated_at = now() WHERE id = 22;

-- 23 Cebolla Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png'), updated_at = now() WHERE id = 23;

-- 24 Cebolla Morada
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png'), updated_at = now() WHERE id = 24;

-- 25 Papa Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg'), updated_at = now() WHERE id = 25;

-- 26 Papa Cambray
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png'), updated_at = now() WHERE id = 26;

-- 27 Zanahoria
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg'), updated_at = now() WHERE id = 27;

-- 28 Brócoli
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png'), updated_at = now() WHERE id = 28;

-- 29 Coliflor
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png'), updated_at = now() WHERE id = 29;

-- 30 Lechuga Romana
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png'), updated_at = now() WHERE id = 30;

-- 31 Espinaca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png'), updated_at = now() WHERE id = 31;

-- 32 Cilantro
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png'), updated_at = now() WHERE id = 32;

-- 33 Perejil
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png', 'https://storage.googleapis.com/takeapp/media/cmilw6kb5000204l8hoc09tg9.png'), updated_at = now() WHERE id = 33;

-- 35 Chile Serrano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png'), updated_at = now() WHERE id = 35;

-- 36 Chile Jalapeño
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png'), updated_at = now() WHERE id = 36;

-- 37 Chile Poblano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png'), updated_at = now() WHERE id = 37;

-- 38 Ajo
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png'), updated_at = now() WHERE id = 38;

-- 39 Pepino
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png'), updated_at = now() WHERE id = 39;

-- 40 Calabacita
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png'), updated_at = now() WHERE id = 40;

-- 41 Chayote
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png'), updated_at = now() WHERE id = 41;

-- 42 Elote
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png'), updated_at = now() WHERE id = 42;

-- 43 Nopal
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png'), updated_at = now() WHERE id = 43;

-- 44 Apio
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png'), updated_at = now() WHERE id = 44;

-- 45 Betabel
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png'), updated_at = now() WHERE id = 45;

-- 46 Col Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png'), updated_at = now() WHERE id = 46;

-- 47 Chile Habanero
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg', 'https://storage.googleapis.com/takeapp/media/cmigujm9f000204lk0jfhc8ha.png'), updated_at = now() WHERE id = 47;

-- 48 Rábano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg'), updated_at = now() WHERE id = 48;

-- 94 Huevo Blanco 18pz
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp'), updated_at = now() WHERE id = 94;

-- 95 Huevo Blanco Caja 30pz
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp'), updated_at = now() WHERE id = 95;

-- 101 Queso Crema 200g
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp'), updated_at = now() WHERE id = 101;

-- 103 Crema Ácida 1L
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp'), updated_at = now() WHERE id = 103;

-- 104 Mantequilla sin Sal 200g
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp'), updated_at = now() WHERE id = 104;

-- 115 Costilla de Res
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png'), updated_at = now() WHERE id = 115;

-- 140 Tortillas de Harina
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp'), updated_at = now() WHERE id = 140;

COMMIT;