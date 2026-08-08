// Tipos y constantes compartidas del panel de costeo.

interface RecipeIngredient {
  name: string
  quantity: number
  unit: string
}

export interface Recipe {
  id: string
  name: string
  category: string
  portions: number
  ingredients: RecipeIngredient[]
}

export interface DishIngredient {
  ingredientName: string
  quantity: number
  unit: string
  unitPrice: number
}

interface DishModifier {
  id: string
  nombre: string
  precio: number
}

export interface Dish {
  id: string
  name: string
  ingredients: DishIngredient[]
  foodCostPercent: number
  sellingPrice: number
  category: string
  portions: number
  modificadores?: DishModifier[]
}

export interface ComboItem {
  dishId: string
  dishName: string
  qty: number
}

export interface Combo {
  id: string
  name: string
  items: ComboItem[]
  price: number
}

export interface IngredientOption {
  name: string
  unit: string
  price: number
}

export interface InventarioItem {
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
}

// Mock ingredients per collection type — in production this comes from Resurte.me catalog
export const MOCK_INGREDIENTS: Record<string, IngredientOption[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin 80/20", unit: "kg", price: 189 },
    { name: "Pan brioche para hamburguesa", unit: "pza", price: 8.5 },
    { name: "Queso cheddar rebanado", unit: "rebanada", price: 6 },
    { name: "Tocino ahumado", unit: "kg", price: 210 },
    { name: "Papas congeladas", unit: "kg", price: 52 },
    { name: "Lechuga iceberg", unit: "pza", price: 18 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
  ],
  "taquerias-antojitos": [
    { name: "Bistec de res para asada", unit: "kg", price: 220 },
    { name: "Carne de cerdo para pastor", unit: "kg", price: 165 },
    { name: "Tortilla de maíz taquera", unit: "kg", price: 32 },
    { name: "Cilantro fresco", unit: "manojo", price: 8 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
    { name: "Limón", unit: "kg", price: 30 },
    { name: "Queso asadero", unit: "kg", price: 145 },
    { name: "Salsa verde preparada", unit: "L", price: 48 },
  ],
  "pizzas-comida-italiana": [
    { name: "Harina de fuerza 00", unit: "kg", price: 42 },
    { name: "Queso mozzarella rallado", unit: "kg", price: 160 },
    { name: "Pepperoni rebanado", unit: "kg", price: 195 },
    { name: "Puré de tomate enlatado", unit: "lata 2.5kg", price: 65 },
    { name: "Aceite de oliva extra virgen", unit: "L", price: 180 },
    { name: "Albahaca fresca", unit: "manojo", price: 15 },
  ],
  "comida-mexicana-corrida": [
    { name: "Pechuga de pollo", unit: "kg", price: 120 },
    { name: "Arroz grano largo", unit: "kg", price: 28 },
    { name: "Frijol negro", unit: "kg", price: 35 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Chile serrano", unit: "kg", price: 40 },
    { name: "Tortilla de maíz", unit: "kg", price: 28 },
    { name: "Aceite vegetal", unit: "L", price: 45 },
  ],
  "mariscos-pescados": [
    { name: "Camarón mediano crudo", unit: "kg", price: 320 },
    { name: "Filete de pescado blanco", unit: "kg", price: 180 },
    { name: "Pulpo cocido", unit: "kg", price: 380 },
    { name: "Tostadas de maíz", unit: "paquete 20pz", price: 22 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
    { name: "Limón", unit: "kg", price: 30 },
  ],
  "pollo-alitas": [
    { name: "Alitas de pollo", unit: "kg", price: 95 },
    { name: "Boneless de pollo", unit: "kg", price: 130 },
    { name: "Salsa Buffalo", unit: "L", price: 85 },
    { name: "Salsa BBQ", unit: "L", price: 78 },
    { name: "Aceite por bidón", unit: "L", price: 42 },
    { name: "Aderezo blue cheese", unit: "L", price: 95 },
  ],
  "sushi-comida-asiatica": [
    { name: "Salmón grado sushi", unit: "kg", price: 480 },
    { name: "Arroz para sushi", unit: "kg", price: 55 },
    { name: "Alga nori", unit: "paquete 50h", price: 120 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
    { name: "Queso crema Philadelphia", unit: "kg", price: 150 },
    { name: "Salsa de soya", unit: "L", price: 72 },
  ],
  "cortes-carne-asaderos": [
    { name: "Ribeye importado", unit: "kg", price: 580 },
    { name: "Arrachera marinada", unit: "kg", price: 320 },
    { name: "Chorizo argentino", unit: "kg", price: 185 },
    { name: "Papa para asar", unit: "kg", price: 35 },
    { name: "Chile morrón", unit: "kg", price: 45 },
    { name: "Sal de grano", unit: "kg", price: 28 },
  ],
  "cafeterias-crepas-desayunos": [
    { name: "Huevo fresco", unit: "docena", price: 48 },
    { name: "Harina para hot cakes", unit: "kg", price: 38 },
    { name: "Café en grano", unit: "kg", price: 220 },
    { name: "Leche entera", unit: "L", price: 28 },
    { name: "Jarabe de maple", unit: "L", price: 130 },
    { name: "Nutella", unit: "kg", price: 180 },
  ],
  "saludable-ensaladas-pokes": [
    { name: "Salmón fresco", unit: "kg", price: 450 },
    { name: "Atún fresco", unit: "kg", price: 380 },
    { name: "Quinoa", unit: "kg", price: 85 },
    { name: "Mix de lechugas baby", unit: "kg", price: 72 },
    { name: "Edamame", unit: "kg", price: 65 },
    { name: "Aderezo de jengibre", unit: "L", price: 95 },
  ],
  "postres-panaderia-helados": [
    { name: "Harina de trigo", unit: "kg", price: 32 },
    { name: "Mantequilla sin sal", unit: "kg", price: 160 },
    { name: "Chocolate belga", unit: "kg", price: 280 },
    { name: "Crema para batir", unit: "L", price: 75 },
    { name: "Azúcar glass", unit: "kg", price: 35 },
    { name: "Vainilla natural", unit: "L", price: 350 },
  ],
  "comida-arabe-griega": [
    { name: "Carne de cordero", unit: "kg", price: 340 },
    { name: "Pechuga de pollo", unit: "kg", price: 120 },
    { name: "Garbanzo seco", unit: "kg", price: 42 },
    { name: "Tahini", unit: "kg", price: 160 },
    { name: "Pan pita", unit: "paquete 10pz", price: 38 },
    { name: "Yogur griego natural", unit: "L", price: 65 },
  ],
  "comida-venezolana-latina": [
    { name: "Harina P.A.N.", unit: "kg", price: 45 },
    { name: "Carne mechada", unit: "kg", price: 195 },
    { name: "Plátano macho", unit: "kg", price: 30 },
    { name: "Queso blanco duro", unit: "kg", price: 140 },
    { name: "Frijol negro", unit: "kg", price: 35 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
  ],
  "bebidas-bares-botanas": [
    { name: "Cacahuate japonés", unit: "kg", price: 72 },
    { name: "Cueritos encurtidos", unit: "kg", price: 55 },
    { name: "Alitas de pollo", unit: "kg", price: 95 },
    { name: "Limón", unit: "kg", price: 30 },
    { name: "Sal de grano", unit: "kg", price: 28 },
    { name: "Chile en polvo", unit: "kg", price: 85 },
  ],
}

// Recetas pregrabadas por tipo de colección — para costear platillos típicos al instante
export const PRESET_RECIPES: Record<string, Recipe[]> = {
  "hamburguesas-hot-dogs": [
    {
      id: "rec-hamburguesa-clasica", name: "Hamburguesa clásica", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Pan brioche para hamburguesa", quantity: 1, unit: "pza" },
        { name: "Carne molida sirloin 80/20", quantity: 0.16, unit: "kg" },
        { name: "Queso cheddar rebanado", quantity: 1, unit: "rebanada" },
        { name: "Lechuga iceberg", quantity: 0.03, unit: "pza" },
        { name: "Jitomate bola", quantity: 0.04, unit: "kg" },
      ],
    },
    {
      id: "rec-hamburguesa-bacon", name: "Hamburguesa con tocino", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Pan brioche para hamburguesa", quantity: 1, unit: "pza" },
        { name: "Carne molida sirloin 80/20", quantity: 0.18, unit: "kg" },
        { name: "Tocino ahumado", quantity: 0.05, unit: "kg" },
        { name: "Queso cheddar rebanado", quantity: 1, unit: "rebanada" },
        { name: "Cebolla blanca", quantity: 0.02, unit: "kg" },
      ],
    },
    {
      id: "rec-papas-francesa", name: "Papas a la francesa", category: "acompanamiento", portions: 4,
      ingredients: [
        { name: "Papas congeladas", quantity: 1, unit: "kg" },
      ],
    },
  ],
  "taquerias-antojitos": [
    {
      id: "rec-tacos-pastor", name: "Tacos al pastor", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Carne de cerdo para pastor", quantity: 0.12, unit: "kg" },
        { name: "Tortilla de maíz taquera", quantity: 0.12, unit: "kg" },
        { name: "Cilantro fresco", quantity: 0.02, unit: "manojo" },
        { name: "Cebolla blanca", quantity: 0.02, unit: "kg" },
        { name: "Salsa verde preparada", quantity: 0.03, unit: "L" },
      ],
    },
    {
      id: "rec-tacos-bistec", name: "Tacos de bistec", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Bistec de res para asada", quantity: 0.14, unit: "kg" },
        { name: "Tortilla de maíz taquera", quantity: 0.12, unit: "kg" },
        { name: "Cilantro fresco", quantity: 0.02, unit: "manojo" },
        { name: "Cebolla blanca", quantity: 0.02, unit: "kg" },
      ],
    },
    {
      id: "rec-quesadilla-asadero", name: "Quesadilla de asadero", category: "entrada", portions: 1,
      ingredients: [
        { name: "Tortilla de maíz taquera", quantity: 0.06, unit: "kg" },
        { name: "Queso asadero", quantity: 0.06, unit: "kg" },
      ],
    },
  ],
  "pizzas-comida-italiana": [
    {
      id: "rec-pizza-margarita", name: "Pizza margarita", category: "plato-fuerte", portions: 2,
      ingredients: [
        { name: "Harina de fuerza 00", quantity: 0.28, unit: "kg" },
        { name: "Puré de tomate enlatado", quantity: 0.15, unit: "lata 2.5kg" },
        { name: "Queso mozzarella rallado", quantity: 0.2, unit: "kg" },
        { name: "Aceite de oliva extra virgen", quantity: 0.02, unit: "L" },
        { name: "Albahaca fresca", quantity: 0.02, unit: "manojo" },
      ],
    },
    {
      id: "rec-pizza-pepperoni", name: "Pizza de pepperoni", category: "plato-fuerte", portions: 2,
      ingredients: [
        { name: "Harina de fuerza 00", quantity: 0.28, unit: "kg" },
        { name: "Puré de tomate enlatado", quantity: 0.15, unit: "lata 2.5kg" },
        { name: "Queso mozzarella rallado", quantity: 0.2, unit: "kg" },
        { name: "Pepperoni rebanado", quantity: 0.15, unit: "kg" },
      ],
    },
  ],
  "comida-mexicana-corrida": [
    {
      id: "rec-pollo-arroz", name: "Pollo con arroz", category: "plato-fuerte", portions: 4,
      ingredients: [
        { name: "Pechuga de pollo", quantity: 1, unit: "kg" },
        { name: "Arroz grano largo", quantity: 0.5, unit: "kg" },
        { name: "Aceite vegetal", quantity: 0.08, unit: "L" },
        { name: "Jitomate bola", quantity: 0.2, unit: "kg" },
      ],
    },
    {
      id: "rec-arroz-mexicana", name: "Arroz a la mexicana", category: "acompanamiento", portions: 4,
      ingredients: [
        { name: "Arroz grano largo", quantity: 0.5, unit: "kg" },
        { name: "Jitomate bola", quantity: 0.3, unit: "kg" },
        { name: "Aceite vegetal", quantity: 0.06, unit: "L" },
      ],
    },
    {
      id: "rec-frijoles-charros", name: "Frijoles charros", category: "acompanamiento", portions: 6,
      ingredients: [
        { name: "Frijol negro", quantity: 0.6, unit: "kg" },
        { name: "Tortilla de maíz", quantity: 0.1, unit: "kg" },
        { name: "Chile serrano", quantity: 0.05, unit: "kg" },
      ],
    },
  ],
  "mariscos-pescados": [
    {
      id: "rec-ceviche-camaron", name: "Ceviche de camarón", category: "entrada", portions: 4,
      ingredients: [
        { name: "Camarón mediano crudo", quantity: 0.8, unit: "kg" },
        { name: "Limón", quantity: 0.3, unit: "kg" },
        { name: "Tostadas de maíz", quantity: 1, unit: "paquete 20pz" },
        { name: "Aguacate hass", quantity: 0.2, unit: "kg" },
      ],
    },
    {
      id: "rec-filete-plancha", name: "Filete de pescado a la plancha", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Filete de pescado blanco", quantity: 0.2, unit: "kg" },
        { name: "Limón", quantity: 0.03, unit: "kg" },
      ],
    },
    {
      id: "rec-tostadas-pulpo", name: "Tostadas de pulpo", category: "entrada", portions: 4,
      ingredients: [
        { name: "Pulpo cocido", quantity: 0.6, unit: "kg" },
        { name: "Tostadas de maíz", quantity: 1, unit: "paquete 20pz" },
        { name: "Aguacate hass", quantity: 0.3, unit: "kg" },
      ],
    },
  ],
  "pollo-alitas": [
    {
      id: "rec-alitas-bbq", name: "Alitas BBQ", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Alitas de pollo", quantity: 0.3, unit: "kg" },
        { name: "Salsa BBQ", quantity: 0.04, unit: "L" },
        { name: "Aceite por bidón", quantity: 0.03, unit: "L" },
      ],
    },
    {
      id: "rec-boneless-buffalo", name: "Boneless Buffalo", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Boneless de pollo", quantity: 0.25, unit: "kg" },
        { name: "Salsa Buffalo", quantity: 0.05, unit: "L" },
        { name: "Aderezo blue cheese", quantity: 0.03, unit: "L" },
      ],
    },
  ],
  "sushi-comida-asiatica": [
    {
      id: "rec-roll-philadelphia", name: "Roll de salmón Philadelphia", category: "plato-fuerte", portions: 2,
      ingredients: [
        { name: "Salmón grado sushi", quantity: 0.2, unit: "kg" },
        { name: "Arroz para sushi", quantity: 0.3, unit: "kg" },
        { name: "Alga nori", quantity: 0.5, unit: "paquete 50h" },
        { name: "Aguacate hass", quantity: 0.1, unit: "kg" },
        { name: "Queso crema Philadelphia", quantity: 0.1, unit: "kg" },
      ],
    },
    {
      id: "rec-nigiri-salmon", name: "Nigiri de salmón", category: "plato-fuerte", portions: 4,
      ingredients: [
        { name: "Salmón grado sushi", quantity: 0.15, unit: "kg" },
        { name: "Arroz para sushi", quantity: 0.2, unit: "kg" },
        { name: "Alga nori", quantity: 0.25, unit: "paquete 50h" },
      ],
    },
  ],
  "cortes-carne-asaderos": [
    {
      id: "rec-ribeye", name: "Ribeye a la parrilla", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Ribeye importado", quantity: 0.35, unit: "kg" },
        { name: "Sal de grano", quantity: 0.01, unit: "kg" },
      ],
    },
    {
      id: "rec-arrachera-papas", name: "Arrachera con papas", category: "plato-fuerte", portions: 2,
      ingredients: [
        { name: "Arrachera marinada", quantity: 0.6, unit: "kg" },
        { name: "Papa para asar", quantity: 0.6, unit: "kg" },
        { name: "Sal de grano", quantity: 0.01, unit: "kg" },
      ],
    },
  ],
  "cafeterias-crepas-desayunos": [
    {
      id: "rec-hotcakes-maple", name: "Hot cakes con maple", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Harina para hot cakes", quantity: 0.2, unit: "kg" },
        { name: "Huevo fresco", quantity: 0.25, unit: "docena" },
        { name: "Leche entera", quantity: 0.15, unit: "L" },
        { name: "Jarabe de maple", quantity: 0.05, unit: "L" },
      ],
    },
    {
      id: "rec-crepa-nutella", name: "Crepa de Nutella", category: "postre", portions: 1,
      ingredients: [
        { name: "Harina para hot cakes", quantity: 0.06, unit: "kg" },
        { name: "Leche entera", quantity: 0.1, unit: "L" },
        { name: "Huevo fresco", quantity: 0.08, unit: "docena" },
        { name: "Nutella", quantity: 0.05, unit: "kg" },
      ],
    },
  ],
  "saludable-ensaladas-pokes": [
    {
      id: "rec-poke-salmon", name: "Poke de salmón", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Salmón fresco", quantity: 0.15, unit: "kg" },
        { name: "Quinoa", quantity: 0.08, unit: "kg" },
        { name: "Mix de lechugas baby", quantity: 0.05, unit: "kg" },
        { name: "Edamame", quantity: 0.05, unit: "kg" },
        { name: "Aderezo de jengibre", quantity: 0.03, unit: "L" },
      ],
    },
    {
      id: "rec-ensalada-atun", name: "Ensalada de atún", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Atún fresco", quantity: 0.15, unit: "kg" },
        { name: "Mix de lechugas baby", quantity: 0.1, unit: "kg" },
        { name: "Edamame", quantity: 0.05, unit: "kg" },
        { name: "Aderezo de jengibre", quantity: 0.03, unit: "L" },
      ],
    },
  ],
  "postres-panaderia-helados": [
    {
      id: "rec-brownie", name: "Brownie de chocolate", category: "postre", portions: 8,
      ingredients: [
        { name: "Harina de trigo", quantity: 0.3, unit: "kg" },
        { name: "Chocolate belga", quantity: 0.3, unit: "kg" },
        { name: "Mantequilla sin sal", quantity: 0.2, unit: "kg" },
        { name: "Azúcar glass", quantity: 0.15, unit: "kg" },
      ],
    },
    {
      id: "rec-pay-manzana", name: "Pay de manzana", category: "postre", portions: 8,
      ingredients: [
        { name: "Harina de trigo", quantity: 0.4, unit: "kg" },
        { name: "Mantequilla sin sal", quantity: 0.25, unit: "kg" },
        { name: "Azúcar glass", quantity: 0.2, unit: "kg" },
        { name: "Crema para batir", quantity: 0.3, unit: "L" },
      ],
    },
  ],
  "comida-arabe-griega": [
    {
      id: "rec-shawarma-pollo", name: "Shawarma de pollo", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Pechuga de pollo", quantity: 0.15, unit: "kg" },
        { name: "Pan pita", quantity: 0.1, unit: "paquete 10pz" },
        { name: "Tahini", quantity: 0.02, unit: "kg" },
        { name: "Yogur griego natural", quantity: 0.03, unit: "L" },
      ],
    },
    {
      id: "rec-hummus-pita", name: "Hummus con pita", category: "entrada", portions: 4,
      ingredients: [
        { name: "Garbanzo seco", quantity: 0.3, unit: "kg" },
        { name: "Tahini", quantity: 0.1, unit: "kg" },
        { name: "Pan pita", quantity: 1, unit: "paquete 10pz" },
      ],
    },
  ],
  "comida-venezolana-latina": [
    {
      id: "rec-arepa-reina", name: "Arepa reina pepiada", category: "plato-fuerte", portions: 1,
      ingredients: [
        { name: "Harina P.A.N.", quantity: 0.1, unit: "kg" },
        { name: "Pechuga de pollo", quantity: 0.12, unit: "kg" },
        { name: "Aguacate hass", quantity: 0.1, unit: "kg" },
      ],
    },
    {
      id: "rec-pabellon", name: "Pabellón criollo", category: "plato-fuerte", portions: 2,
      ingredients: [
        { name: "Carne mechada", quantity: 0.4, unit: "kg" },
        { name: "Frijol negro", quantity: 0.3, unit: "kg" },
        { name: "Plátano macho", quantity: 0.3, unit: "kg" },
        { name: "Queso blanco duro", quantity: 0.1, unit: "kg" },
      ],
    },
  ],
  "bebidas-bares-botanas": [
    {
      id: "rec-alitas-chile", name: "Alitas con chile y limón", category: "acompanamiento", portions: 4,
      ingredients: [
        { name: "Alitas de pollo", quantity: 1, unit: "kg" },
        { name: "Chile en polvo", quantity: 0.05, unit: "kg" },
        { name: "Limón", quantity: 0.2, unit: "kg" },
        { name: "Sal de grano", quantity: 0.02, unit: "kg" },
      ],
    },
    {
      id: "rec-cacahuates", name: "Cacahuates japoneses", category: "acompanamiento", portions: 4,
      ingredients: [
        { name: "Cacahuate japonés", quantity: 0.5, unit: "kg" },
        { name: "Sal de grano", quantity: 0.02, unit: "kg" },
      ],
    },
  ],
}

export const DEFAULT_INGREDIENTS: IngredientOption[] = [
  { name: "Ingrediente 1", unit: "kg", price: 0 },
  { name: "Ingrediente 2", unit: "kg", price: 0 },
]

export const DISH_CATEGORIES = [
  { key: "todas", label: "Todas", color: "bg-gray-100 text-gray-700" },
  { key: "entrada", label: "Entrada", color: "bg-amber-100 text-amber-700" },
  { key: "plato-fuerte", label: "Plato fuerte", color: "bg-red-100 text-red-700" },
  { key: "postre", label: "Postre", color: "bg-pink-100 text-pink-700" },
  { key: "bebida", label: "Bebida", color: "bg-blue-100 text-blue-700" },
  { key: "acompanamiento", label: "Acompañamiento", color: "bg-green-100 text-green-700" },
]

export const CATEGORY_EMOJI: Record<string, string> = {
  entrada: "🥗",
  "plato-fuerte": "🍽️",
  postre: "🍰",
  bebida: "🥤",
  acompanamiento: "🍟",
  todas: "📋",
}
