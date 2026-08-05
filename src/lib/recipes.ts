/**
 * Collection Recipes — Recetario por tipo de colección.
 *
 * Cada colección incluye recetas representativas con sus ingredientes,
 * para que los dueños de restaurante encuentren inspiración y
 * descubran qué insumos necesitan para preparar esos platillos.
 */
import type { CollectionRecipe } from "@/types"

type RecipeInput = Omit<CollectionRecipe, "id" | "collection_id" | "is_active">

export interface RecipeGroup {
  collectionSlug: string
  recipes: RecipeInput[]
}

const RECIPES: Record<string, RecipeInput[]> = {
  // ── 1. Hamburguesas y Hot Dogs ──────────────────────────
  "hamburguesas-hot-dogs": [
    {
      name: "Hamburguesa Clásica Smash",
      description: "Doble carne smash con queso cheddar fundido, pepinillos y cebolla caramelizada en pan brioche.",
      ingredients: ["Carne molida 80/20", "Pan brioche", "Queso cheddar rebanado", "Pepinillos", "Cebolla blanca", "Lechuga", "Jitomate bola", "Mostaza", "Catsup"],
      prep_time: "25 min",
      servings: "4 porciones",
      image_url: "/images/recipes/burger-smash.jpg",
      display_order: 1,
    },
    {
      name: "Hot Dog Estilo Chicago",
      description: "Salchicha jumbo en pan suave con pepinillos, tomate, cebolla, chiles sport y mostaza amarilla.",
      ingredients: ["Salchicha jumbo", "Pan para hot dog", "Pepinillos encurtidos", "Jitomate bola", "Cebolla blanca", "Chiles jalapeños", "Mostaza amarilla", "Catsup"],
      prep_time: "20 min",
      servings: "6 porciones",
      image_url: "/images/recipes/hotdog-chicago.jpg",
      display_order: 2,
    },
    {
      name: "Papas Fritas Gourmet",
      description: "Papas fritas crujientes con queso cheddar, tocino y cebollín. Acompañamiento infalible.",
      ingredients: ["Papas congeladas", "Queso cheddar rebanado", "Tocino", "Cebolla blanca", "Aceite vegetal"],
      prep_time: "15 min",
      servings: "4 porciones",
      image_url: "/images/recipes/papas-gourmet.jpg",
      display_order: 3,
    },
  ],

  // ── 2. Taquerías y Antojitos ──────────────────────────
  "taquerias-antojitos": [
    {
      name: "Tacos al Pastor",
      description: "Carne de cerdo marinada en achiote, cocinada en trompo y servida con piña, cebolla y cilantro.",
      ingredients: ["Pierna de cerdo", "Achiote en pasta", "Piña miel", "Cebolla blanca", "Cilantro fresco", "Tortillas de maíz", "Chiles secos", "Vinagre"],
      prep_time: "2 hrs (marinado) + 30 min",
      servings: "20 tacos",
      image_url: "/images/recipes/tacos-pastor.jpg",
      display_order: 1,
    },
    {
      name: "Tacos de Bistec",
      description: "Bistec de res a la plancha con cebolla asada, cilantro y salsa roja. El clásico de toda taquería.",
      ingredients: ["Bistec de res", "Cebolla cambray", "Cilantro fresco", "Tortillas de maíz", "Limón agrio", "Chile guajillo"],
      prep_time: "30 min",
      servings: "15 tacos",
      image_url: "/images/recipes/tacos-bistec.jpg",
      display_order: 2,
    },
    {
      name: "Sopes de Pollo",
      description: "Sopes de masa gruesa con frijoles refritos, pollo deshebrado, lechuga, crema y queso fresco.",
      ingredients: ["Harina de maíz", "Pechuga de pollo", "Frijoles refritos", "Crema ácida", "Queso fresco", "Lechuga", "Jitomate saladet"],
      prep_time: "45 min",
      servings: "8 sopes",
      image_url: "/images/recipes/sopes-pollo.jpg",
      display_order: 3,
    },
  ],

  // ── 3. Sushi y Comida Asiática ─────────────────────────
  "sushi-comida-asiatica": [
    {
      name: "California Roll",
      description: "Rollo clásico con surimi, aguacate y pepino envuelto en arroz y alga nori con ajonjolí.",
      ingredients: ["Arroz para sushi", "Alga nori", "Surimi", "Aguacate hass", "Pepino", "Ajonjolí", "Salsa de soya", "Jengibre encurtido"],
      prep_time: "40 min",
      servings: "4 rollos (32 piezas)",
      image_url: "/images/recipes/california-roll.jpg",
      display_order: 1,
    },
    {
      name: "Ramen Tonkotsu",
      description: "Caldo cremoso de cerdo con fideos, huevo, naruto y cebollín. El rey de los ramen.",
      ingredients: ["Huesos de cerdo", "Fideos ramen", "Huevo fresco", "Cebolla cambray", "Ajo", "Jengibre", "Salsa de soya"],
      prep_time: "4 hrs (caldo) + 30 min",
      servings: "4 tazones",
      image_url: "/images/recipes/ramen-tonkotsu.jpg",
      display_order: 2,
    },
    {
      name: "Pollo Teriyaki",
      description: "Muslos de pollo glaseados en salsa teriyaki con arroz al vapor y verduras salteadas.",
      ingredients: ["Pierna y muslo de pollo", "Salsa de soya", "Azúcar", "Jengibre", "Ajo", "Arroz para sushi", "Brócoli", "Zanahoria"],
      prep_time: "35 min",
      servings: "4 porciones",
      image_url: "/images/recipes/pollo-teriyaki.jpg",
      display_order: 3,
    },
  ],

  // ── 4. Pizzas y Comida Italiana ──────────────────────
  "pizzas-comida-italiana": [
    {
      name: "Pizza Margherita Clásica",
      description: "Masa fina con salsa de tomate San Marzano, mozzarella fresca y albahaca. La reina de Nápoles.",
      ingredients: ["Harina de trigo", "Puré de tomate enlatado", "Queso mozzarella", "Albahaca fresca", "Aceite de oliva", "Sal", "Levadura"],
      prep_time: "2 hrs (masa) + 15 min",
      servings: "2 pizzas medianas",
      image_url: "/images/recipes/pizza-margherita.jpg",
      display_order: 1,
    },
    {
      name: "Pizza Pepperoni Supreme",
      description: "Masa gruesa estilo americano con pepperoni, champiñones, pimiento y extra queso.",
      ingredients: ["Harina de trigo", "Puré de tomate enlatado", "Queso mozzarella", "Pepperoni", "Champiñones frescos", "Pimiento morrón"],
      prep_time: "2 hrs (masa) + 20 min",
      servings: "2 pizzas grandes",
      image_url: "/images/recipes/pizza-pepperoni.jpg",
      display_order: 2,
    },
    {
      name: "Pasta Alfredo con Pollo",
      description: "Fettuccine en salsa cremosa de mantequilla y parmesano con pechuga de pollo dorada.",
      ingredients: ["Pasta fettuccine", "Pechuga de pollo", "Mantequilla", "Queso parmesano", "Crema para batir", "Ajo", "Pimienta negra"],
      prep_time: "30 min",
      servings: "4 porciones",
      image_url: "/images/recipes/pasta-alfredo.jpg",
      display_order: 3,
    },
  ],

  // ── 5. Pollo y Alitas ──────────────────────────────
  "pollo-alitas": [
    {
      name: "Alitas Buffalo Clásicas",
      description: "Alitas fritas crujientes bañadas en salsa buffalo picante con aderezo blue cheese.",
      ingredients: ["Alitas de pollo", "Salsa buffalo", "Mantequilla", "Aceite vegetal", "Apio", "Zanahoria", "Queso azul"],
      prep_time: "35 min",
      servings: "24 alitas",
      image_url: "/images/recipes/alitas-buffalo.jpg",
      display_order: 1,
    },
    {
      name: "Boneless BBQ",
      description: "Trozos de pechuga empanizados bañados en salsa BBQ ahumada. El favorito de todos.",
      ingredients: ["Pechuga de pollo", "Pan molido", "Huevo fresco", "Salsa BBQ", "Aceite vegetal"],
      prep_time: "30 min",
      servings: "6 porciones",
      image_url: "/images/recipes/boneless-bbq.jpg",
      display_order: 2,
    },
    {
      name: "Pollo Rostizado",
      description: "Pollo entero rostizado con hierbas, ajo y limón. Piel dorada, carne jugosa. Ideal para servicio diario.",
      ingredients: ["Pollo entero", "Ajo", "Limón agrio", "Romero", "Tomillo", "Mantequilla", "Papas cambray"],
      prep_time: "1.5 hrs",
      servings: "1 pollo (4-6 porciones)",
      image_url: "/images/recipes/pollo-rostizado.jpg",
      display_order: 3,
    },
  ],

  // ── 6. Comida Mexicana / Comida Corrida ─────────────
  "comida-mexicana-corrida": [
    {
      name: "Chiles Rellenos",
      description: "Chiles poblanos rellenos de queso, capeados y bañados en caldillo de jitomate. Clásico de comida corrida.",
      ingredients: ["Chile poblano", "Queso asadero", "Huevo fresco", "Jitomate saladet", "Cebolla blanca", "Ajo", "Aceite vegetal"],
      prep_time: "1 hr",
      servings: "6 chiles",
      image_url: "/images/recipes/chiles-rellenos.jpg",
      display_order: 1,
    },
    {
      name: "Mole Poblano",
      description: "Mole tradicional con variedad de chiles secos, chocolate y especias. La joya de la comida mexicana.",
      ingredients: ["Chile mulato", "Chile ancho", "Chile pasilla", "Chocolate de mesa", "Ajonjolí", "Almendras", "Pasas", "Plátano macho", "Pollo entero"],
      prep_time: "3 hrs",
      servings: "12 porciones",
      image_url: "/images/recipes/mole-poblano.jpg",
      display_order: 2,
    },
    {
      name: "Enchiladas Verdes",
      description: "Tortillas rellenas de pollo bañadas en salsa verde, gratinadas con crema y queso.",
      ingredients: ["Tortillas de maíz", "Pechuga de pollo", "Tomate verde", "Chile serrano", "Crema ácida", "Queso fresco", "Cilantro fresco"],
      prep_time: "40 min",
      servings: "12 enchiladas",
      image_url: "/images/recipes/enchiladas-verdes.jpg",
      display_order: 3,
    },
  ],

  // ── 7. Mariscos y Pescados ─────────────────────────
  "mariscos-pescados": [
    {
      name: "Ceviche de Camarón",
      description: "Camarón cocido en jugo de limón con jitomate, cebolla, cilantro y aguacate. Frescura pura.",
      ingredients: ["Camarón", "Limón agrio", "Jitomate saladet", "Cebolla morada", "Cilantro fresco", "Aguacate hass", "Pepino", "Salsa inglesa"],
      prep_time: "25 min",
      servings: "6 porciones",
      image_url: "/images/recipes/ceviche-camaron.jpg",
      display_order: 1,
    },
    {
      name: "Filete de Pescado Empanizado",
      description: "Filete blanco empanizado con panko, dorado y crujiente. Acompañado de ensalada fresca.",
      ingredients: ["Filete de pescado blanco", "Panko", "Huevo fresco", "Harina de trigo", "Lechuga", "Jitomate bola", "Limón agrio"],
      prep_time: "25 min",
      servings: "4 porciones",
      image_url: "/images/recipes/pescado-empanizado.jpg",
      display_order: 2,
    },
    {
      name: "Cóctel de Camarón",
      description: "Camarones en salsa de tomate con cebolla, cilantro y aguacate. El clásico de marisquería.",
      ingredients: ["Camarón", "Catsup", "Jugo de tomate", "Cebolla blanca", "Cilantro fresco", "Aguacate hass", "Limón agrio", "Salsa picante"],
      prep_time: "20 min",
      servings: "6 cócteles",
      image_url: "/images/recipes/coctel-camaron.jpg",
      display_order: 3,
    },
  ],

  // ── 8. Cortes de Carne y Asaderos ──────────────────
  "cortes-carne-asaderos": [
    {
      name: "Ribeye a la Parrilla",
      description: "Corte ribeye sellado a fuego alto, término medio. Acompañado de papas asadas y chimichurri.",
      ingredients: ["Ribeye", "Sal de grano", "Pimienta negra", "Aceite de oliva", "Papas cambray", "Perejil fresco", "Ajo", "Vinagre"],
      prep_time: "25 min",
      servings: "2 cortes",
      image_url: "/images/recipes/ribeye-parrilla.jpg",
      display_order: 1,
    },
    {
      name: "Arrachera a la Parrilla",
      description: "Arrachera marinada en jugo de naranja agria y especias, asada a fuego directo. Tradición norteña.",
      ingredients: ["Arrachera", "Naranja Valencia", "Ajo", "Cebolla blanca", "Sal", "Pimienta", "Cebolla cambray"],
      prep_time: "4 hrs (marinado) + 20 min",
      servings: "4 porciones",
      image_url: "/images/recipes/arrachera.jpg",
      display_order: 2,
    },
    {
      name: "Queso Fundido con Chorizo",
      description: "Queso asadero fundido con chorizo mexicano. Servido con tortillas de harina. El rey de las entradas.",
      ingredients: ["Queso asadero", "Chorizo", "Tortillas de harina", "Chile serrano", "Cilantro fresco"],
      prep_time: "15 min",
      servings: "6 porciones",
      image_url: "/images/recipes/queso-fundido.jpg",
      display_order: 3,
    },
  ],

  // ── 9. Cafeterías, Crepas y Desayunos ─────────────
  "cafeterias-crepas-desayunos": [
    {
      name: "Crepa Dulce de Nutella y Fresa",
      description: "Crepa francesa delgada rellena de nutella, fresas frescas y crema batida.",
      ingredients: ["Harina de trigo", "Huevo fresco", "Leche entera", "Mantequilla", "Nutella", "Fresa", "Crema para batir"],
      prep_time: "20 min",
      servings: "4 crepas",
      image_url: "/images/recipes/crepa-nutella.jpg",
      display_order: 1,
    },
    {
      name: "Huevos Rancheros",
      description: "Huevos estrellados sobre tortilla frita, bañados en salsa roja. El desayuno mexicano por excelencia.",
      ingredients: ["Huevo fresco", "Tortillas de maíz", "Jitomate saladet", "Chile serrano", "Cebolla blanca", "Frijoles refritos", "Aceite vegetal"],
      prep_time: "25 min",
      servings: "4 porciones",
      image_url: "/images/recipes/huevos-rancheros.jpg",
      display_order: 2,
    },
    {
      name: "Hot Cakes Americanos",
      description: "Hot cakes esponjosos con mantequilla y miel de maple. Ideal para desayunos y brunch.",
      ingredients: ["Harina para hot cakes", "Huevo fresco", "Leche entera", "Mantequilla", "Miel de maple"],
      prep_time: "20 min",
      servings: "8 hot cakes",
      image_url: "/images/recipes/hotcakes.jpg",
      display_order: 3,
    },
  ],

  // ── 10. Saludable, Ensaladas y Pokés ──────────────
  "saludable-ensaladas-pokes": [
    {
      name: "Poké Bowl de Atún",
      description: "Cubos de atún fresco marinado en soya y ajonjolí sobre arroz, con edamame, pepino y aguacate.",
      ingredients: ["Atún fresco", "Arroz para sushi", "Salsa de soya", "Ajonjolí", "Aguacate hass", "Pepino", "Edamame", "Alga nori"],
      prep_time: "20 min",
      servings: "4 bowls",
      image_url: "/images/recipes/poke-atun.jpg",
      display_order: 1,
    },
    {
      name: "Ensalada César con Pollo",
      description: "Lechuga romana con pechuga de pollo a la parrilla, crutones, parmesano y aderezo César.",
      ingredients: ["Lechuga romana", "Pechuga de pollo", "Queso parmesano", "Pan para crutones", "Limón agrio", "Aceite de oliva", "Ajo"],
      prep_time: "20 min",
      servings: "4 porciones",
      image_url: "/images/recipes/ensalada-cesar.jpg",
      display_order: 2,
    },
    {
      name: "Smoothie Energético Verde",
      description: "Bebida de espinaca, piña, plátano y jengibre. Energía limpia y deliciosa.",
      ingredients: ["Espinaca fresca", "Piña miel", "Plátano tabasco", "Jengibre fresco", "Miel de abeja"],
      prep_time: "10 min",
      servings: "2 smoothies",
      image_url: "/images/recipes/smoothie-verde.jpg",
      display_order: 3,
    },
  ],

  // ── 11. Postres, Panadería y Helados ──────────────
  "postres-panaderia-helados": [
    {
      name: "Pastel de Chocolate",
      description: "Bizcocho húmedo de chocolate con ganache cremoso. El pastel que todo restaurante necesita.",
      ingredients: ["Harina de trigo", "Cocoa en polvo", "Huevo fresco", "Mantequilla", "Azúcar", "Chispas de chocolate", "Crema para batir"],
      prep_time: "1 hr",
      servings: "12 rebanadas",
      image_url: "/images/recipes/pastel-chocolate.jpg",
      display_order: 1,
    },
    {
      name: "Conchas Mexicanas",
      description: "Pan dulce tradicional mexicano con cobertura de azúcar. Perfecto para cafeterías y desayunos.",
      ingredients: ["Harina de trigo", "Azúcar", "Mantequilla", "Huevo fresco", "Levadura", "Leche entera", "Vainilla"],
      prep_time: "2.5 hrs",
      servings: "12 conchas",
      image_url: "/images/recipes/conchas.jpg",
      display_order: 2,
    },
    {
      name: "Helado de Vainilla Artesanal",
      description: "Helado cremoso de vainilla hecho con yemas, crema y vainilla natural. Base para postres y servicio directo.",
      ingredients: ["Crema para batir", "Leche entera", "Yemas de huevo", "Azúcar", "Vainilla"],
      prep_time: "45 min + 4 hrs congelado",
      servings: "1 litro",
      image_url: "/images/recipes/helado-vainilla.jpg",
      display_order: 3,
    },
  ],

  // ── 12. Comida Árabe / Griega ─────────────────────
  "comida-arabe-griega": [
    {
      name: "Shawarma de Pollo",
      description: "Tiras de pollo marinado en especias árabes, servido en pan pita con jocoque y verduras.",
      ingredients: ["Pechuga de pollo", "Pan pita", "Jocoque", "Pepino", "Jitomate bola", "Cebolla morada", "Comino", "Pimentón"],
      prep_time: "40 min",
      servings: "6 shawarmas",
      image_url: "/images/recipes/shawarma-pollo.jpg",
      display_order: 1,
    },
    {
      name: "Gyro de Cerdo",
      description: "Carne de cerdo marinada con hierbas griegas, servida en pan pita con tzatziki y vegetales.",
      ingredients: ["Pierna de cerdo", "Pan pita", "Yogur griego", "Pepino", "Ajo", "Eneldo", "Limón agrio", "Aceite de oliva"],
      prep_time: "1 hr",
      servings: "6 gyros",
      image_url: "/images/recipes/gyro-cerdo.jpg",
      display_order: 2,
    },
    {
      name: "Hummus Casero",
      description: "Crema de garbanzo con tahini, limón y ajo. Entrada o acompañamiento esencial de la cocina árabe.",
      ingredients: ["Garbanzo", "Tahini", "Limón agrio", "Ajo", "Aceite de oliva", "Pimentón", "Pan pita"],
      prep_time: "15 min",
      servings: "8 porciones",
      image_url: "/images/recipes/hummus.jpg",
      display_order: 3,
    },
  ],

  // ── 13. Comida Venezolana / Latina ─────────────────
  "comida-venezolana-latina": [
    {
      name: "Arepas Reina Pepiada",
      description: "Arepa de harina PAN rellena de pollo deshebrado con aguacate y mayonesa. El ícono venezolano.",
      ingredients: ["Harina PAN", "Pechuga de pollo", "Aguacate hass", "Mayonesa", "Cebolla blanca", "Cilantro fresco", "Limón agrio"],
      prep_time: "40 min",
      servings: "6 arepas",
      image_url: "/images/recipes/arepas.jpg",
      display_order: 1,
    },
    {
      name: "Patacones",
      description: "Plátano macho verde frito, aplanado y vuelto a freír. Base crujiente para acompañar cualquier plato.",
      ingredients: ["Plátano macho", "Aceite vegetal", "Sal", "Ajo en polvo"],
      prep_time: "20 min",
      servings: "4 porciones",
      image_url: "/images/recipes/patacones.jpg",
      display_order: 2,
    },
    {
      name: "Empanadas Colombianas",
      description: "Empanadas de maíz rellenas de carne y papa con ají picante.",
      ingredients: ["Harina de maíz precocida", "Carne molida 80/20", "Papas blancas", "Cebolla blanca", "Comino", "Achiote", "Aceite vegetal"],
      prep_time: "50 min",
      servings: "12 empanadas",
      image_url: "/images/recipes/empanadas-colombianas.jpg",
      display_order: 3,
    },
  ],

  // ── 14. Bebidas, Bares y Botanas ───────────────────
  "bebidas-bares-botanas": [
    {
      name: "Michelada Clásica",
      description: "Cerveza con jugo de limón, salsa inglesa, salsa picante y sal en escarcha. La reina de las botanas.",
      ingredients: ["Cerveza clara", "Limón agrio", "Salsa inglesa", "Salsa picante", "Sal", "Hielo", "Chile en polvo"],
      prep_time: "5 min",
      servings: "1 michelada",
      image_url: "/images/recipes/michelada.jpg",
      display_order: 1,
    },
    {
      name: "Nachos Supreme",
      description: "Totopos con queso fundido, carne, jalapeños, crema y guacamole. El rey de las botanas.",
      ingredients: ["Totopos", "Queso cheddar rebanado", "Carne molida 80/20", "Jalapeños en escabeche", "Crema ácida", "Aguacate hass", "Jitomate saladet"],
      prep_time: "20 min",
      servings: "6 porciones",
      image_url: "/images/recipes/nachos.jpg",
      display_order: 2,
    },
    {
      name: "Limonada Natural",
      description: "Jugo de limón fresco con azúcar y agua mineral. Refrescante y natural.",
      ingredients: ["Limón agrio", "Azúcar", "Agua mineral", "Hielo", "Hierbabuena fresca"],
      prep_time: "10 min",
      servings: "2 litros",
      image_url: "/images/recipes/limonada.jpg",
      display_order: 3,
    },
  ],
}

/**
 * Obtiene las recetas para una colección específica.
 */
export function getCollectionRecipes(collectionSlug: string): RecipeInput[] {
  return RECIPES[collectionSlug] || []
}

/**
 * Obtiene todas las recetas agrupadas por colección.
 */
export function getAllRecipes(): Record<string, RecipeInput[]> {
  return RECIPES
}
