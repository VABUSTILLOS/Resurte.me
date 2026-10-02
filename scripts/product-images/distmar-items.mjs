#!/usr/bin/env node
// Transcripción de la lista de Distmar (foto "Distmar Lista de precios",
// oct-2026). Mismo formato que weber-items.mjs:
// { slug, name, description, unit, kg, cost, category, overlap?, alsuper?, hidden? }
//
// cost = por kilo (marisco) o por caja convertida (papas: 6 pzs × 2.27 kg =
// 13.62 kg; rejilla 4.5 lb = 12.25 kg; camote 2.5 lb = 6.80 kg). `kg` es el
// contenido de la presentación de venta en la tienda.
// overlap = slug del producto existente: se agrega Distmar como proveedor
// alterno y compite por is_primary (menor costo/kg).

export const DISTMAR_ITEMS = [
  // ── CAMARONES (caja 20 kg, costo por kg) ────────────────────────────
  { slug: "camaron-cabeza-2030", name: "Camarón con cabeza 20/30", description: "Camarón con cabeza talla 20/30, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 180.00, category: 4, alsuper: "Camaron Con Cabeza" },
  { slug: "camaron-1620", name: "Camarón 16/20", description: "Camarón crudo talla 16/20, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 194.00, category: 4, overlap: "camaron-1620-gigante", alsuper: "Camaron Gigante" },
  { slug: "camaron-2125", name: "Camarón 21/25", description: "Camarón crudo talla 21/25, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 174.00, category: 4, alsuper: "Camaron Grande" },
  { slug: "camaron-2630", name: "Camarón 26/30", description: "Camarón crudo talla 26/30, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 155.00, category: 4, alsuper: "Camaron Mediano" },
  { slug: "camaron-3135", name: "Camarón 31/35", description: "Camarón crudo talla 31/35, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 145.00, category: 4, alsuper: "Camaron Mediano" },
  { slug: "camaron-3640", name: "Camarón 36/40", description: "Camarón crudo talla 36/40, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 142.00, category: 4, alsuper: "Camaron Mediano" },
  { slug: "camaron-4150-distmar", name: "Camarón 41/50 (Distmar)", description: "Camarón crudo talla 41/50, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 130.00, category: 4, overlap: "camaron-4150", alsuper: "Camarón Crudo Mediano" },
  { slug: "camaron-5160", name: "Camarón 51/60", description: "Camarón crudo talla 51/60, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 124.00, category: 4, alsuper: "Camaron Chico" },
  { slug: "camaron-6170", name: "Camarón 61/70", description: "Camarón crudo talla 61/70, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 115.00, category: 4, alsuper: "Camaron Chico" },
  { slug: "camaron-7190", name: "Camarón 71/90", description: "Camarón crudo talla 71/90, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 107.00, category: 4, alsuper: "Camaron Chico" },

  // ── PESCADOS Y OTROS MARISCOS ───────────────────────────────────────
  { slug: "filete-tilapia-100-distmar", name: "Filete tilapia 3-5 100%", description: "Filete de tilapia 3-5 100% sin glaseo, caja de 4.54 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 80.00, category: 4, overlap: "filete-tilapia-35", alsuper: "Filete De Tilapia" },
  { slug: "filete-guitarra", name: "Filete de guitarra", description: "Filete de pescado guitarra, bulto de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 70.00, category: 4, alsuper: "Filete De Pescado" },
  { slug: "filete-tilapia-comercial-50", name: "Filete de tilapia comercial 50%", description: "Filete de tilapia comercial 50% glaseo, caja de 4.54 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 44.99, category: 4, alsuper: "Filete De Tilapia" },
  { slug: "mojarra-importada", name: "Pescado mojarra importada", description: "Mojarra importada entera, caja de 10 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 60.00, category: 4, alsuper: "Mojarra" },
  { slug: "pulpo-12", name: "Pulpo 1-2", description: "Pulpo talla 1-2, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 180.00, category: 4, alsuper: "Pulpo" },
  { slug: "pulpo-24", name: "Pulpo 2-4", description: "Pulpo talla 2-4, caja de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 200.00, category: 4, alsuper: "Pulpo" },
  { slug: "pulpo-cocido-picado-500g", name: "Pulpo cocido picado (500 g)", description: "Pulpo cocido y picado, pieza de 500 g. Listo para coctel o tostadas.", unit: "pieza", kg: 0.5, cost: 214.99, category: 4, alsuper: "Pulpo Cocido" },
  { slug: "calamar-lonja-filete", name: "Calamar lonja o filete", description: "Calamar en lonja o filete, bulto de 20 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 79.99, category: 4, alsuper: "Calamar" },
  { slug: "medallon-atun-mexicano", name: "Medallón de atún mexicano rebanado", description: "Medallón de atún mexicano rebanado, caja de 15 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 165.00, category: 4, alsuper: "Atun Fresco" },
  { slug: "filete-salmon-premium", name: "Filete de salmón premium", description: "Filete de salmón premium, caja de 10 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 289.99, category: 4, alsuper: "Filete De Salmon" },
  { slug: "atun-saku", name: "Atún saku", description: "Atún saku en bloque (grado sashimi), caja de 4.54 kg. Precio por kilo.", unit: "kilo", kg: 1, cost: 199.99, category: 4, alsuper: "Atun Saku" },

  // ── PAPAS Y COMPLEMENTOS (costo por CAJA 6 pzs × 2.27 kg = 13.62 kg) ─
  // kg = contenido de la presentación de venta en la tienda (caja completa).
  { slug: "papa-gajo-sazonada-caja-1362kg", name: "Papa gajo sazonada (caja 13.62 kg)", description: "Papa gajo sazonada congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 739.99, category: 9, overlap: "papa-gajo-10-cut-65-caja-1361kg", alsuper: "Papas Gajo Congeladas" },
  { slug: "papa-ondulada-caja-1362kg", name: "Papa ondulada (caja 13.62 kg)", description: "Papa ondulada congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 509.99, category: 9, overlap: "papa-ondulada-38-payette-caja-1361kg", alsuper: "Papas Onduladas Congeladas" },
  { slug: "papa-recta-516-caja-1362kg", name: "Papa recta 5/16 (caja 13.62 kg)", description: "Papa recta 5/16 congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 617.99, category: 9, overlap: "papa-select-516-sc-caja-1361kg", alsuper: "Papas A La Francesa Congeladas" },
  { slug: "papa-rejilla-45lb-caja", name: "Papa rejilla 4.5 lb (caja)", description: "Papa rejilla congelada, bolsa de 4.5 lb. Caja con 6 bolsas (12.25 kg).", unit: "caja", kg: 12.25, cost: 679.99, category: 9, overlap: "papa-rejilla-savory-caja-1224kg", alsuper: "Papas Rejilla" },
  { slug: "papa-recta-14-surecrisp-caja-1362kg", name: "Papa recta 1/4 SureCrisp (caja 13.62 kg)", description: "Papa recta 1/4 SureCrisp congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 635.94, category: 9, overlap: "papa-conquest-14-caja-1633kg", alsuper: "Papas A La Francesa Congeladas" },
  { slug: "papa-recta-38-caja-1362kg", name: "Papa recta 3/8 (caja 13.62 kg)", description: "Papa recta 3/8 congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 509.99, category: 9, overlap: "papa-select-38-sc-caja-1361kg", alsuper: "Papas A La Francesa Congeladas" },
  { slug: "papa-recta-38-max-sucri-caja-1362kg", name: "Papa recta 3/8 MAX SureCrisp (caja 13.62 kg)", description: "Papa recta 3/8 MAX SureCrisp congelada, bolsa de 2.27 kg. Caja con 6 bolsas (13.62 kg).", unit: "caja", kg: 13.62, cost: 575.99, category: 9, overlap: "papa-conquest-delivery-38-sc-caja-1361kg", alsuper: "Papas A La Francesa Congeladas" },
  { slug: "aros-cebolla-brew-city-caja", name: "Aros de cebolla Brew City (caja 12 pzs)", description: "Aros de cebolla empanizados Brew City, pieza de 2 lb. Caja con 12 piezas (10.89 kg).", unit: "caja", kg: 10.89, cost: 1043.98, category: 9, overlap: "aros-cebolla-bolsa-907g", alsuper: "Aros De Cebolla" },
  { slug: "dedos-queso-caja-1088kg", name: "Dedos de queso (caja 6 pzs)", description: "Dedos de queso empanizados, pieza de 1.814 kg. Caja con 6 piezas (10.88 kg).", unit: "caja", kg: 10.88, cost: 1499.94, category: 9, overlap: "dedos-queso-bolsa-181kg", alsuper: "Dedos De Queso" },
  { slug: "papa-camote-caja-68kg", name: "Papa camote (caja 6.8 kg)", description: "Papa camote congelada, bolsa de 2.5 lb. Caja con 6 bolsas (6.80 kg).", unit: "caja", kg: 6.80, cost: 479.99, category: 9, overlap: "papa-dulce-recta-38-caja-680kg", alsuper: "Camote Congelado" },
]
