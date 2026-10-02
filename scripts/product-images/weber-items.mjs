#!/usr/bin/env node
// Transcripción de la lista de Carnes Weber (imágenes 21-sep y 01-oct-2026).
// Fuente única para la migración 00209: cada renglón queda como
// { slug, name, description, unit, kg, cost, category, overlap?, alsuper? }
//
// cost = mejor volumen (tarima / +100kg / +3 cajas), por kilo salvo que `kg`
// indique una presentación cerrada (caja/bolsa/pieza), igual que 00202.
// overlap = slug del producto EXISTENTE en la tienda: no se duplica, solo se
// agrega Weber como proveedor y compite por is_primary (menor costo/kg).
// alsuper = keyword curada para buscar el tope en la API de Alsuper.

export const WEBER_ITEMS = [
  // ── POLLO (1 caja / 5 / 10 / tarima) — costos por kilo ─────────────
  { slug: "alita-adobada-iqf-caja-12kg", name: "Alita adobada IQF (caja 12 kg)", description: "Alita de pollo adobada congelada IQF, lista para freír u hornear. Caja de 12 kg.", unit: "caja", kg: 12, cost: 55.90, category: 4, overlap: "ala-adobada-bolsa-5kg", alsuper: "Alitas De Pollo Adobadas" },
  { slug: "alita-natural-iqf-caja-12kg", name: "Alita natural IQF (caja 12 kg)", description: "Alita de pollo natural congelada IQF. Caja de 12 kg.", unit: "caja", kg: 12, cost: 71.90, category: 4, overlap: "ala-iqf-pilgrims-caja-12kg", alsuper: "Alitas De Pollo" },
  { slug: "muslo-bate", name: "Muslo bate de pollo", description: "Muslo de pollo corte bate (sin muslo ni pierna separados), fresco. Precio por kilo.", unit: "kilo", kg: 1, cost: 28.90, category: 4, alsuper: "Muslo De Pollo" },
  { slug: "pechuga-media-mariposa", name: "Pechuga de pollo media mariposa", description: "Media pechuga de pollo sin hueso, corte mariposa. Precio por kilo.", unit: "kilo", kg: 1, cost: 57.90, category: 4, alsuper: "Pechuga De Pollo Sin Hueso" },
  { slug: "pechuga-chica-brazilena", name: "Pechuga chica brasileña", description: "Pechuga de pollo chica importada, sin hueso. Precio por kilo.", unit: "kilo", kg: 1, cost: 76.90, category: 4, overlap: "pechuga-sin-hueso-br", alsuper: "Pechuga De Pollo Sin Hueso" },

  // ── EMPANIZADOS ─────────────────────────────────────────────────────
  { slug: "nuggets-pollo-caja-10kg", name: "Nuggets de pollo (caja 10 kg)", description: "Nuggets de pollo empanizados congelados. Caja de 10 kg.", unit: "caja", kg: 10, cost: 49.90, category: 4, overlap: "nugget-pechuga-pilgrims", alsuper: "Nuggets De Pollo" },
  { slug: "nuggets-enchiladas-caja-10kg", name: "Nuggets enchilados (caja 10 kg)", description: "Nuggets de pollo empanizados con toque picante. Caja de 10 kg.", unit: "caja", kg: 10, cost: 59.90, category: 4, alsuper: "Nuggets De Pollo" },
  { slug: "bonel-americano", name: "Boneless americano", description: "Boneless de pollo empanizados estilo americano. Precio por kilo.", unit: "kilo", kg: 1, cost: 73.90, category: 4, overlap: "boneless-pechuga-pilgrims", alsuper: "Boneless De Pollo" },
  { slug: "bonel-freskesito", name: "Boneless freskesito", description: "Boneless de pollo empanizados, crocantes. Precio por kilo.", unit: "kilo", kg: 1, cost: 118.90, category: 4, overlap: "boneless-natural-freskecito", alsuper: "Boneless De Pollo" },
  { slug: "tender-cocido", name: "Tender cocido", description: "Tiras de pechuga empanizadas precocidas, listas para calentar. Precio por kilo.", unit: "kilo", kg: 1, cost: 74.90, category: 4, overlap: "tender-empanizado-pilgrims", alsuper: "Tender Empanizado" },
  { slug: "pechuga-empanizada", name: "Pechuga empanizada", description: "Pechuga de pollo empanizada, lista para freír. Precio por kilo.", unit: "kilo", kg: 1, cost: 75.90, category: 4, overlap: "pechuga-picante-emp-pilgrims", alsuper: "Pechuga Empanizada" },
  { slug: "pollo-empanizado-kfc-caja-1361kg", name: "Pollo empanizado tipo KFC (caja 13.61 kg)", description: "Piezas de pollo empanizadas estilo Kentucky, congeladas. Caja de 13.61 kg.", unit: "caja", kg: 13.61, cost: 75.90, category: 4, alsuper: "Pollo Empanizado" },

  // ── PARA FREÍR ──────────────────────────────────────────────────────
  { slug: "papa-lisa-caja", name: "Papa lisa para freír (caja)", description: "Papa prefría corte liso, congelada. Caja.", unit: "caja", kg: 15, cost: 35.90, category: 9, alsuper: "Papas A La Francesa Congeladas" },
  { slug: "papa-ondulada-caja", name: "Papa ondulada para freír (caja)", description: "Papa prefría corte ondulado, congelada. Caja.", unit: "caja", kg: 15, cost: 36.90, category: 9, overlap: "papa-ondulada-38-payette-caja-1361kg", alsuper: "Papas Onduladas Congeladas" },
  { slug: "papa-gajo-caja", name: "Papa gajo para freír (caja)", description: "Papa prefría en gajos, congelada. Caja.", unit: "caja", kg: 15, cost: 48.90, category: 9, overlap: "papa-gajo-10-cut-65-caja-1361kg", alsuper: "Papas Gajo Congeladas" },
  { slug: "papa-hashbrown-usa", name: "Papa hash brown USA", description: "Papa rallada estilo hash brown, congelada. Precio por kilo.", unit: "kilo", kg: 1, cost: 59.90, category: 9, overlap: "papa-rallada-hash-brown-caja-816kg", alsuper: "Hash Brown" },
  { slug: "aros-cebolla-freir", name: "Aros de cebolla para freír", description: "Aros de cebolla empanizados congelados. Precio por kilo.", unit: "kilo", kg: 1, cost: 85.90, category: 9, overlap: "aros-cebolla-bolsa-907g", alsuper: "Aros De Cebolla" },
  { slug: "deditos-papa-caja-10kg", name: "Deditos de papa (caja 10 kg)", description: "Deditos de papa prefríos, congelados. Caja de 10 kg.", unit: "caja", kg: 10, cost: 61.90, category: 9, alsuper: "Papas A La Francesa Congeladas" },

  // ── PESCADO Y DERIVADOS ─────────────────────────────────────────────
  { slug: "filete-tilapia-weber", name: "Filete de tilapia", description: "Filete de tilapia congelado, sin espinas. Precio por kilo.", unit: "kilo", kg: 1, cost: 39.90, category: 4, overlap: "filete-tilapia-35", alsuper: "Filete De Tilapia" },

  // ── CAMARÓN (+5kg / +10kg / caja / +3 cajas) ───────────────────────
  { slug: "camaron-4150-mediano-weber", name: "Camarón mediano 41/50", description: "Camarón mediano crudo talla 41/50. Precio por kilo.", unit: "kilo", kg: 1, cost: 133.90, category: 4, overlap: "camaron-4150", alsuper: "Camarón Crudo Mediano" },
  { slug: "camaron-1620-gigante", name: "Camarón gigante 16/20", description: "Camarón gigante crudo talla 16/20. Precio por kilo.", unit: "kilo", kg: 1, cost: 187.90, category: 4, alsuper: "Camaron Gigante" },
  { slug: "camaron-cocido-weber", name: "Camarón cocido", description: "Camarón cocido, listo para cóctel y tostadas. Precio por kilo.", unit: "kilo", kg: 1, cost: 185.90, category: 4, overlap: "camaron-cocido-4150", alsuper: "Camaron Cocido" },

  // ── PUERCO PREMIUM (pork belly) ────────────────────────────────────
  { slug: "pork-belly-premium-tif", name: "Pork belly premium TIF", description: "Panceta de cerdo premium TIF, para hornear o asar. Precio por kilo.", unit: "kilo", kg: 1, cost: 104.90, category: 4, alsuper: "Pork Belly" },
  { slug: "pork-belly-seabord", name: "Pork belly Seabord", description: "Panceta de cerdo importada Seabord. Precio por kilo.", unit: "kilo", kg: 1, cost: 123.90, category: 4, alsuper: "Pork Belly" },

  // ── PUERCO (+5kg / +10kg / caja / +100k) — por kilo ────────────────
  { slug: "chorizo-grapa", name: "Chorizo grapa", description: "Chorizo de cerdo en grapa, para asar o guisar. Precio por kilo.", unit: "kilo", kg: 1, cost: 6.00, category: 4, alsuper: "Chorizo" },
  { slug: "al-pastor-salchicha-medio-kg", name: "Carne al pastor (salchicha 1/2 kg)", description: "Carne de cerdo adobada al pastor en presentación de medio kilo.", unit: "kilo", kg: 1, cost: 33.90, category: 4, overlap: "carne-al-pastor-100", alsuper: "Cerdo Al Pastor" },
  { slug: "al-pastor-bolsa-5kg", name: "Carne al pastor (bolsa 5 kg)", description: "Carne de cerdo adobada al pastor. Bolsa de 5 kg.", unit: "bolsa", kg: 5, cost: 67.90, category: 4, overlap: "carne-al-pastor-100", alsuper: "Cerdo Al Pastor" },
  { slug: "cuero-puerco", name: "Cuero de puerco", description: "Cuero de cerdo para chicharrón o guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 30.90, category: 4, alsuper: "Cuero De Puerco" },
  { slug: "chamorro-puerco", name: "Chamorro de puerco", description: "Chamorro de cerdo con hueso, para birria y caldos. Precio por kilo.", unit: "kilo", kg: 1, cost: 42.90, category: 4, alsuper: "Chamorro De Puerco" },
  { slug: "codillo", name: "Codillo de puerco", description: "Codillo de cerdo, para hornear o cocer. Precio por kilo.", unit: "kilo", kg: 1, cost: 50.90, category: 4, alsuper: "Codillo" },
  { slug: "costilla-back-rib-tira-larga", name: "Costilla back rib tira larga", description: "Costilla de cerdo back rib en tira larga, para asar. Precio por kilo.", unit: "kilo", kg: 1, cost: 79.90, category: 4, overlap: "costilla-back-rib", alsuper: "Costilla Parrillera" },
  { slug: "costilla-back-rib-tira-corta", name: "Costilla back rib tira corta", description: "Costilla de cerdo back rib en tira larga cortada. Precio por kilo.", unit: "kilo", kg: 1, cost: 89.90, category: 4, alsuper: "Costilla Parrillera" },
  { slug: "costilla-puerco-cargada", name: "Costilla de puerco cargada", description: "Costilla de cerdo cargada de carne. Precio por kilo.", unit: "kilo", kg: 1, cost: 112.90, category: 4, alsuper: "Costilla De Puerco" },
  { slug: "costilla-puerco-cargada-cortada", name: "Costilla de puerco cargada cortada", description: "Costilla de cerdo cargada, cortada lista para guisar. Precio por kilo.", unit: "kilo", kg: 1, cost: 125.90, category: 4, alsuper: "Costilla De Puerco" },
  { slug: "espinazo", name: "Espinazo de puerco", description: "Espinazo de cerdo para caldos y guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 29.90, category: 4, alsuper: "Espinazo" },
  { slug: "espinazo-cargado", name: "Espinazo cargado", description: "Espinazo de cerdo con más carne. Precio por kilo.", unit: "kilo", kg: 1, cost: 30.90, category: 4, alsuper: "Espinazo" },
  { slug: "corazon-puerco", name: "Corazón de puerco", description: "Corazón de cerdo, para guisos y menudería. Precio por kilo.", unit: "kilo", kg: 1, cost: 38.90, category: 4, alsuper: "Corazon De Puerco", hidden: true },
  { slug: "lomo-ahumado-chimex", name: "Lomo ahumado Chimex", description: "Lomo de cerdo ahumado, listo para rebanar. Precio por kilo.", unit: "kilo", kg: 1, cost: 79.90, category: 4, alsuper: "Lomo Ahumado" },
  { slug: "lomo-ahumado-cortado", name: "Lomo ahumado cortado", description: "Lomo de cerdo ahumado, cortado en piezas. Precio por kilo.", unit: "kilo", kg: 1, cost: 95.90, category: 4, alsuper: "Lomo Ahumado" },
  { slug: "lomo-ahumado-cubicado-1kg", name: "Lomo ahumado cubicado 1 kg", description: "Lomo ahumado en cubos, bolsa de 1 kg.", unit: "kilo", kg: 1, cost: 77.90, category: 4, alsuper: "Lomo Ahumado" },
  { slug: "lomo-natural-puerco", name: "Lomo natural de puerco", description: "Lomo de cerdo natural, sin adobo. Precio por kilo.", unit: "kilo", kg: 1, cost: 65.90, category: 4, alsuper: "Lomo De Puerco" },
  { slug: "lomo-natural-cortado", name: "Lomo natural cortado", description: "Lomo de cerdo natural en piezas. Precio por kilo.", unit: "kilo", kg: 1, cost: 79.90, category: 4, alsuper: "Lomo De Puerco" },
  { slug: "manitas-puerco", name: "Manitas de puerco", description: "Manitas de cerdo para cocido y vinagre. Precio por kilo.", unit: "kilo", kg: 1, cost: 36.90, category: 4, alsuper: "Manitas De Puerco" },
  { slug: "manteca-puerco", name: "Manteca de puerco", description: "Manteca de cerdo refinada, para cocinar. Precio por kilo.", unit: "kilo", kg: 1, cost: 35.90, category: 2, alsuper: "Manteca De Cerdo" },
  { slug: "morcon", name: "Morcón", description: "Morcón de cerdo, embutido para guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 72.90, category: 4, alsuper: "Morcon" },
  { slug: "tocino-cubicado-1kg", name: "Tocino cubicado 1 kg", description: "Tocino de cerdo en cubos de 0.5x0.5, bolsa de 1 kg.", unit: "kilo", kg: 1, cost: 75.90, category: 4, alsuper: "Tocino" },
  { slug: "tocino-rebanado", name: "Tocino rebanado", description: "Tocino de cerdo en rebanadas. Precio por kilo.", unit: "kilo", kg: 1, cost: 126.90, category: 4, alsuper: "Tocino Rebanado" },
  { slug: "tripa-puerco", name: "Tripa de puerco", description: "Tripa de cerdo limpia, para guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 39.90, category: 4, alsuper: "Tripa De Puerco" },
  { slug: "chicharron-pella", name: "Chicharrón pella", description: "Chicharrón de cerdo con pella, botana y guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 123.90, category: 4, alsuper: "Chicharron" },
  { slug: "chicharron-prensado", name: "Chicharrón prensado", description: "Chicharrón prensado de cerdo, para guisos y salsas. Precio por kilo.", unit: "kilo", kg: 1, cost: 159.90, category: 4, alsuper: "Chicharron Prensado" },
  { slug: "pierna-puerco-natural", name: "Pierna de puerco natural", description: "Pulpa de pierna de cerdo natural. Precio por kilo.", unit: "kilo", kg: 1, cost: 62.90, category: 4, alsuper: "Pierna De Puerco" },
  { slug: "pierna-puerco-natural-cortada", name: "Pierna de puerco natural cortada", description: "Pulpa de pierna de cerdo natural, cortada. Precio por kilo.", unit: "kilo", kg: 1, cost: 66.90, category: 4, alsuper: "Pierna De Puerco" },
  { slug: "pierna-puerco-cubicada", name: "Pierna de puerco natural cubicada", description: "Pulpa de pierna de cerdo en cubos, para guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 72.90, category: 4, alsuper: "Pierna De Puerco" },

  // ── MOLIDAS (+5kg / 1-2 caja / caja / +100kg) — por kilo ───────────
  { slug: "carne-molida-90-10", name: "Carne molida 90/10", description: "Carne molida de res 90/10, extra magra. Precio por kilo.", unit: "kilo", kg: 1, cost: 115.90, category: 4, alsuper: "Carne Molida De Res" },
  { slug: "carne-molida-pulpa-natural", name: "Carne molida de pulpa natural", description: "Carne molida de pulpa natural de res. Precio por kilo.", unit: "kilo", kg: 1, cost: 126.90, category: 4, alsuper: "Carne Molida De Res" },
  { slug: "carne-molida-pulpa-extralimp", name: "Carne molida de pulpa natural extralimpia", description: "Carne molida de pulpa natural extra limpia. Precio por kilo.", unit: "kilo", kg: 1, cost: 135.90, category: 4, alsuper: "Carne Molida De Res" },
  { slug: "pescuezo-res-deshuesado", name: "Pescuezo de res deshuesado", description: "Pescuezo de res deshuesado, para barbacoa y birria. Precio por kilo.", unit: "kilo", kg: 1, cost: 135.90, category: 4, alsuper: "Pescuezo De Res" },
  { slug: "carne-molida-economica", name: "Carne molida económica", description: "Carne molida de res económica, para guisos de volumen. Precio por kilo.", unit: "kilo", kg: 1, cost: 93.90, category: 4, alsuper: "Carne Molida De Res" },
  { slug: "carne-molida-especial", name: "Carne molida especial", description: "Carne molida de res especial, para hamburguesas y guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 123.90, category: 4, alsuper: "Carne Molida De Res" },
  { slug: "carne-molida-de-pulpa", name: "Carne molida de pulpa", description: "Carne molida 100% pulpa de res. Precio por kilo.", unit: "kilo", kg: 1, cost: 136.90, category: 4, alsuper: "Carne Molida De Res" },

  // ── PULPAS (+5kg / +10kg / caja / +100kg) — por kilo ───────────────
  { slug: "pulpa-bola", name: "Pulpa bola", description: "Pulpa bola de res, para asar, milanesa o guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 146.90, category: 4, alsuper: "Pulpa Bola" },
  { slug: "pulpa-negra", name: "Pulpa negra", description: "Pulpa negra de res, corte suave para asar. Precio por kilo.", unit: "kilo", kg: 1, cost: 146.90, category: 4, alsuper: "Pulpa Negra" },
  { slug: "pulpa-alto-vacio", name: "Pulpas alto vacío (bola o negra)", description: "Pulpa de res al alto vacío, bola o negra. Precio por kilo.", unit: "kilo", kg: 1, cost: 172.90, category: 4, alsuper: "Pulpa De Res" },
  { slug: "pulpa-bola-negra-natural", name: "Pulpa bola o negra natural", description: "Pulpa de res natural, bola o negra. Precio por kilo.", unit: "kilo", kg: 1, cost: 161.90, category: 4, alsuper: "Pulpa De Res" },
  { slug: "pulpa-sirloin-cubicada-1x1", name: "Pulpa de sirloin cubicada 1x1", description: "Pulpa de sirloin de res en cubos de 1x1, para brochetas y guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 165.90, category: 4, alsuper: "Sirloin Cubicado" },
  { slug: "pulpa-milanesa", name: "Pulpa milanesa", description: "Pulpa de res en corte milanesa, delgada para empanizar. Precio por kilo.", unit: "kilo", kg: 1, cost: 188.90, category: 4, alsuper: "Milanesa De Res" },

  // ── BARBACOAS (+5kg / +10kg / caja / +3 caja) — por kilo ───────────
  { slug: "cabeza-res-deshuesada", name: "Cabeza de res deshuesada", description: "Cabeza de res deshuesada, para barbacoa. Precio por kilo.", unit: "kilo", kg: 1, cost: 80.90, category: 4, alsuper: "Cabeza De Res" },
  { slug: "cachete-res", name: "Cachete de res", description: "Cachete de res, para barbacoa y birria. Precio por kilo.", unit: "kilo", kg: 1, cost: 128.90, category: 4, alsuper: "Cachete De Res" },
  { slug: "pescuezo-res-con-hueso", name: "Pescuezo de res con hueso", description: "Pescuezo de res con hueso, para caldos. Precio por kilo.", unit: "kilo", kg: 1, cost: 136.90, category: 4, alsuper: "Pescuezo De Res" },
  { slug: "labio-res", name: "Labio de res", description: "Labio de res para barbacoa y tacos. Precio por kilo.", unit: "kilo", kg: 1, cost: 172.90, category: 4, alsuper: "Labio De Res" },

  // ── POZOLERÍAS / MENUDERÍAS (+5kg / +10kg / caja / +100kg) ─────────
  { slug: "pozole-dona-conchita-10pzs", name: "Pozole Doña Conchita (10 pzs)", description: "Pozole preparado Doña Conchita, paquete de 10 piezas.", unit: "paquete", kg: 2.5, cost: 17.90, category: 4, alsuper: "Pozole" },
  { slug: "menudo-mexicano", name: "Menudo mexicano", description: "Menudo de res estilo mexicano, limpio. Precio por kilo.", unit: "kilo", kg: 1, cost: 64.90, category: 4, alsuper: "Menudo De Res" },
  { slug: "menudo-mexicano-cortado", name: "Menudo mexicano cortado", description: "Menudo de res mexicano, cortado listo para cocer. Precio por kilo.", unit: "kilo", kg: 1, cost: 64.90, category: 4, alsuper: "Menudo De Res" },
  { slug: "menudo-americano", name: "Menudo americano", description: "Menudo de res estilo americano. Precio por kilo.", unit: "kilo", kg: 1, cost: 89.90, category: 4, alsuper: "Menudo De Res" },
  { slug: "menudo-americano-cortado", name: "Menudo americano cortado", description: "Menudo americano cortado, listo para cocer. Precio por kilo.", unit: "kilo", kg: 1, cost: 94.90, category: 4, alsuper: "Menudo De Res" },
  { slug: "pata-res", name: "Pata de res", description: "Pata de res para menudo y caldos. Precio por kilo.", unit: "kilo", kg: 1, cost: 60.00, category: 4, alsuper: "Pata De Res" },
  { slug: "zancarron", name: "Zancarrón", description: "Zancarrón de res con hueso, para caldos. Precio por kilo.", unit: "kilo", kg: 1, cost: 49.00, category: 4, alsuper: "Zancarron" },
  { slug: "hueso-menudo", name: "Hueso para menudo", description: "Hueso de res para menudo y caldos. Precio por kilo.", unit: "kilo", kg: 1, cost: 23.90, category: 4, alsuper: "Hueso De Res" },
  { slug: "tripa-res-americana-1361", name: "Tripa de res americana (13.61)", description: "Tripa de res americana, limpia. Caja de 13.61 kg.", unit: "caja", kg: 13.61, cost: 63.90, category: 4, alsuper: "Tripa De Res" },

  // ── MASCOTAS (ocultos por default) ─────────────────────────────────
  { slug: "alimento-perro-bolsa-2kg", name: "Alimento para perro (bolsa 2 kg)", description: "Alimento seco para perro, bolsa de 2 kg.", unit: "bolsa", kg: 2, cost: 17.90, category: 2, alsuper: "Alimento Para Perro", hidden: true },
  { slug: "premio-hueso-porky", name: "Premio hueso porky", description: "Premio para perro sabor cerdo, hueso masticable.", unit: "pieza", kg: 0.25, cost: 17.90, category: 2, alsuper: "Premio Para Perro", hidden: true },

  // ── ENGORDAS PIEZAS (+5kg / pieza / caja / +3 cajas) — por kilo ────
  { slug: "costilla-tracera-engorda", name: "Costilla tracera (engorda)", description: "Costilla tracera de res para engorda. Precio por kilo.", unit: "kilo", kg: 1, cost: 103.90, category: 4, alsuper: "Costilla De Res" },
  { slug: "costilla-cargada-prime", name: "Costilla cargada prime", description: "Costilla cargada de res calidad prime. Precio por kilo.", unit: "kilo", kg: 1, cost: 159.90, category: 4, alsuper: "Costilla De Res Prime" },
  { slug: "paleta-engorda", name: "Paleta (engorda)", description: "Paleta de res para engorda, para deshebrar. Precio por kilo.", unit: "kilo", kg: 1, cost: 127.90, category: 4, alsuper: "Paleta De Res" },
  { slug: "aguja-engorda", name: "Aguja (engorda)", description: "Aguja de res para engorda, para guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 141.90, category: 4, alsuper: "Aguja De Res" },
  { slug: "diezmillo-c-h-engorda", name: "Diezmillo c/h (engorda)", description: "Diezmillo de res con hueso, para engorda. Precio por kilo.", unit: "kilo", kg: 1, cost: 141.90, category: 4, alsuper: "Diezmillo" },
  { slug: "lomo-engorda-premium", name: "Lomo engorda premium", description: "Lomo de res premium para engorda. Precio por kilo.", unit: "kilo", kg: 1, cost: 165.90, category: 4, alsuper: "Lomo De Res" },
  { slug: "t-bone-engorda", name: "T-bone (engorda)", description: "T-bone de res para engorda. Precio por kilo.", unit: "kilo", kg: 1, cost: 174.90, category: 4, alsuper: "T-Bone" },

  // ── CHULETAS (+5kg / +10kg / caja / +3 cajas) — por kilo ───────────
  { slug: "costilla-tracera-chuleta", name: "Costilla tracera (chuletas)", description: "Costilla tracera de res. Precio por kilo.", unit: "kilo", kg: 1, cost: 108.90, category: 4, alsuper: "Costilla De Res" },
  { slug: "costilla-cargada-delantera", name: "Costilla cargada delantera", description: "Costilla cargada delantera de res. Precio por kilo.", unit: "kilo", kg: 1, cost: 171.90, category: 4, alsuper: "Costilla De Res" },
  { slug: "chuleta-cero", name: "Chuleta cero", description: "Chuleta de cerdo cero, para asar. Precio por kilo.", unit: "kilo", kg: 1, cost: 130.90, category: 4, alsuper: "Chuleta De Puerco" },
  { slug: "chuleta-siete", name: "Chuleta siete", description: "Chuleta de cerdo siete, con hueso. Precio por kilo.", unit: "kilo", kg: 1, cost: 143.25, category: 4, alsuper: "Chuleta De Puerco" },
  { slug: "diezmillo-c-h-chuleta", name: "Diezmillo c/h", description: "Diezmillo de res con hueso. Precio por kilo.", unit: "kilo", kg: 1, cost: 143.90, category: 4, alsuper: "Diezmillo" },
  { slug: "chuleta-lomo", name: "Chuleta lomo", description: "Chuleta de lomo de cerdo. Precio por kilo.", unit: "kilo", kg: 1, cost: 177.97, category: 4, alsuper: "Chuleta De Puerco" },
  { slug: "t-bone-engorda-premium", name: "T-bone engorda premium", description: "T-bone de res premium para engorda. Precio por kilo.", unit: "kilo", kg: 1, cost: 173.00, category: 4, alsuper: "T-Bone" },
  { slug: "porter-house", name: "Porter house", description: "Corte porter house de res, para parrilla. Precio por kilo.", unit: "kilo", kg: 1, cost: 195.90, category: 4, alsuper: "Porterhouse" },
  { slug: "tomahawk", name: "Tomahawk", description: "Tomahawk de res con hueso largo, para parrilla. Precio por kilo.", unit: "kilo", kg: 1, cost: 195.90, category: 4, alsuper: "Tomahawk" },
  { slug: "rib-eye", name: "Rib eye", description: "Rib eye de res, para parrilla. Precio por kilo.", unit: "kilo", kg: 1, cost: 269.90, category: 4, alsuper: "Rib Eye" },
  { slug: "tuetano-hueso-cortar", name: "Tuétano hueso para cortar", description: "Hueso de res con tuétano, para cortar. Precio por kilo.", unit: "kilo", kg: 1, cost: 44.90, category: 4, alsuper: "Tuetano" },
  { slug: "tuetano-hueso-canoa", name: "Tuétano hueso canoa", description: "Hueso canoa de res con tuétano, para asar. Precio por kilo.", unit: "kilo", kg: 1, cost: 53.90, category: 4, alsuper: "Tuetano" },

  // ── COCIDOS Y DESEBRADAS (+5kg / +10kg / caja / +3 caja) — por kilo ─
  { slug: "chamberete", name: "Chamberete", description: "Chamberete de res, para cocido y deshebrar. Precio por kilo.", unit: "kilo", kg: 1, cost: 110.90, category: 4, alsuper: "Chamberete" },
  { slug: "chamberete-cortado", name: "Chamberete cortado", description: "Chamberete de res cortado, para guisos. Precio por kilo.", unit: "kilo", kg: 1, cost: 129.90, category: 4, alsuper: "Chamberete" },
  { slug: "cicido-rabo", name: "Cocido de rabo", description: "Rabo de res para cocido. Precio por kilo.", unit: "kilo", kg: 1, cost: 102.90, category: 4, alsuper: "Rabo De Res" },
  { slug: "desebrada-aldilla", name: "Deshebrada aldilla", description: "Carne de res aldilla para deshebrar. Precio por kilo.", unit: "kilo", kg: 1, cost: 169.90, category: 4, alsuper: "Deshebrada De Res" },
  { slug: "suadero", name: "Suadero", description: "Suadero de res, para tacos. Precio por kilo.", unit: "kilo", kg: 1, cost: 147.90, category: 4, alsuper: "Suadero" },
  { slug: "brisket-deshuesado", name: "Brisket deshuesado", description: "Brisket de res deshuesado, para ahumar. Precio por kilo.", unit: "kilo", kg: 1, cost: 158.90, category: 4, alsuper: "Brisket" },
  { slug: "cocido-pecho-c-h", name: "Cocido de pecho c/h", description: "Pecho de res con hueso, para cocido. Precio por kilo.", unit: "kilo", kg: 1, cost: 98.90, category: 4, alsuper: "Pecho De Res" },

  // ── HAMBURGUESAS (3 bolsa / 10 bolsa / caja / +3 cajas) — por pieza ─
  { slug: "carne-hamburguesa-sirloin-900g", name: "Carne para hamburguesa sirloin (900 g)", description: "Carne para hamburguesa de sirloin, paquete de 900 g.", unit: "paquete", kg: 0.9, cost: 118.90, category: 4, alsuper: "Carne Para Hamburguesa" },
  { slug: "carne-hamburguesa-arrachera-900g", name: "Carne para hamburguesa arrachera (900 g)", description: "Carne para hamburguesa de arrachera, paquete de 900 g.", unit: "paquete", kg: 0.9, cost: 118.90, category: 4, alsuper: "Carne Para Hamburguesa" },
  { slug: "carne-hamburguesa-san-francisco-12kg", name: "Carne para hamburguesa San Francisco (1.2 kg)", description: "Carne para hamburguesa San Francisco, paquete de 1.2 kg.", unit: "paquete", kg: 1.2, cost: 91.90, category: 4, alsuper: "Carne Para Hamburguesa" },
]
