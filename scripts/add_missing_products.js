const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load env — supports env vars for production targeting
const supabaseUrl = process.env.SUPABASE_URL || 'https://isogthougrpctnfzcdes.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  || fs.readFileSync('.env.local','utf8').match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!key) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Set it via env var or .env.local');
  process.exit(1);
}

console.log('Targeting Supabase:', supabaseUrl);
const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } });

const STORE_ID = 1; // Resurte.me

const products = [
  // ====== 1. HAMBURGUESAS Y HOT DOGS — Missing essentials ======
  { name:"Queso Cheddar Rebanado 200g", slug:"queso-cheddar-rebanado-200g", desc:"Queso tipo cheddar americano en rebanadas. Ideal para hamburguesas y sandwiches.", img:"/images/products/queso-cheddar.webp", brand:"Kraft", cat:3, tags:["hamburgueseria","burger","hotdog","cafeteria","desayunos"], unit:"200g", price:72 },
  { name:"Queso Amarillo Americano 200g", slug:"queso-amarillo-americano-200g", desc:"Queso americano fundente para hamburguesas clásicas.", img:"/images/products/queso-americano.webp", brand:"Kraft", cat:3, tags:["hamburgueseria","burger","hotdog"], unit:"200g", price:68 },
  { name:"Papas Fritas Congeladas 2.5kg", slug:"papas-fritas-congeladas", desc:"Papas prefritas congeladas. Alto rendimiento, dorado uniforme.", img:"/images/products/papas-fritas-congeladas.webp", brand:"McCain", cat:9, tags:["hamburgueseria","burger","hotdog","fritura","cafeteria","restaurante"], unit:"2.5kg", price:165 },
  { name:"Mostaza 3.8L", slug:"mostaza-3l", desc:"Mostaza americana en galón. Para aderezos, salsas y servicio directo.", img:"/images/products/mostaza.webp", brand:"French's", cat:2, tags:["hamburgueseria","hotdog","burger","pizzeria","fonda"], unit:"3.8L", price:145 },
  { name:"Pepinillos Encurtidos 1kg", slug:"pepinillos-1kg", desc:"Pepinillos agridulces en rodajas para hamburguesas y hot dogs.", img:"/images/products/pepinillos.webp", brand:"Del Monte", cat:2, tags:["hamburgueseria","burger","hotdog","arabe","griega"], unit:"1kg", price:65 },
  { name:"Lechuga Iceberg", slug:"lechuga-iceberg", desc:"Lechuga fresca, ideal para hamburguesas gourmet y ensaladas.", img:"/images/products/lechuga-iceberg.webp", brand:"Local", cat:1, tags:["hamburgueseria","burger","saludable","ensaladas","arabe"], unit:"pieza", price:28 },

  // ====== 2. TAQUERÍAS Y ANTOJITOS — Missing essentials ======
  { name:"Crema Mexicana 1L", slug:"crema-mexicana-1l", desc:"Crema ácida estilo mexicano. Textura suave y sabor inconfundible.", img:"/images/products/crema-mexicana.webp", brand:"Lala", cat:3, tags:["taqueria","tacos","mexicana","antojitos","fonda","venezolana","colombiana","latina"], unit:"1L", price:62 },
  { name:"Chile Guajillo Seco 500g", slug:"chile-guajillo-seco", desc:"Chile guajillo seco para salsas, adobos y moles mexicanos.", img:"/images/products/chile-guajillo.webp", brand:"Local", cat:2, tags:["taqueria","tacos","mexicana","fonda","cocina-economica","antojitos"], unit:"500g", price:85 },
  { name:"Chile Ancho Seco 500g", slug:"chile-ancho-seco", desc:"Chile ancho seco, base fundamental de moles y adobos mexicanos.", img:"/images/products/chile-ancho.webp", brand:"Local", cat:2, tags:["taqueria","tacos","mexicana","fonda","cocina-economica"], unit:"500g", price:90 },
  { name:"Chile de Árbol Seco 250g", slug:"chile-arbol-seco", desc:"Chile de árbol seco, picante intenso para salsas taqueras.", img:"/images/products/chile-arbol.webp", brand:"Local", cat:2, tags:["taqueria","tacos","mexicana","marisqueria","fonda","bebidas","bar"], unit:"250g", price:55 },
  { name:"Pimienta Negra Molida 500g", slug:"pimienta-negra-molida", desc:"Pimienta negra molida fina, esencial en toda cocina.", img:"/images/products/pimienta-negra.webp", brand:"McCormick", cat:2, tags:["taqueria","tacos","mexicana","fonda","cocina-economica","cortes","asador","pollo","alitas","marisqueria","saludable","ensaladas"], unit:"500g", price:95 },
  { name:"Comino Molido 500g", slug:"comino-molido", desc:"Comino molido puro, especia fundamental en cocina mexicana.", img:"/images/products/comino.webp", brand:"McCormick", cat:2, tags:["taqueria","tacos","mexicana","fonda","arabe","griega","cocina-economica","venezolana","colombiana","latina"], unit:"500g", price:88 },
  { name:"Manteca de Cerdo 1kg", slug:"manteca-cerdo-1kg", desc:"Manteca de cerdo premium para frijoles refritos y cocina tradicional.", img:"/images/products/manteca-cerdo.webp", brand:"Local", cat:2, tags:["taqueria","tacos","mexicana","fonda","cocina-economica","guisados","antojitos"], unit:"1kg", price:75 },
  { name:"Pasta de Achiote 200g", slug:"pasta-achiote", desc:"Pasta de achiote concentrada. Para cochinita pibil y adobos yucatecos.", img:"/images/products/achiote.webp", brand:"El Yucateco", cat:2, tags:["taqueria","tacos","mexicana","fonda","cocina-economica","guisados"], unit:"200g", price:32 },

  // ====== 3. SUSHI Y COMIDA ASIÁTICA — Missing essentials ======
  { name:"Arroz para Sushi 5kg", slug:"arroz-sushi-5kg", desc:"Arroz grano corto especial para sushi. Alto contenido de almidón.", img:"/images/products/arroz-sushi.webp", brand:"Nishiki", cat:2, tags:["sushi","japonesa","asiatica"], unit:"5kg", price:195 },
  { name:"Alga Nori 50 Hojas", slug:"alga-nori-50hojas", desc:"Alga nori dorada para sushi rolls. Paquete de 50 hojas completas.", img:"/images/products/alga-nori.webp", brand:"Toyo", cat:2, tags:["sushi","japonesa","asiatica"], unit:"50 piezas", price:145 },
  { name:"Salsa Soya 5L", slug:"salsa-soya-5l", desc:"Salsa de soya fermentada en garrafa de 5 litros. Formato institucional.", img:"/images/products/salsa-soya.webp", brand:"Kikkoman", cat:2, tags:["sushi","japonesa","asiatica","marisqueria"], unit:"5L", price:280 },
  { name:"Sriracha 740ml", slug:"sriracha-740ml", desc:"Salsa picante estilo tailandesa. Para sushi rolls, alitas y fusiones asiáticas.", img:"/images/products/sriracha.webp", brand:"Huy Fong", cat:2, tags:["sushi","asiatica","pollo","alitas","marisqueria"], unit:"740ml", price:110 },
  { name:"Jengibre Encurtido 1kg", slug:"jengibre-encurtido", desc:"Gari premium. Jengibre rosado encurtido para sushi.", img:"/images/products/jengibre.webp", brand:"Toyo", cat:2, tags:["sushi","japonesa","asiatica"], unit:"1kg", price:95 },
  { name:"Wasabi en Polvo 250g", slug:"wasabi-polvo-250g", desc:"Wasabi en polvo para reconstituir. Para sushi y platillos japoneses.", img:"/images/products/wasabi.webp", brand:"Toyo", cat:2, tags:["sushi","japonesa","asiatica"], unit:"250g", price:78 },
  { name:"Vinagre de Arroz 1.8L", slug:"vinagre-arroz-1l", desc:"Vinagre de arroz sazonado para sushi. Listo para usar.", img:"/images/products/vinagre-arroz.webp", brand:"Mizkan", cat:2, tags:["sushi","japonesa","asiatica","saludable","ensaladas"], unit:"1.8L", price:125 },
  { name:"Aceite de Ajonjolí 500ml", slug:"aceite-ajonjoli-500ml", desc:"Aceite de ajonjolí tostado. Toque final para sushi, ramen y salteados.", img:"/images/products/aceite-ajonjoli.webp", brand:"Kadoya", cat:2, tags:["sushi","japonesa","asiatica","saludable","ensaladas"], unit:"500ml", price:98 },

  // ====== 4. PIZZAS Y COMIDA ITALIANA — Missing essentials ======
  { name:"Queso Mozzarella Rallado 1kg", slug:"queso-mozzarella-1kg", desc:"Mozzarella rallada para pizza. Excelente fundencia e hilo perfecto.", img:"/images/products/mozzarella.webp", brand:"Ochoa", cat:3, tags:["pizzeria","italiana","pasta"], unit:"1kg", price:155 },
  { name:"Pepperoni Rebanado 1kg", slug:"pepperoni-1kg", desc:"Pepperoni de cerdo y res en rebanadas para pizza. Sabor ahumado intenso.", img:"/images/products/pepperoni.webp", brand:"Sigma", cat:4, tags:["pizzeria","italiana"], unit:"1kg", price:210 },
  { name:"Puré de Tomate Enlatado 3kg", slug:"pure-tomate-3kg", desc:"Puré de tomate concentrado para salsas base de pizza. Lata institucional.", img:"/images/products/pure-tomate.webp", brand:"Del Monte", cat:2, tags:["pizzeria","italiana","fonda","cocina-economica"], unit:"3kg", price:95 },
  { name:"Salsa Pomodoro 2.5kg", slug:"salsa-pomodoro-2kg", desc:"Salsa pomodoro lista para pizza y pasta. Hecha con tomates italianos.", img:"/images/products/salsa-pomodoro.webp", brand:"Del Monte", cat:2, tags:["pizzeria","italiana","pasta","fonda"], unit:"2.5kg", price:130 },
  { name:"Aceitunas Negras 1kg", slug:"aceitunas-negras-1kg", desc:"Aceitunas negras rebanadas para pizza y ensaladas.", img:"/images/products/aceitunas-negras.webp", brand:"Del Monte", cat:2, tags:["pizzeria","italiana","saludable","ensaladas"], unit:"1kg", price:85 },
  { name:"Levadura Instantánea 500g", slug:"levadura-instantanea-500g", desc:"Levadura instantánea para panadería y pizza. Alta actividad.", img:"/images/products/levadura.webp", brand:"Saf-Instant", cat:5, tags:["pizzeria","italiana","panaderia","postres"], unit:"500g", price:68 },
  { name:"Harina de Fuerza 5kg", slug:"harina-fuerza-5kg", desc:"Harina de trigo de fuerza (W300+). Alto contenido de gluten para pizza artesanal.", img:"/images/products/harina-fuerza.webp", brand:"Espiga", cat:5, tags:["pizzeria","italiana","panaderia"], unit:"5kg", price:135 },
  { name:"Cajas para Pizza 30x30cm 25pz", slug:"cajas-pizza-25pz", desc:"Cajas de cartón corrugado para pizza mediana. Empaque profesional.", img:"/images/products/cajas-pizza.webp", brand:"Reyma", cat:10, tags:["pizzeria","italiana"], unit:"25 piezas", price:180 },

  // ====== 5. POLLO Y ALITAS — Missing essentials ======
  { name:"Aderezo Blue Cheese 1L", slug:"aderezo-blue-cheese-1l", desc:"Aderezo de queso azul cremoso. Clásico acompañante de alitas.", img:"/images/products/aderezo-bluecheese.webp", brand:"Kraft", cat:2, tags:["pollo","alitas","fritura"], unit:"1L", price:120 },
  { name:"Ajo en Polvo 500g", slug:"ajo-en-polvo-500g", desc:"Ajo en polvo puro. Sazonador esencial para pollo frito y empanizados.", img:"/images/products/ajo-polvo.webp", brand:"McCormick", cat:2, tags:["pollo","alitas","fritura","hamburgueseria","fonda","cocina-economica"], unit:"500g", price:72 },

  // ====== 6. COMIDA MEXICANA — already excellent, just a few additions ======
  { name:"Arroz Morelos 5kg", slug:"arroz-morelos-5kg", desc:"Arroz grano largo de Morelos. El más rendidor para fondas y arroz a la mexicana.", img:"/images/products/arroz-morelos.webp", brand:"Local", cat:2, tags:["fonda","cocina-economica","mexicana","guisados"], unit:"5kg", price:98 },

  // ====== 7. MARISCOS Y PESCADOS — Missing essentials ======
  { name:"Tostadas de Maíz 20pz", slug:"tostadas-maiz-20pz", desc:"Tostadas de maíz crujientes. Base para ceviche, aguachile y mariscos.", img:"/images/products/tostadas.webp", brand:"Milpa Real", cat:5, tags:["marisqueria","mariscos","pescados","taqueria","mexicana"], unit:"20 piezas", price:38 },
  { name:"Salsa Huichol 500ml", slug:"salsa-huichol-500ml", desc:"Salsa picante estilo Nayarit. Infaltable en mariscos y micheladas.", img:"/images/products/salsa-huichol.webp", brand:"Huichol", cat:2, tags:["marisqueria","mariscos","bebidas","bar"], unit:"500ml", price:55 },
  { name:"Surimi 1kg", slug:"surimi-1kg", desc:"Surimi premium de primera calidad. Para ensaladas, sushi y mariscos.", img:"/images/products/surimi.webp", brand:"Toyo", cat:4, tags:["marisqueria","mariscos","sushi","asiatica"], unit:"1kg", price:125 },

  // ====== 8. CORTES DE CARNE Y ASADEROS — Missing essentials ======
  { name:"Carbón Vegetal 5kg", slug:"carbon-vegetal-5kg", desc:"Carbón vegetal de mezquite. Alta duración y calor uniforme.", img:"/images/products/carbon.webp", brand:"Local", cat:2, tags:["cortes","asador","parrilla"], unit:"5kg", price:95 },
  { name:"Pimienta Negra Gruesa 500g", slug:"pimienta-negra-gruesa", desc:"Pimienta negra molida gruesa. Costra perfecta para cortes de carne.", img:"/images/products/pimienta-gruesa.webp", brand:"McCormick", cat:2, tags:["cortes","asador","parrilla","carne-res"], unit:"500g", price:98 },
  { name:"Cebollitas Cambray 500g", slug:"cebollitas-cambray", desc:"Cebollitas cambray frescas. Acompañamiento clásico para asados y parrilladas.", img:"/images/products/cebollitas-cambray.webp", brand:"Local", cat:1, tags:["cortes","asador","parrilla","carne-res"], unit:"500g", price:42 },
  { name:"Aceite de Oliva Extra Virgen 1L", slug:"aceite-oliva-1l", desc:"Aceite de oliva extra virgen. Para marinar, cocinar y terminar cortes.", img:"/images/products/aceite-oliva.webp", brand:"Carbonell", cat:2, tags:["cortes","asador","parrilla","saludable","ensaladas","pizzeria","italiana","arabe","griega"], unit:"1L", price:195 },

  // ====== 9. CAFETERÍAS, CREPAS Y DESAYUNOS — Missing essentials ======
  { name:"Café en Grano Chiapas 1kg", slug:"cafe-grano-1kg", desc:"Café 100% arábica de Chiapas. Tueste medio, notas achocolatadas y cítricas.", img:"/images/products/cafe-grano.webp", brand:"Local", cat:6, tags:["cafeteria","cafe","desayunos"], unit:"1kg", price:280 },
  { name:"Jarabe de Vainilla 1L", slug:"jarabe-vainilla-1l", desc:"Jarabe saborizante de vainilla para cafés, lattes y frappés.", img:"/images/products/jarabe-vainilla.webp", brand:"Torani", cat:6, tags:["cafeteria","cafe","desayunos"], unit:"1L", price:165 },
  { name:"Jarabe de Caramelo 1L", slug:"jarabe-caramelo-1l", desc:"Jarabe sabor caramelo macchiato para cafés y bebidas especiales.", img:"/images/products/jarabe-caramelo.webp", brand:"Torani", cat:6, tags:["cafeteria","cafe","desayunos"], unit:"1L", price:170 },
  { name:"Chocolate en Polvo 1kg", slug:"chocolate-polvo-1kg", desc:"Chocolate en polvo para chocolate caliente y frappés. Alto porcentaje de cocoa.", img:"/images/products/chocolate-polvo.webp", brand:"Nestlé", cat:6, tags:["cafeteria","cafe","desayunos","postres"], unit:"1kg", price:145 },
  { name:"Harina para Hot Cakes 1kg", slug:"harina-hotcakes-1kg", desc:"Harina preparada para hot cakes esponjosos. Solo agregar agua o leche.", img:"/images/products/harina-hotcakes.webp", brand:"Pronto", cat:5, tags:["cafeteria","desayunos","crepas","postres"], unit:"1kg", price:48 },
  { name:"Miel de Maple 500ml", slug:"miel-maple-500ml", desc:"Miel de maple grado A. Para hot cakes, waffles y crepas dulces.", img:"/images/products/miel-maple.webp", brand:"Great Value", cat:2, tags:["cafeteria","desayunos","crepas","postres"], unit:"500ml", price:125 },
  { name:"Filtros de Café #4 100pz", slug:"filtros-cafe-100pz", desc:"Filtros de papel blanqueados para cafetera. Tamaño estándar.", img:"/images/products/filtros-cafe.webp", brand:"Filtro", cat:8, tags:["cafeteria","cafe","desayunos"], unit:"100 piezas", price:42 },

  // ====== 10. SALUDABLE, ENSALADAS Y POKÉS — Missing essentials ======
  { name:"Quinoa 1kg", slug:"quinoa-1kg", desc:"Quinoa blanca orgánica. Proteína completa, base para bowls y ensaladas.", img:"/images/products/quinoa.webp", brand:"Local", cat:2, tags:["saludable","ensaladas","poke","organico"], unit:"1kg", price:120 },
  { name:"Vinagre Balsámico 500ml", slug:"vinagre-balsamico-500ml", desc:"Vinagre balsámico de Módena. Para aderezos y reducciones.", img:"/images/products/vinagre-balsamico.webp", brand:"Carbonell", cat:2, tags:["saludable","ensaladas","poke","italiana","pizzeria"], unit:"500ml", price:95 },
  { name:"Garbanzo en Lata 3kg", slug:"garbanzo-lata-3kg", desc:"Garbanzos cocidos en lata. Para ensaladas, hummus y poke bowls.", img:"/images/products/garbanzo-lata.webp", brand:"Del Monte", cat:2, tags:["saludable","ensaladas","poke","arabe","griega","venezolana","colombiana","latina"], unit:"3kg", price:115 },
  { name:"Arándanos Deshidratados 500g", slug:"arandanos-500g", desc:"Arándanos deshidratados azucarados. Toque dulce para ensaladas.", img:"/images/products/arandanos.webp", brand:"Ocean Spray", cat:7, tags:["saludable","ensaladas","poke","cafeteria","postres"], unit:"500g", price:85 },
  { name:"Semillas de Girasol 500g", slug:"semillas-girasol-500g", desc:"Semillas de girasol peladas. Crujiente y nutritivo topping para bowls.", img:"/images/products/semillas-girasol.webp", brand:"Local", cat:2, tags:["saludable","ensaladas","poke","organico"], unit:"500g", price:55 },
  { name:"Aderezo César 1L", slug:"aderezo-cesar-1l", desc:"Aderezo César institucional. Cremoso, con queso parmesano y anchoas.", img:"/images/products/aderezo-cesar.webp", brand:"Kraft", cat:2, tags:["saludable","ensaladas","poke"], unit:"1L", price:110 },

  // ====== 11. POSTRES, PANADERÍA Y HELADOS — Missing essentials ======
  { name:"Cocoa en Polvo 1kg", slug:"cocoa-polvo-1kg", desc:"Cocoa en polvo alcalina. Para pasteles, brownies y repostería profesional.", img:"/images/products/cocoa-polvo.webp", brand:"Hershey's", cat:2, tags:["postres","panaderia","helados","reposteria","cafeteria"], unit:"1kg", price:155 },
  { name:"Azúcar Glass 1kg", slug:"azucar-glass-1kg", desc:"Azúcar glass impalpable. Para glaseados, fondant y decoración.", img:"/images/products/azucar-glass.webp", brand:"Zulka", cat:2, tags:["postres","panaderia","reposteria","cafeteria"], unit:"1kg", price:42 },
  { name:"Polvo para Hornear 500g", slug:"polvo-hornear-500g", desc:"Polvo para hornear de doble acción. Rendimiento profesional.", img:"/images/products/polvo-hornear.webp", brand:"Royal", cat:2, tags:["postres","panaderia","reposteria","cafeteria"], unit:"500g", price:35 },
  { name:"Bicarbonato de Sodio 500g", slug:"bicarbonato-500g", desc:"Bicarbonato de sodio grado alimenticio. Para panadería y repostería.", img:"/images/products/bicarbonato.webp", brand:"Arm & Hammer", cat:2, tags:["postres","panaderia","reposteria"], unit:"500g", price:28 },
  { name:"Nuez Pecana 500g", slug:"nuez-pecana-500g", desc:"Nuez pecana en mitades. Para pays, panes, ensaladas y bowls.", img:"/images/products/nuez-pecana.webp", brand:"Local", cat:2, tags:["postres","panaderia","reposteria","saludable","ensaladas"], unit:"500g", price:185 },
  { name:"Almendras 500g", slug:"almendras-500g", desc:"Almendras enteras sin cáscara. Para panadería fina, mazapanes y repostería.", img:"/images/products/almendras.webp", brand:"Local", cat:2, tags:["postres","panaderia","reposteria","saludable","ensaladas"], unit:"500g", price:175 },
  { name:"Harina Preparada para Pastel 1kg", slug:"harina-pastel-1kg", desc:"Harina preparada para pastel de vainilla. Base lista para crear.", img:"/images/products/harina-pastel.webp", brand:"Betty Crocker", cat:5, tags:["postres","panaderia","reposteria"], unit:"1kg", price:62 },
  { name:"Azúcar Refinada 5kg", slug:"azucar-refinada-5kg", desc:"Azúcar estándar refinada. Uso diario en panadería y cocina.", img:"/images/products/azucar-refinada.webp", brand:"Zulka", cat:2, tags:["postres","panaderia","reposteria","cafeteria","cafe","desayunos","fonda","cocina-economica"], unit:"5kg", price:85 },
  { name:"Leche en Polvo 1kg", slug:"leche-polvo-1kg", desc:"Leche entera en polvo. Para panadería, repostería y bases de helado.", img:"/images/products/leche-polvo.webp", brand:"Nido", cat:3, tags:["postres","panaderia","reposteria","helados","cafeteria"], unit:"1kg", price:135 },
  { name:"Frutos Rojos Congelados 1kg", slug:"frutos-rojos-congelados", desc:"Mezcla de frambuesa, zarzamora y arándano. Para smoothies, bowls y repostería.", img:"/images/products/frutos-rojos.webp", brand:"Local", cat:9, tags:["postres","helados","panaderia","reposteria","saludable","ensaladas","cafeteria"], unit:"1kg", price:165 },

  // ====== 12. COMIDA ÁRABE Y GRIEGA — Missing essentials ======
  { name:"Jocoque 1kg", slug:"jocoque-1kg", desc:"Jocoque natural estilo libanés. Para tacos árabes, shawarma y aderezos.", img:"/images/products/jocoque.webp", brand:"Local", cat:3, tags:["arabe","griega","trompo","kebab","taqueria"], unit:"1kg", price:78 },
  { name:"Carne de Cerdo para Trompo 3kg", slug:"carne-cerdo-trompo", desc:"Carne de cerdo adobada lista para trompo. Sabor tradicional árabe-mexicano.", img:"/images/products/carne-trompo.webp", brand:"Carnemart", cat:4, tags:["arabe","griega","trompo","taqueria","tacos","mexicana"], unit:"3kg", price:340 },
  { name:"Garbanzo Seco 5kg", slug:"garbanzo-seco-5kg", desc:"Garbanzo seco calibre grande. Para hummus, falafel y guisos.", img:"/images/products/garbanzo-seco.webp", brand:"Local", cat:2, tags:["arabe","griega","saludable","ensaladas","fonda","cocina-economica"], unit:"5kg", price:135 },
  { name:"Sumac 250g", slug:"sumac-250g", desc:"Sumac molido. Especia cítrica árabe. Para carnes, ensaladas y aderezos.", img:"/images/products/sumac.webp", brand:"Local", cat:2, tags:["arabe","griega","kebab","saludable","ensaladas"], unit:"250g", price:68 },
  { name:"Za'atar 250g", slug:"zaatar-250g", desc:"Za'atar — mezcla de especias del Medio Oriente con tomillo, sésamo y sumac.", img:"/images/products/zaatar.webp", brand:"Local", cat:2, tags:["arabe","griega"], unit:"250g", price:72 },
  { name:"Yogurt Griego Natural 1L", slug:"yogurt-griego-1l", desc:"Yogurt griego natural sin azúcar. Para tzatziki, aderezos y marinados.", img:"/images/products/yogurt-griego.webp", brand:"Yoplait", cat:3, tags:["arabe","griega","saludable","ensaladas","desayunos","cafeteria"], unit:"1L", price:85 },
  { name:"Bulgur 1kg", slug:"bulgur-1kg", desc:"Bulgur de trigo. Base para tabule, kibbeh y guarniciones del Medio Oriente.", img:"/images/products/bulgur.webp", brand:"Local", cat:2, tags:["arabe","griega","saludable","ensaladas"], unit:"1kg", price:52 },
  { name:"Cardamomo Molido 100g", slug:"cardamomo-100g", desc:"Cardamomo verde molido. Para café árabe, postres y marinados.", img:"/images/products/cardamomo.webp", brand:"Local", cat:2, tags:["arabe","griega","cafeteria","cafe","postres"], unit:"100g", price:65 },

  // ====== 13. COMIDA VENEZOLANA Y LATINA — Missing essentials ======
  { name:"Queso Costeño 500g", slug:"queso-costeno-500g", desc:"Queso costeño colombiano. Salado y duro, para rallar sobre arepas y patacones.", img:"/images/products/queso-costeno.webp", brand:"Local", cat:3, tags:["venezolana","colombiana","latina","arepas","desayunos"], unit:"500g", price:72 },
  { name:"Carne Mechada 1kg", slug:"carne-mechada-1kg", desc:"Carne de res cocida y deshebrada, lista para rellenar arepas y cachapas.", img:"/images/products/carne-mechada.webp", brand:"Local", cat:4, tags:["venezolana","colombiana","latina","arepas","desayunos"], unit:"1kg", price:280 },
  { name:"Chorizo Colombiano 500g", slug:"chorizo-colombiano-500g", desc:"Chorizo colombiano premium. Para bandeja paisa, arepas y picadas.", img:"/images/products/chorizo-colombiano.webp", brand:"Local", cat:4, tags:["venezolana","colombiana","latina","arepas"], unit:"500g", price:95 },
  { name:"Dulce de Leche 1kg", slug:"dulce-leche-1kg", desc:"Dulce de leche/arequipe. Para obleas, postres latinos y repostería.", img:"/images/products/dulce-leche.webp", brand:"Coronado", cat:7, tags:["venezolana","colombiana","latina","postres","panaderia","cafeteria"], unit:"1kg", price:125 },
  { name:"Obleas 12pz", slug:"obleas-12pz", desc:"Obleas redondas crocantes. Tradicional bocadillo colombiano y venezolano.", img:"/images/products/obleas.webp", brand:"Local", cat:7, tags:["venezolana","colombiana","latina","postres"], unit:"12 piezas", price:45 },
  { name:"Suero Costeño 1L", slug:"suero-costeno-1l", desc:"Suero costeño fermentado. Acompañante para arepas, patacones y carimañolas.", img:"/images/products/suero-costeno.webp", brand:"Local", cat:3, tags:["venezolana","colombiana","latina","arepas"], unit:"1L", price:55 },
  { name:"Ají Dulce 500g", slug:"aji-dulce-500g", desc:"Ají dulce fresco. Ingrediente base para sofritos y rellenos latinos.", img:"/images/products/aji-dulce.webp", brand:"Local", cat:1, tags:["venezolana","colombiana","latina","arepas"], unit:"500g", price:38 },
  { name:"Papelón 1kg", slug:"papelon-1kg", desc:"Panela/papelón en bloque. Endulzante natural para bebidas típicas y guarapo.", img:"/images/products/papelon.webp", brand:"Local", cat:2, tags:["venezolana","colombiana","latina","bebidas","bar"], unit:"1kg", price:42 },

  // ====== 14. BEBIDAS, BARES Y BOTANAS — Missing essentials ======
  { name:"Coca-Cola 2.5L", slug:"coca-cola-2-5l", desc:"Refresco Coca-Cola en formato familiar. El más vendido para restaurantes.", img:"/images/products/coca-cola.webp", brand:"Coca-Cola", cat:6, tags:["bebidas","bar","botanas","fonda","cocina-economica"], unit:"2.5L", price:42 },
  { name:"Pepsi 2.5L", slug:"pepsi-2-5l", desc:"Refresco Pepsi formato grande. Opción complementaria a Coca-Cola.", img:"/images/products/pepsi.webp", brand:"Pepsi", cat:6, tags:["bebidas","bar","botanas"], unit:"2.5L", price:38 },
  { name:"Clamato 1.89L", slug:"clamato-1l", desc:"Clamato preparado para micheladas y clamatos. Formato institucional.", img:"/images/products/clamato.webp", brand:"Mott's", cat:6, tags:["bebidas","bar","botanas","marisqueria"], unit:"1.89L", price:68 },
  { name:"Tajín Clásico 500g", slug:"tajin-500g", desc:"Tajín clásico en polvo. Escarchador de micheladas y botanas.", img:"/images/products/tajin.webp", brand:"Tajín", cat:2, tags:["bebidas","bar","botanas","marisqueria"], unit:"500g", price:72 },
  { name:"Chamoy 1L", slug:"chamoy-1l", desc:"Chamoy líquido para micheladas, mangonadas y botanas. Sabor intenso.", img:"/images/products/chamoy.webp", brand:"Miguelito", cat:2, tags:["bebidas","bar","botanas"], unit:"1L", price:85 },
  { name:"Escarchado para Michelada 500g", slug:"escarchado-michelada", desc:"Mezcla de sal, chile y limón deshidratado. Escarchado premium para micheladas.", img:"/images/products/escarchado-michelada.webp", brand:"Tajín", cat:2, tags:["bebidas","bar","botanas"], unit:"500g", price:58 },
  { name:"Fanta Naranja 2L", slug:"fanta-naranja-2l", desc:"Refresco Fanta sabor naranja para restaurantes y combos.", img:"/images/products/fanta.webp", brand:"Coca-Cola", cat:6, tags:["bebidas","bar","botanas","fonda"], unit:"2L", price:36 },
];

async function insertAll() {
  let inserted = 0;
  let skipped = 0;
  const withStore = [];

  for (const p of products) {
    // Check if product with this slug already exists
    const { data: existing } = await supabase.from('products').select('id,slug').eq('slug', p.slug).limit(1);
    if (existing && existing.length > 0) {
      console.log('SKIP (exists):', p.slug);
      skipped++;
      continue;
    }

    const { data: newProduct, error } = await supabase.from('products').insert({
      name: p.name,
      slug: p.slug,
      description: p.desc,
      image_url: p.img,
      brand: p.brand,
      category_id: p.cat,
      tags: p.tags,
      unit: p.unit,
      show_in_whatsapp: true
    }).select('id').single();

    if (error) {
      console.error('ERROR inserting', p.slug, ':', error.message);
      continue;
    }

    withStore.push({ product_id: newProduct.id, price: p.price });

    console.log('INSERTED:', p.name, '(ID', newProduct.id, ') |', p.price, 'MXN | tags:', p.tags.join(','));
    inserted++;
  }

  // Now insert product_stores
  if (withStore.length > 0) {
    const psRows = withStore.map(ps => ({
      product_id: ps.product_id,
      store_id: STORE_ID,
      price: ps.price,
      sale_price: null,
      is_available: true,
      stock_status: 'in_stock'
    }));

    const { error: psError } = await supabase.from('product_stores').upsert(psRows, { onConflict: 'product_id,store_id' });
    if (psError) {
      console.error('ERROR inserting product_stores:', psError.message);
    } else {
      console.log('Inserted', psRows.length, 'product_store entries');
    }
  }

  console.log('\n--- SUMMARY ---');
  console.log('Inserted:', inserted);
  console.log('Skipped (already exist):', skipped);
  console.log('Total with prices:', withStore.length);
}

insertAll().catch(e => console.error('FATAL:', e));
