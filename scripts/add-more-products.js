/**
 * Add 80+ products based on restaurant menu research per collection type.
 * Run: VERCEL_ENV=production node scripts/add-more-products.js
 *
 * NOTE: Images are generated locally via a Python helper.
 * Products are added to the DB with local image paths.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://isogthougrpctnfzcdes.supabase.co';

function getKey() {
  let k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (k && k !== '******' && k !== '[SENSITIVE]') return k;
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
    if (m && m[1] !== '******' && m[1] !== '[SENSITIVE]') return m[1];
  } catch {}
  return null;
}

const key = getKey();
if (!key) {
  console.error('ERROR: Cannot read SUPABASE_SERVICE_ROLE_KEY. Run this on Vercel or with valid env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } });

// ── NEW PRODUCTS BY COLLECTION ──────────────────────────────────
// Format: [name, slug, description, category_id, unit, tags[], imageUrl]
const NEW_PRODUCTS = [
  // ===============================
  // Hamburguesas y Hot Dogs (cat tortillería/carnes = 4, panadería = 5, abarrotes = 2)
  // ===============================
  ["Tocino Ahumado 1kg", "tocino-ahumado-1kg", "Tocino ahumado en tiras, curado y listo para freír. Para hamburguesas, hot dogs y desayunos.", 4, "1 kg", ["hamburgueserias","desayuno","tocino"]],
  ["Queso Americano Rebanado", "queso-americano-rebanado", "Queso tipo americano en rebanadas individuales. Fundido perfecto para hamburguesas.", 3, "24 rebanadas", ["hamburgueserias","queso","cheddar"]],
  ["Lechuga Iceberg", "lechuga-iceberg", "Lechuga iceberg fresca, crocante y de hoja firme. Para hamburguesas, ensaladas y guarniciones.", 1, "por pieza", ["hamburgueserias","verduras","ensaladas"]],
  ["Jitomate Bola", "jitomate-bola", "Jitomate bola maduro y firme. Rodajas perfectas para hamburguesas y sándwiches.", 1, "por kilo", ["hamburgueserias","verduras","taquerias"]],
  ["Cebolla Blanca 1kg", "cebolla-blanca-1kg", "Cebolla blanca fresca. Para aros de cebolla, guarniciones y salsas.", 1, "1 kg", ["hamburgueserias","verduras","taquerias"]],
  ["Salsa BBQ Ahumada 1L", "salsa-bbq-ahumada-1l", "Salsa BBQ sabor ahumado en garrafa de 1 litro. Para costillas, alitas y hamburguesas.", 2, "1 litro", ["hamburgueserias","pollo-alitas","salsas"]],
  ["Salsa Ranch 1L", "salsa-ranch-1l", "Aderezo ranch cremoso en formato institucional. Para ensaladas, alitas y dips.", 2, "1 litro", ["hamburgueserias","pollo-alitas","salsas","saludable"]],
  ["Aceite Vegetal 5L", "aceite-vegetal-5l", "Aceite vegetal para freír en bidón de 5 litros. Alto punto de humo, rendimiento óptimo.", 2, "5 litros", ["hamburgueserias","pollo-alitas","taquerias","mariscos","aceite"]],

  // ===============================
  // Taquerías y Antojitos (cat carnes = 4, frutas/verduras = 1, tortillería = 5, abarrotes = 2)
  // ===============================
  ["Cilantro Fresco", "cilantro-fresco", "Cilantro fresco en manojo. Indispensable en taquerías, salsas y guacamoles.", 1, "manojo", ["taquerias","verduras","mariscos"]],
  ["Chile Serrano 1kg", "chile-serrano-1kg", "Chile serrano verde fresco. Para salsas picantes, guisos y acompañamientos.", 1, "1 kg", ["taquerias","salsas","comida-mexicana"]],
  ["Chile Jalapeño 1kg", "chile-jalapeno-1kg", "Chile jalapeño fresco. Para rajas, salsas y nachos.", 1, "1 kg", ["taquerias","hamburgueserias","salsas"]],
  ["Chile Guajillo Seco 1kg", "chile-guajillo-seco-1kg", "Chile guajillo seco. Base para salsas rojas, adobos y moles económicos.", 2, "1 kg", ["taquerias","comida-mexicana","chiles-secos"]],
  ["Chile Ancho Seco 1kg", "chile-ancho-seco-1kg", "Chile poblano seco (ancho). Sabor dulce y ahumado para moles y adobos.", 2, "1 kg", ["taquerias","comida-mexicana","chiles-secos"]],
  ["Queso Fresco 1kg", "queso-fresco-1kg", "Queso fresco tipo ranchero, desmoronable. Para sopes, enchiladas y antojitos.", 3, "1 kg", ["taquerias","comida-mexicana","queso"]],
  ["Crema Ácida 1L", "crema-acida-1l", "Crema ácida en formato institucional. Para sopes, enchiladas, flautas y totopos.", 3, "1 litro", ["taquerias","comida-mexicana","hamburgueserias"]],
  ["Vinagre Blanco 1L", "vinagre-blanco-1l", "Vinagre blanco destilado. Para escabeches, adobos y salsas.", 2, "1 litro", ["taquerias","mariscos","adobos"]],
  ["Tortillas de Harina 20pz", "tortillas-harina-20pz", "Tortillas de harina de trigo, suaves y flexibles. Para burritos, quesadillas y gringas.", 5, "20 piezas", ["taquerias","cortes-carne","harina"]],
  ["Achiote en Pasta 200g", "achiote-en-pasta-200g", "Pasta de achiote concentrada. Para marinar pastor, cochinita y pescado.", 2, "200 g", ["taquerias","comida-mexicana","mariscos","adobos"]],

  // ===============================
  // Sushi y Comida Asiática
  // ===============================
  ["Jengibre Fresco 500g", "jengibre-fresco-500g", "Raíz de jengibre fresco. Para salsas teriyaki, ramen y cocina asiática.", 1, "500 g", ["sushi","asiatica","especias"]],
  ["Ajonjolí 500g", "ajonjoli-500g", "Semillas de ajonjolí tostadas. Para sushi rolls, ensaladas y aderezos.", 2, "500 g", ["sushi","asiatica","semillas"]],
  ["Wasabi en Polvo 100g", "wasabi-en-polvo-100g", "Wasabi en polvo para reconstituir. Acompañamiento clásico de sushi.", 2, "100 g", ["sushi","asiatica","condimentos"]],
  ["Arroz para Sushi 2kg", "arroz-sushi-2kg", "Arroz de grano corto variedad japónica. Pegajoso y brillante, para sushi y onigiri.", 2, "2 kg", ["sushi","asiatica","arroz"]],
  ["Salsa de Ostión 500ml", "salsa-ostion-500ml", "Salsa de ostión concentrada. Para salteados chinos, stir-fry y marinados.", 2, "500 ml", ["sushi","asiatica","salsas"]],

  // ===============================
  // Pizzas y Comida Italiana
  // ===============================
  ["Tomate Triturado en Lata 2.5kg", "tomate-triturado-lata-2-5kg", "Tomate San Marzano triturado en lata institucional. Para salsas de pizza y pasta.", 2, "2.5 kg", ["pizzeria","italiana","enlatados"]],
  ["Orégano Seco 250g", "oregano-seco-250g", "Orégano seco molido. Especia esencial para pizzas, pastas y aderezos.", 2, "250 g", ["pizzeria","italiana","especias"]],
  ["Albahaca Seca 100g", "albahaca-seca-100g", "Albahaca deshidratada. Para salsas de tomate, pizzas y ensaladas caprese.", 2, "100 g", ["pizzeria","italiana","especias"]],
  ["Aceite de Oliva Extra Virgen 1L", "aceite-oliva-extra-virgen-1l", "Aceite de oliva extra virgen. Para aderezos, marinados y acabado de platillos.", 2, "1 litro", ["pizzeria","italiana","saludable","aceite"]],
  ["Pasta Spaghetti 5kg", "pasta-spaghetti-5kg", "Spaghetti de sémola de trigo duro en formato institucional. Cocción al dente.", 2, "5 kg", ["pizzeria","italiana","pasta"]],
  ["Pasta Penne 5kg", "pasta-penne-5kg", "Penne rigate en formato institucional. Para baked ziti, ensaladas de pasta.", 2, "5 kg", ["pizzeria","italiana","pasta"]],
  ["Salsa de Tomate para Pizza 3kg", "salsa-tomate-pizza-3kg", "Salsa preparada para pizza, sazonada y lista para usar. Ahorra tiempo de prep.", 2, "3 kg", ["pizzeria","italiana","salsas"]],

  // ===============================
  // Pollo y Alitas
  // ===============================
  ["Salsa Buffalo 1L", "salsa-buffalo-1l", "Salsa picante estilo Buffalo en garrafa. Para alitas clásicas americanas.", 2, "1 litro", ["pollo-alitas","salsas-picantes","salsas"]],
  ["Salsa Mango Habanero 500ml", "salsa-mango-habanero-500ml", "Salsa dulce y picante de mango con habanero. Para alitas gourmet y boneless.", 2, "500 ml", ["pollo-alitas","salsas-picantes","salsas"]],
  ["Pan Molido 1kg", "pan-molido-1kg", "Pan molido dorado. Para empanizar pollo, boneless, milanesas y croquetas.", 2, "1 kg", ["pollo-alitas","empanizados","hamburgueserias"]],
  ["Zanahoria 1kg", "zanahoria-1kg", "Zanahoria fresca. Para bastones con alitas, sopas, caldos y guarniciones.", 1, "1 kg", ["pollo-alitas","verduras","saludable"]],
  ["Apio Fresco", "apio-fresco", "Apio fresco en rama. Acompañamiento clásico de alitas Buffalo con aderezo ranch.", 1, "pieza", ["pollo-alitas","verduras","saludable"]],

  // ===============================
  // Comida Mexicana / Corrida
  // ===============================
  ["Chile Poblano 1kg", "chile-poblano-1kg", "Chile poblano fresco, tamaño grande. Para chiles rellenos y rajas con crema.", 1, "1 kg", ["comida-mexicana","chiles","taquerias"]],
  ["Tomate Verde 1kg", "tomate-verde-1kg", "Tomate verde (tomatillo) fresco con cáscara. Para salsa verde, chicharrón y guisos.", 1, "1 kg", ["comida-mexicana","taquerias","salsas"]],
  ["Frijoles Refritos en Lata 3kg", "frijoles-refritos-lata-3kg", "Frijoles refritos bayos en lata institucional. Listos para calentar y servir.", 2, "3 kg", ["comida-mexicana","enlatados","taquerias"]],
  ["Chocolate de Mesa 1kg", "chocolate-de-mesa-1kg", "Chocolate de mesa en tablillas grandes. Para mole poblano y chocolate caliente.", 2, "1 kg", ["comida-mexicana","postres","mole"]],
  ["Manteca de Cerdo 1kg", "manteca-de-cerdo-1kg", "Manteca de cerdo pura. Para frijoles tradicionales, tamales y cocina clásica.", 2, "1 kg", ["comida-mexicana","grasas","tamales"]],

  // ===============================
  // Mariscos y Pescados
  // ===============================
  ["Camarón Pacotilla 1kg", "camaron-pacotilla-1kg", "Camarón pacotilla mediano, pelado y desvenado. Para cócteles, ceviches y empanizados.", 4, "1 kg", ["mariscos","camaron","ceviche"]],
  ["Filete de Tilapia 1kg", "filete-tilapia-1kg", "Filete de tilapia fresco sin espinas. Para empanizar, al mojo de ajo o a la plancha.", 4, "1 kg", ["mariscos","pescado","saludable"]],
  ["Tostadas para Ceviche 20pz", "tostadas-ceviche-20pz", "Tostadas de maíz crujientes, planas y amplias. Para ceviche, tiraditos y mariscos.", 5, "20 piezas", ["mariscos","tostadas","ceviche"]],
  ["Catsup 1L", "catsup-1l", "Catsup en formato institucional. Para cócteles de camarón y salsas rosas.", 2, "1 litro", ["mariscos","hamburgueserias","salsas"]],
  ["Salsa Inglesa 500ml", "salsa-inglesa-500ml", "Salsa inglesa (Worcestershire). Para micheladas, cócteles de camarón y marinados.", 2, "500 ml", ["mariscos","bebidas-bares","salsas"]],

  // ===============================
  // Cortes de Carne y Asaderos
  // ===============================
  ["Arrachera Marinada 1kg", "arrachera-marinada-1kg", "Arrachera de res marinada al estilo norteño. Para parrilla y asadores.", 4, "1 kg", ["cortes-carne","asaderos","carne-res"]],
  ["Chorizo Argentino 1kg", "chorizo-argentino-1kg", "Chorizo tipo argentino para parrilla. Jugoso y especiado, para asadores.", 4, "1 kg", ["cortes-carne","asaderos","embutidos"]],
  ["Chimichurri 500ml", "chimichurri-500ml", "Salsa chimichurri argentina preparada. Para carnes asadas, choripán y provoleta.", 2, "500 ml", ["cortes-carne","asaderos","salsas"]],
  ["Carbón Vegetal 5kg", "carbon-vegetal-5kg", "Carbón vegetal de encino en bolsa de 5 kg. Para parrillas, asadores y taquerías.", 2, "5 kg", ["cortes-carne","asaderos","carbon"]],
  ["Queso Provolone para Parrilla", "queso-provolone-parrilla", "Queso provolone especial para asar. No se deshace, forma costra dorada perfecta.", 3, "por pieza", ["cortes-carne","asaderos","queso"]],

  // ===============================
  // Cafeterías, Crepas y Desayunos
  // ===============================
  ["Café en Grano 1kg", "cafe-en-grano-1kg", "Café en grano arábica tostado. Para espresso, americano y cold brew en cafetería.", 2, "1 kg", ["cafeteria","desayuno","cafe"]],
  ["Jarabe de Vainilla 1L", "jarabe-vainilla-1l", "Jarabe sabor vainilla para cafetería. Para lattes, frappés y bebidas dulces.", 2, "1 litro", ["cafeteria","desayuno","jarabes"]],
  ["Jarabe de Caramelo 1L", "jarabe-caramelo-1l", "Jarabe sabor caramelo. Para macchiatos, frappés y crepas dulces.", 2, "1 litro", ["cafeteria","desayuno","jarabes"]],
  ["Vasos Térmicos para Café 50pz", "vasos-termicos-cafe-50pz", "Vasos térmicos de 12 oz con tapa. Para café para llevar y servicio express.", 2, "50 piezas", ["cafeteria","desayuno","desechables"]],
  ["Nutella 1kg", "nutella-1kg", "Crema de avellana con cacao en formato institucional. Para crepas, hot cakes y repostería.", 2, "1 kg", ["cafeteria","desayuno","postres","panaderia"]],
  ["Mermelada de Fresa 1kg", "mermelada-fresa-1kg", "Mermelada de fresa con trozos. Para desayunos, crepas y repostería.", 2, "1 kg", ["cafeteria","desayuno","postres","panaderia"]],
  ["Hot Cake Mix 5kg", "hot-cake-mix-5kg", "Mezcla preparada para hot cakes. Solo agregar agua o leche, rendimiento de servicio.", 2, "5 kg", ["cafeteria","desayuno","harinas"]],

  // ===============================
  // Saludable, Ensaladas y Pokés
  // ===============================
  ["Lechuga Romana", "lechuga-romana", "Lechuga romana fresca de hoja larga. Para ensaladas César, wraps y bowls.", 1, "por pieza", ["saludable","ensaladas","verduras"]],
  ["Espinaca Fresca 500g", "espinaca-fresca-500g", "Espinaca baby fresca, lavada y lista. Para ensaladas, smoothies y salteados.", 1, "500 g", ["saludable","ensaladas","verduras"]],
  ["Kale Fresco 500g", "kale-fresco-500g", "Kale (col rizada) fresco. Superalimento para ensaladas, smoothies y bowls.", 1, "500 g", ["saludable","ensaladas","verduras"]],
  ["Quinoa 1kg", "quinoa-1kg", "Quinoa blanca de grano entero. Alto en proteína, para bowls saludables y ensaladas.", 2, "1 kg", ["saludable","ensaladas","semillas"]],
  ["Semillas de Chía 500g", "semillas-chia-500g", "Semillas de chía negra. Para puddings, smoothies y toppings de bowls.", 2, "500 g", ["saludable","ensaladas","semillas"]],
  ["Vinagre Balsámico 500ml", "vinagre-balsamico-500ml", "Vinagre balsámico de Módena. Para aderezos, reducciones y ensaladas gourmet.", 2, "500 ml", ["saludable","ensaladas","aderezos"]],
  ["Miel de Abeja 1kg", "miel-abeja-1kg", "Miel de abeja pura multifloral. Para aderezos, marinados, smoothies y repostería.", 2, "1 kg", ["saludable","ensaladas","cafeteria","postres"]],

  // ===============================
  // Postres, Panadería y Helados
  // ===============================
  ["Harina Preparada para Pastel 5kg", "harina-preparada-pastel-5kg", "Mezcla preparada para pastel de vainilla. Solo agregar huevo y aceite.", 2, "5 kg", ["postres","panaderia","harinas"]],
  ["Azúcar Glass 1kg", "azucar-glass-1kg", "Azúcar glass impalpable. Para glaseados, decoración de postres y repostería fina.", 2, "1 kg", ["postres","panaderia","azucar"]],
  ["Chispas de Chocolate 1kg", "chispas-chocolate-1kg", "Chispas de chocolate semiamargo. Para galletas, muffins, hot cakes y helados.", 2, "1 kg", ["postres","panaderia","chocolate"]],
  ["Cocoa en Polvo 1kg", "cocoa-en-polvo-1kg", "Cocoa natural en polvo sin azúcar. Para pasteles de chocolate, brownies y bebidas.", 2, "1 kg", ["postres","panaderia","cafeteria"]],
  ["Fresas Congeladas 2.5kg", "fresas-congeladas-2-5kg", "Fresas IQF congeladas. Para smoothies, helados artesanales y repostería.", 2, "2.5 kg", ["postres","panaderia","cafeteria","saludable"]],

  // ===============================
  // Comida Árabe / Griega
  // ===============================
  ["Tahini 500g", "tahini-500g", "Pasta de ajonjolí (tahini). Base para hummus, baba ganoush y aderezos árabes.", 2, "500 g", ["arabe","griega","salsas","saludable"]],
  ["Garbanzos 1kg", "garbanzos-1kg", "Garbanzo seco de grano grande. Para hummus casero, falafel y guisos mediterráneos.", 2, "1 kg", ["arabe","griega","legumbres","saludable"]],
  ["Yogur Griego Natural 1kg", "yogur-griego-natural-1kg", "Yogur griego natural sin azúcar. Para tzatziki, aderezos, marinados y bowls.", 3, "1 kg", ["arabe","griega","lacteos","saludable"]],
  ["Comino Molido 250g", "comino-molido-250g", "Comino molido puro. Especia esencial en cocina árabe, mexicana e hindú.", 2, "250 g", ["arabe","griega","taquerias","especias"]],
  ["Pimentón Dulce 250g", "pimenton-dulce-250g", "Pimentón (paprika) dulce molido. Para shawarma, gyros, adobos y decoración.", 2, "250 g", ["arabe","griega","especias"]],

  // ===============================
  // Comida Venezolana / Latina
  // ===============================
  ["Harina PAN 1kg", "harina-pan-1kg", "Harina de maíz precocida blanca. Para arepas, empanadas, hallacas y bollos.", 2, "1 kg", ["venezolana","latina","harinas"]],
  ["Plátano Macho Verde 1kg", "platano-macho-verde-1kg", "Plátano macho verde. Para patacones, tostones y tajadas fritas.", 1, "1 kg", ["venezolana","latina","frutas"]],
  ["Plátano Macho Maduro 1kg", "platano-macho-maduro-1kg", "Plátano macho maduro amarillo. Para tajadas dulces, pastel de plátano y acompañamientos.", 1, "1 kg", ["venezolana","latina","frutas","postres"]],

  // ===============================
  // Bebidas, Bares y Botanas
  // ===============================
  ["Cerveza Clara Six", "cerveza-clara-six", "Six pack de cerveza clara tipo lager. Para micheladas, cheladas y servicio en bar.", 2, "6 piezas", ["bebidas-bares","cerveza","michelada"]],
  ["Cerveza Oscura Six", "cerveza-oscura-six", "Six pack de cerveza oscura tipo ámbar. Para micheladas cubanas y servicio premium.", 2, "6 piezas", ["bebidas-bares","cerveza","michelada"]],
  ["Totopos 1kg", "totopos-1kg", "Totopos de maíz crujientes en bolsa institucional. Para nachos, chilaquiles y botanas.", 2, "1 kg", ["bebidas-bares","botanas","comida-mexicana"]],
  ["Sal de Grano 1kg", "sal-de-grano-1kg", "Sal de grano para molcajete. Para escarchar micheladas y margaritas.", 2, "1 kg", ["bebidas-bares","michelada","condimentos"]],
  ["Chile en Polvo 500g", "chile-en-polvo-500g", "Chile en polvo para botanas. Para fruta, micheladas, elotes y totopos.", 2, "500 g", ["bebidas-bares","botanas","condimentos"]],
  ["Limón Agrio 2kg", "limon-agrio-2kg", "Limón agrio en bolsa de 2 kg. Para micheladas, limonadas, ceviches y toda cocina.", 1, "2 kg", ["bebidas-bares","mariscos","taquerias"]],
  ["Agua Mineral 1.5L", "agua-mineral-1-5l", "Agua mineral gasificada en botella de 1.5L. Para limonadas minerales, bares y mocktails.", 2, "1.5 litros", ["bebidas-bares","limonada","bebidas"]],
  ["Jarabe Natural para Limonada 1L", "jarabe-natural-limonada-1l", "Jarabe concentrado de limón natural. Para limonadas rápidas, micheladas y mocktails.", 2, "1 litro", ["bebidas-bares","limonada","jarabes"]],
]

async function main() {
  console.log(`Adding ${NEW_PRODUCTS.length} new products to the catalog...\n`)

  for (const [name, slug, description, category_id, unit, tags] of NEW_PRODUCTS) {
    // Generate image path
    const imgSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 30)
    const imagePath = `/images/products/${imgSlug}.jpg`

    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('id,slug')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      console.log(`  ⏭ SKIP [${existing.id}] "${name}" — slug already exists`)
      continue
    }

    // Insert product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .insert({
        name,
        slug,
        description,
        image_url: imagePath,
        brand: 'Resurte.me',
        category_id,
        show_in_whatsapp: false,
        unit,
        tags,
        is_visible: true,
      })
      .select('id')
      .single()

    if (prodErr) {
      console.error(`  ❌ FAIL "${name}": ${prodErr.message}`)
      continue
    }

    // Create product_stores entry (store_id=1 = Resurte.me)
    const { error: psErr } = await supabase
      .from('product_stores')
      .insert({
        product_id: product.id,
        store_id: 1,
        price: 0,
        sale_price: null,
        is_available: true,
        stock_status: 'in_stock',
      })

    if (psErr) {
      console.error(`  ⚠ "${name}": Created but product_stores failed: ${psErr.message}`)
    } else {
      console.log(`  ✅ [${product.id}] "${name}" — cat ${category_id}`)
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n✅ Done. Added ${NEW_PRODUCTS.length} products.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
