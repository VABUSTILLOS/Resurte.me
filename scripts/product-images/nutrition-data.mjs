#!/usr/bin/env node
// Datos nutrimentales y beneficios para las infografías (segunda imagen).
//
// Valores APROXIMADOS por 100 g, de tablas estándar (USDA FoodData Central).
// La plantilla lo dice en la imagen: no son análisis de laboratorio por SKU,
// son los valores típicos del tipo de producto.
//
// Resolución: exacto por slug > regla por patrón (regex sobre slug) >
// fallback por categoría. Cada entrada: [kcal, proteína g, grasas g,
// carbohidratos g, beneficios[4], iconos[4]].
// Iconos disponibles: corazon, hoja, escudo, gota, musculo, hueso, ojo, rayo.

const B = {
  antioxidantes: ["Antioxidantes naturales", "hoja"],
  vitaminaC: ["Rico en vitamina C", "escudo"],
  vitaminaK: ["Fuente de vitamina K", "hoja"],
  fibra: ["Alto en fibra", "hoja"],
  digestion: ["Apoya la digestión", "gota"],
  hierro: ["Fuente de hierro", "rayo"],
  potasio: ["Rico en potasio", "corazon"],
  corazon: ["Amigo del corazón", "corazon"],
  proteinas: ["Alto en proteína", "musculo"],
  bajoCal: ["Bajo en calorías", "hoja"],
  energia: ["Energía natural", "rayo"],
  huesos: ["Apoya huesos fuertes", "hueso"],
  ojos: ["Apoya la vista", "ojo"],
  calcio: ["Fuente de calcio", "hueso"],
  omega3: ["Fuente de omega-3", "corazon"],
  inmune: ["Apoya defensas", "escudo"],
  b12: ["Fuente de vitamina B12", "rayo"],
  zinc: ["Fuente de zinc", "escudo"],
  hidrata: ["Alto contenido de agua", "gota"],
  saciedad: ["Ayuda a la saciedad", "musculo"],
  usoDesinfeccion: ["Desinfección profunda", "escudo"],
  usoLimpieza: ["Limpieza efectiva", "gota"],
  usoCocina: ["Esencial en cocina", "hoja"],
  usoRinde: ["Rendimiento alto", "rayo"],
  usoAlimentos: ["Conserva alimentos", "hoja"],
  usoPractico: ["Práctico y desechable", "escudo"],
  usoResistente: ["Resistente y durable", "escudo"],
  usoHigiene: ["Higiene garantizada", "gota"],
}

const b = (...keys) => keys.map((k) => B[k])

// ── Por tipo de producto ────────────────────────────────────────────────────
const TIPOS = {
  // Frutas y verduras
  verduraHoja: [25, 2.5, 0.4, 3.5, b("vitaminaK", "antioxidantes", "bajoCal", "hierro")],
  frutaDulce: [60, 0.8, 0.3, 14.5, b("vitaminaC", "fibra", "hidrata", "energia")],
  frutaCitrica: [40, 0.9, 0.2, 9.5, b("vitaminaC", "inmune", "hidrata", "antioxidantes")],
  hortaliza: [30, 1.5, 0.2, 6, b("fibra", "vitaminaC", "bajoCal", "antioxidantes")],
  chileFresco: [35, 1.8, 0.4, 6.5, b("vitaminaC", "antioxidantes", "bajoCal", "inmune")],
  hierbaAroma: [40, 3, 0.8, 6, b("vitaminaK", "antioxidantes", "hierro", "digestion")],
  raiz: [45, 1.2, 0.2, 10, b("fibra", "potasio", "bajoCal", "antioxidantes")],

  // Carnes (crudas, por tipo de corte)
  resMagra: [180, 26, 8, 0, b("proteinas", "hierro", "b12", "zinc")],
  resRegular: [230, 24, 14, 0, b("proteinas", "b12", "zinc", "hierro")],
  resGrasa: [290, 20, 22, 0, b("proteinas", "b12", "zinc", "energia")],
  cerdoMagro: [190, 26, 9, 0, b("proteinas", "zinc", "b12", "hierro")],
  cerdoGraso: [300, 18, 24, 0, b("proteinas", "b12", "energia", "zinc")],
  pollo: [150, 24, 5, 0, b("proteinas", "bajoCal", "saciedad", "b12")],
  polloEmpanizado: [260, 15, 14, 18, b("proteinas", "energia", "saciedad", "hierro")],
  embutido: [320, 14, 28, 2, b("proteinas", "energia", "b12", "zinc")],

  // Pescados y mariscos
  pescadoBlanco: [95, 20, 1.5, 0, b("proteinas", "bajoCal", "omega3", "saciedad")],
  pescadoGraso: [210, 22, 13, 0, b("omega3", "proteinas", "b12", "corazon")],
  camaron: [85, 18, 1, 0.5, b("proteinas", "bajoCal", "omega3", "zinc")],
  pulpoCalamar: [80, 16, 1, 2, b("proteinas", "bajoCal", "hierro", "b12")],

  // Congelados (papas y frituras)
  papaCongelada: [160, 2.5, 5, 25, b("energia", "potasio", "saciedad", "bajoCal")],
  botanaCongelada: [300, 5, 17, 33, b("energia", "saciedad", "proteinas", "hierro")],

  // Abarrotes
  grano: [350, 10, 2, 70, b("energia", "fibra", "saciedad", "hierro")],
  leguminosa: [340, 22, 1.5, 60, b("proteinas", "fibra", "hierro", "saciedad")],
  especia: [280, 10, 8, 55, b("antioxidantes", "hierro", "fibra", "digestion")],
  semilla: [560, 20, 48, 18, b("omega3", "proteinas", "fibra", "corazon")],
  nuez: [640, 15, 60, 14, b("corazon", "omega3", "proteinas", "antioxidantes")],
  azucar: [390, 0, 0, 99, b("energia", "saciedad", "hidrata", "digestion")],
  endulzante: [380, 0, 0, 95, b("energia", "saciedad", "hidrata", "digestion")],
  oleaginosa: [884, 0, 100, 0, b("energia", "corazon", "saciedad", "hidrata")],

  // Lácteos
  quesoCrema: [250, 6, 24, 3, b("calcio", "proteinas", "huesos", "energia")],

  // Bebidas y otros
  refresco: [42, 0, 0, 10.6, b("hidrata", "energia", "bajoCal", "digestion")],
  cerveza: [43, 0.5, 0, 3.6, b("hidrata", "energia", "bajoCal", "digestion")],
  agua: [0, 0, 0, 0, b("hidrata", "bajoCal", "digestion", "energia")],
  jugo: [45, 0.6, 0.1, 10.5, b("vitaminaC", "hidrata", "energia", "antioxidantes")],
  cafe: [2, 0.3, 0, 0, b("energia", "antioxidantes", "digestion", "b12")],
  pan: [265, 9, 3.2, 49, b("energia", "fibra", "saciedad", "hierro")],
  tortilla: [218, 5.7, 2.8, 44, b("energia", "calcio", "fibra", "saciedad")],
  queso: [350, 24, 27, 2, b("calcio", "proteinas", "huesos", "energia")],
  leche: [60, 3.2, 3.3, 4.8, b("calcio", "huesos", "proteinas", "b12")],
  huevo: [143, 12.6, 9.5, 0.7, b("proteinas", "b12", "ojos", "saciedad")],
  yogurt: [61, 3.5, 3.3, 4.7, b("digestion", "calcio", "proteinas", "huesos")],
  mantequilla: [717, 0.9, 81, 0.1, b("energia", "ojos", "huesos", "saciedad")],
  salsa: [60, 1.5, 1, 11, b("bajoCal", "antioxidantes", "vitaminaC", "energia")],
  vinagre: [18, 0, 0, 0.9, b("bajoCal", "digestion", "energia", "antioxidantes")],
  chocolate: [480, 5, 22, 60, b("energia", "antioxidantes", "hierro", "saciedad")],
  chocolateMesa: [480, 5, 22, 60, b("energia", "antioxidantes", "hierro", "saciedad")],
  miel: [304, 0.3, 0, 82, b("energia", "antioxidantes", "inmune", "digestion")],
  helado: [207, 3.5, 11, 24, b("calcio", "energia", "huesos", "saciedad")],
  botana: [520, 7, 30, 52, b("energia", "saciedad", "proteinas", "fibra")],
  limpiezaProd: [0, 0, 0, 0, b("usoDesinfeccion", "usoLimpieza", "usoRinde", "usoHigiene")],
  empaqueProd: [0, 0, 0, 0, b("usoAlimentos", "usoPractico", "usoResistente", "usoCocina")],
}

// ── Reglas por patrón de slug (la primera que coincide gana) ────────────────
const REGLAS = [
  // Limpieza y empaques (no comestibles: beneficios de uso)
  [/^(cloro|jabon|detergente|desengrasante|limpiador|limpiavidrios|fibras|bolsas-de-basura|guantes|lavatrastes|fibra-lavado|toalla-papel|papel-higienico)/, TIPOS.limpiezaProd],
  [/^(servilleta|contenedor|bolsa-basura|bolsa-kraft|papel-aluminio|papel-envolver|vaso-|tapa-|recipiente-salsa|pelicula|tenedor|cuchara|portavasos|servilletas|papel-de-cocina)/, TIPOS.empaqueProd],
  // Bebidas
  [/coca-cola|sprite|fanta|sidral|refresco/, TIPOS.refresco],
  [/cerveza|tequila|ron-blanco|licor/, TIPOS.cerveza],
  [/agua-bonafont|agua-mineral/, TIPOS.agua],
  [/jugo|concentrado/, TIPOS.jugo],
  [/cafe/, TIPOS.cafe],
  // Pan y tortillas
  [/pan-|pan$|masa-para-tamal|hoja-de-maiz/, TIPOS.pan],
  [/tortilla/, TIPOS.tortilla],
  // Lácteos
  [/queso-crema/, TIPOS.quesoCrema],
  [/queso/, TIPOS.queso],
  [/leche|media-crema|crema-acida|crema-para-batir/, TIPOS.leche],
  [/yogurt|yogur/, TIPOS.yogurt],
  [/mantequilla/, TIPOS.mantequilla],
  [/huevo/, TIPOS.huevo],
  // Salsas y condimentos
  [/salsa|catsup|mayonesa|mostaza|aderezo|mole/, TIPOS.salsa],
  [/vinagre/, TIPOS.vinagre],
  // Botanas y dulces
  [/sabritas|totopos|galletas|chispas/, TIPOS.botana],
  [/chocolate/, TIPOS.chocolate],
  [/miel/, TIPOS.miel],
  [/helado|paletas/, TIPOS.helado],
  // Aceites
  [/aceite|manteca/, TIPOS.oleaginosa],

  // Camarones (todas las tallas)
  [/^camaron/, TIPOS.camaron],
  // Pescados
  [/tilapia|mojarra|guitarra/, TIPOS.pescadoBlanco],
  [/salmon|atun/, TIPOS.pescadoGraso],
  [/pulpo|calamar/, TIPOS.pulpoCalamar],
  // Pollo
  [/pechuga.*emp|nugget|boneless|tender|cordon|kfc|pollo-empanizado|hamburguesa-empanizada/, TIPOS.polloEmpanizado],
  [/pechuga|muslo|alita|pollo-entero/, TIPOS.pollo],
  // Res
  [/rib-eye|tomahawk|porter|t-bone|arrachera|hamburguesa-bm|carne-hamburguesa/, TIPOS.resGrasa],
  [/brisket|chamberete|suadero|desebrada|cocido|cicido/, TIPOS.resRegular],
  [/molida|pulpa|milanesa|diezmillo|costilla-tracera|costilla-cargada|paleta|aguja|lomo-engorda/, TIPOS.resMagra],
  [/cabeza|cachete|pescuezo|labio|menudo|tripa|pata|zancarron|hueso|pozole/, TIPOS.resRegular],
  // Cerdo
  [/chicharron|tocino|pork-belly|costilla.*puerco|costilla-back|chamorro|codillo|espinazo|manitas|cuero|morcon/, TIPOS.cerdoGraso],
  [/chorizo|pastor/, TIPOS.embutido],
  [/lomo|pierna|chuleta/, TIPOS.cerdoMagro],
  [/tuetano/, TIPOS.cerdoGraso],
  // Papas congeladas
  [/^papa-.*(caja|payette|savory|conquest|select|thunder|megacrunch|hash|gajo|ondulada|lisa|curly|camote|dulce)|^deditos/, TIPOS.papaCongelada],
  [/aros-cebolla|dedos-queso/, TIPOS.botanaCongelada],
  // Aguacate
  [/aguacate/, [160, 2, 15, 9, b("corazon", "fibra", "potasio", "hidrata")]],
  // Frutas
  [/limon|toronja|naranja|mandarina/, TIPOS.frutaCitrica],
  [/sandia|melon|papaya|guayaba/, [35, 0.7, 0.2, 8.5, b("hidrata", "vitaminaC", "bajoCal", "antioxidantes")]],
  [/arandano|blue-berry|zarzamora|frambuesa|fresa/, [45, 0.9, 0.4, 10.5, b("antioxidantes", "vitaminaC", "fibra", "bajoCal")]],
  [/uva/, [67, 0.6, 0.4, 17, b("antioxidantes", "energia", "hidrata", "vitaminaC")]],
  [/platano/, [95, 1.1, 0.3, 23, b("potasio", "energia", "fibra", "corazon")]],
  [/mango/, [60, 0.8, 0.4, 15, b("vitaminaC", "ojos", "antioxidantes", "energia")]],
  [/manzana|pera/, [55, 0.3, 0.2, 14, b("fibra", "digestion", "bajoCal", "antioxidantes")]],
  [/kiwi/, [61, 1.1, 0.5, 15, b("vitaminaC", "inmune", "fibra", "digestion")]],
  [/tuna-fruta/, [41, 0.7, 0.5, 10, b("fibra", "antioxidantes", "bajoCal", "hidrata")]],
  [/ciruelo-rojo|ciruelo-negro/, [46, 0.7, 0.3, 11.5, b("vitaminaC", "fibra", "bajoCal", "antioxidantes")]],
  [/ciruela-pasa|pasas/, [290, 2.5, 0.5, 72, b("fibra", "digestion", "energia", "hierro")]],
  // Verduras concretas
  [/acelga|espinaca|kale|lechuga|ensalada/, TIPOS.verduraHoja],
  [/cilantro|perejil|epazote|hierbabuena|menta|mejorana|tomillo|romero|albahaca|te-de-limon|laurel/, TIPOS.hierbaAroma],
  [/brocoli|coliflor|col-blanca/, [30, 2.5, 0.3, 5, b("vitaminaC", "fibra", "inmune", "bajoCal")]],
  [/zanahoria/, [41, 0.9, 0.2, 10, b("ojos", "vitaminaC", "fibra", "bajoCal")]],
  [/betabel/, [43, 1.6, 0.2, 10, b("hierro", "fibra", "corazon", "antioxidantes")]],
  [/cebolla|poro/, [38, 1.2, 0.1, 8.5, b("antioxidantes", "inmune", "bajoCal", "digestion")]],
  [/ajo$/, [149, 6.4, 0.5, 33, b("inmune", "corazon", "antioxidantes", "energia")]],
  [/jitomate|tomate|chacal/, [20, 0.9, 0.2, 3.9, b("vitaminaC", "antioxidantes", "bajoCal", "hidrata")]],
  [/chile/, TIPOS.chileFresco],
  [/pepino/, [15, 0.7, 0.1, 3.6, b("hidrata", "bajoCal", "vitaminaK", "digestion")]],
  [/calabaza/, [20, 1, 0.1, 4.5, b("ojos", "fibra", "bajoCal", "potasio")]],
  [/ejote/, [31, 1.8, 0.2, 7, b("fibra", "vitaminaC", "bajoCal", "hierro")]],
  [/chicharo/, [81, 5.4, 0.4, 14, b("proteinas", "fibra", "vitaminaK", "energia")]],
  [/elote|maiz/, [96, 3.4, 1.5, 19, b("energia", "fibra", "ojos", "antioxidantes")]],
  [/espinazo/, TIPOS.cerdoGraso],
  [/esparrago/, [20, 2.2, 0.1, 3.9, b("vitaminaK", "fibra", "bajoCal", "antioxidantes")]],
  [/champinon/, [22, 3.1, 0.3, 3.3, b("proteinas", "bajoCal", "antioxidantes", "potasio")]],
  [/chayote/, [19, 0.8, 0.1, 4.5, b("vitaminaC", "fibra", "bajoCal", "hidrata")]],
  [/jicama/, [38, 0.7, 0.1, 9, b("vitaminaC", "fibra", "hidrata", "bajoCal")]],
  [/nopal/, [16, 1.3, 0.2, 3.3, b("fibra", "bajoCal", "calcio", "digestion")]],
  [/rabano/, [16, 0.7, 0.1, 3.4, b("vitaminaC", "bajoCal", "hidrata", "digestion")]],
  [/apio/, [16, 0.7, 0.2, 3, b("bajoCal", "hidrata", "vitaminaK", "fibra")]],
  [/jengibre/, [80, 1.8, 0.8, 18, b("digestion", "inmune", "antioxidantes", "energia")]],
  [/alfalfa|germinado/, [23, 4, 0.7, 2.1, b("proteinas", "vitaminaK", "bajoCal", "antioxidantes")]],
  [/haba$|frijol|lenteja/, TIPOS.leguminosa],
  [/papa-blanca/, [77, 2, 0.1, 17, b("potasio", "energia", "vitaminaC", "saciedad")]],
  // Abarrotes concretos
  [/arroz/, [360, 6.7, 0.7, 80, b("energia", "saciedad", "hierro", "bajoCal")]],
  [/avena|granola/, [375, 12, 7, 66, b("fibra", "corazon", "energia", "saciedad")]],
  [/amaranto/, [371, 14, 7, 65, b("proteinas", "fibra", "calcio", "energia")]],
  [/quinoa/, [368, 14, 6, 64, b("proteinas", "fibra", "hierro", "energia")]],
  [/trigo/, [340, 13, 2.5, 72, b("fibra", "energia", "proteinas", "saciedad")]],
  [/tapioca/, [358, 0.2, 0, 88, b("energia", "digestion", "bajoCal", "saciedad")]],
  [/cacahuate/, [570, 26, 49, 16, b("proteinas", "corazon", "energia", "saciedad")]],
  [/almendras/, [579, 21, 50, 22, b("corazon", "proteinas", "huesos", "antioxidantes")]],
  [/nuez/, TIPOS.nuez],
  [/ajonjoli/, [573, 18, 50, 23, b("calcio", "huesos", "corazon", "hierro")]],
  [/pepita|linaza|chia/, TIPOS.semilla],
  [/azucar|piloncillo/, TIPOS.azucar],
  [/sal-de-mar/, [0, 0, 0, 0, b("digestion", "hidrata", "energia", "saciedad")]],
  // Mascotas (ocultos por default)
  [/alimento-perro/, [350, 24, 12, 42, b("proteinas", "huesos", "energia", "saciedad")]],
  [/premio-hueso/, [380, 15, 10, 55, b("proteinas", "energia", "huesos", "saciedad")]],
  // Corazón de puerco (oculto: OpenAI rechazó la foto)
  [/corazon-puerco/, [110, 17, 4, 0.5, b("proteinas", "hierro", "b12", "zinc")]],
  [/canela|comino|curcuma|oregano|pimienta|pimenton|clavo|anis|achiote|chile-colorin|chile-de-la-tierra|chile-mirasol|chile-morita|chile-pasado/, TIPOS.especia],
  [/cocoa/, [390, 20, 14, 50, b("antioxidantes", "energia", "hierro", "fibra")]],
  [/coco-rayado/, [660, 7, 65, 24, b("energia", "fibra", "corazon", "saciedad")]],
  [/consome/, [180, 12, 4, 24, b("energia", "saciedad", "proteinas", "b12")]],
  [/gragea/, [400, 0.5, 2, 95, b("energia", "saciedad", "hidrata", "digestion")]],
  [/tamarindo/, [287, 3.4, 0.7, 67, b("digestion", "antioxidantes", "energia", "potasio")]],
  [/jamaica/, [37, 0.4, 0.1, 8.5, b("antioxidantes", "vitaminaC", "corazon", "hidrata")]],
  [/manteca/, TIPOS.oleaginosa],
  [/hoja-de-laurel/, TIPOS.especia],
  // Lácteos
  [/queso-crema/, TIPOS.quesoCrema],
  // Ensaladas preparadas
  [/ensalada-cesar/, [190, 5, 16, 8, b("proteinas", "calcio", "energia", "vitaminaK")]],
]

const FALLBACK = {
  "Frutas y Verduras": TIPOS.hortaliza,
  "Carnes, Aves y Pescados": TIPOS.resRegular,
  Congelados: TIPOS.papaCongelada,
  Abarrotes: TIPOS.grano,
  "Lácteos y Huevos": TIPOS.quesoCrema,
}

export function nutritionFor(slug, categoryName) {
  for (const [re, datos] of REGLAS) {
    if (re.test(slug)) return datos
  }
  return FALLBACK[categoryName] || TIPOS.hortaliza
}
