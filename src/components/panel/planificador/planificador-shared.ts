// Datos estáticos y tipos compartidos del Planificador de pedidos.
// Extraído de src/app/panel/planificador/page.tsx (Fase 11).

export interface PlannerProduct {
  name: string
  unit: string
  price: number
  perPerson: number
  category: string
}

// Suggested items per collection based on typical restaurant needs
export const COLLECTION_PRODUCTS: Record<string, PlannerProduct[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin", unit: "kg", price: 189, perPerson: 0.18, category: "Proteína" },
    { name: "Pan brioche", unit: "pza", price: 8.5, perPerson: 1, category: "Pan" },
    { name: "Queso cheddar", unit: "rebanada", price: 6, perPerson: 1, category: "Lácteos" },
    { name: "Papas congeladas", unit: "kg", price: 52, perPerson: 0.15, category: "Acompañamiento" },
    { name: "Lechuga", unit: "pza", price: 18, perPerson: 0.1, category: "Verdura" },
    { name: "Jitomate", unit: "kg", price: 35, perPerson: 0.04, category: "Verdura" },
    { name: "Tocino", unit: "kg", price: 210, perPerson: 0.03, category: "Proteína" },
  ],
  "taquerias-antojitos": [
    { name: "Bistec de res", unit: "kg", price: 220, perPerson: 0.15, category: "Proteína" },
    { name: "Carne de pastor", unit: "kg", price: 165, perPerson: 0.12, category: "Proteína" },
    { name: "Tortilla taquera", unit: "kg", price: 32, perPerson: 0.1, category: "Tortillas" },
    { name: "Cilantro", unit: "manojo", price: 8, perPerson: 0.05, category: "Verdura" },
    { name: "Cebolla", unit: "kg", price: 28, perPerson: 0.03, category: "Verdura" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.04, category: "Fruta" },
    { name: "Salsa verde", unit: "L", price: 48, perPerson: 0.015, category: "Salsas" },
  ],
  "pizzas-comida-italiana": [
    { name: "Harina 00", unit: "kg", price: 42, perPerson: 0.15, category: "Harinas" },
    { name: "Mozzarella", unit: "kg", price: 160, perPerson: 0.12, category: "Lácteos" },
    { name: "Pepperoni", unit: "kg", price: 195, perPerson: 0.04, category: "Proteína" },
    { name: "Puré de tomate", unit: "lata 2.5kg", price: 65, perPerson: 0.05, category: "Salsas" },
    { name: "Aceite de oliva", unit: "L", price: 180, perPerson: 0.005, category: "Aceites" },
  ],
  "comida-mexicana-corrida": [
    { name: "Pechuga de pollo", unit: "kg", price: 120, perPerson: 0.2, category: "Proteína" },
    { name: "Arroz", unit: "kg", price: 28, perPerson: 0.08, category: "Granos" },
    { name: "Frijol", unit: "kg", price: 35, perPerson: 0.06, category: "Granos" },
    { name: "Jitomate", unit: "kg", price: 35, perPerson: 0.06, category: "Verdura" },
    { name: "Tortillas", unit: "kg", price: 28, perPerson: 0.08, category: "Tortillas" },
    { name: "Aceite vegetal", unit: "L", price: 45, perPerson: 0.008, category: "Aceites" },
  ],
  "sushi-comida-asiatica": [
    { name: "Salmón grado sushi", unit: "kg", price: 480, perPerson: 0.1, category: "Proteína" },
    { name: "Arroz para sushi", unit: "kg", price: 55, perPerson: 0.12, category: "Granos" },
    { name: "Alga nori", unit: "hoja", price: 2.5, perPerson: 2, category: "Algas" },
    { name: "Aguacate", unit: "kg", price: 65, perPerson: 0.05, category: "Fruta" },
    { name: "Queso crema", unit: "kg", price: 150, perPerson: 0.03, category: "Lácteos" },
    { name: "Salsa de soya", unit: "L", price: 72, perPerson: 0.01, category: "Salsas" },
  ],
  "cortes-carne-asaderos": [
    { name: "Ribeye", unit: "kg", price: 580, perPerson: 0.35, category: "Proteína" },
    { name: "Arrachera", unit: "kg", price: 320, perPerson: 0.3, category: "Proteína" },
    { name: "Chorizo argentino", unit: "kg", price: 185, perPerson: 0.15, category: "Proteína" },
    { name: "Papa para asar", unit: "kg", price: 35, perPerson: 0.2, category: "Guarnición" },
    { name: "Chile morrón", unit: "kg", price: 45, perPerson: 0.08, category: "Verdura" },
  ],
  "pollo-alitas": [
    { name: "Alitas de pollo", unit: "kg", price: 95, perPerson: 0.35, category: "Proteína" },
    { name: "Boneless", unit: "kg", price: 130, perPerson: 0.3, category: "Proteína" },
    { name: "Salsa Buffalo", unit: "L", price: 85, perPerson: 0.04, category: "Salsas" },
    { name: "Papas fritas", unit: "kg", price: 52, perPerson: 0.15, category: "Acompañamiento" },
    { name: "Aderezo ranch", unit: "L", price: 68, perPerson: 0.02, category: "Salsas" },
  ],
  "cafeterias-crepas-desayunos": [
    { name: "Huevo", unit: "docena", price: 48, perPerson: 0.17, category: "Proteína" },
    { name: "Harina hot cakes", unit: "kg", price: 38, perPerson: 0.12, category: "Harinas" },
    { name: "Café en grano", unit: "kg", price: 220, perPerson: 0.015, category: "Bebidas" },
    { name: "Leche", unit: "L", price: 28, perPerson: 0.2, category: "Lácteos" },
    { name: "Jarabe de maple", unit: "L", price: 130, perPerson: 0.015, category: "Endulzantes" },
  ],
  "mariscos-pescados": [
    { name: "Camarón mediano", unit: "kg", price: 320, perPerson: 0.2, category: "Proteína" },
    { name: "Filete de pescado", unit: "kg", price: 180, perPerson: 0.25, category: "Proteína" },
    { name: "Pulpo cocido", unit: "kg", price: 380, perPerson: 0.15, category: "Proteína" },
    { name: "Tostadas", unit: "paquete 20pz", price: 22, perPerson: 0.15, category: "Base" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.05, category: "Fruta" },
    { name: "Aguacate", unit: "kg", price: 65, perPerson: 0.08, category: "Fruta" },
  ],
  "saludable-ensaladas-pokes": [
    { name: "Salmón fresco", unit: "kg", price: 450, perPerson: 0.15, category: "Proteína" },
    { name: "Atún fresco", unit: "kg", price: 380, perPerson: 0.15, category: "Proteína" },
    { name: "Quinoa", unit: "kg", price: 85, perPerson: 0.08, category: "Granos" },
    { name: "Mix lechugas", unit: "kg", price: 72, perPerson: 0.12, category: "Verdura" },
    { name: "Edamame", unit: "kg", price: 65, perPerson: 0.05, category: "Proteína" },
  ],
  "postres-panaderia-helados": [
    { name: "Harina de trigo", unit: "kg", price: 32, perPerson: 0.15, category: "Harinas" },
    { name: "Mantequilla", unit: "kg", price: 160, perPerson: 0.05, category: "Lácteos" },
    { name: "Chocolate belga", unit: "kg", price: 280, perPerson: 0.04, category: "Chocolate" },
    { name: "Crema para batir", unit: "L", price: 75, perPerson: 0.06, category: "Lácteos" },
    { name: "Azúcar", unit: "kg", price: 35, perPerson: 0.05, category: "Endulzantes" },
    { name: "Huevo", unit: "docena", price: 48, perPerson: 0.08, category: "Proteína" },
  ],
  "comida-arabe-griega": [
    { name: "Carne de cordero", unit: "kg", price: 340, perPerson: 0.2, category: "Proteína" },
    { name: "Pechuga de pollo", unit: "kg", price: 120, perPerson: 0.2, category: "Proteína" },
    { name: "Garbanzo", unit: "kg", price: 42, perPerson: 0.1, category: "Granos" },
    { name: "Tahini", unit: "kg", price: 160, perPerson: 0.015, category: "Salsas" },
    { name: "Pan pita", unit: "pza", price: 4, perPerson: 2, category: "Pan" },
    { name: "Yogur griego", unit: "L", price: 65, perPerson: 0.04, category: "Lácteos" },
  ],
  "comida-venezolana-latina": [
    { name: "Harina P.A.N.", unit: "kg", price: 45, perPerson: 0.15, category: "Harinas" },
    { name: "Carne mechada", unit: "kg", price: 195, perPerson: 0.18, category: "Proteína" },
    { name: "Plátano macho", unit: "kg", price: 30, perPerson: 0.2, category: "Acompañamiento" },
    { name: "Queso blanco", unit: "kg", price: 140, perPerson: 0.06, category: "Lácteos" },
    { name: "Frijol negro", unit: "kg", price: 35, perPerson: 0.08, category: "Granos" },
  ],
  "bebidas-bares-botanas": [
    { name: "Cacahuate", unit: "kg", price: 72, perPerson: 0.05, category: "Botana" },
    { name: "Cueritos", unit: "kg", price: 55, perPerson: 0.06, category: "Botana" },
    { name: "Alitas", unit: "kg", price: 95, perPerson: 0.2, category: "Proteína" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.03, category: "Fruta" },
    { name: "Chile en polvo", unit: "kg", price: 85, perPerson: 0.003, category: "Condimentos" },
  ],
}

export const DEFAULT_PRODUCTS: PlannerProduct[] = [
  { name: "Proteína principal", unit: "kg", price: 180, perPerson: 0.2, category: "Proteína" },
  { name: "Acompañamiento", unit: "kg", price: 40, perPerson: 0.15, category: "Guarnición" },
  { name: "Verdura", unit: "kg", price: 30, perPerson: 0.08, category: "Verdura" },
]

export interface WasteCategory {
  key: string
  label: string
  defaultPct: number
  color: string
}

// Waste super-categories with default percentages
export const WASTE_CATEGORIES: WasteCategory[] = [
  { key: "Proteína", label: "Proteínas", defaultPct: 8, color: "red" },
  { key: "Verdura", label: "Verduras", defaultPct: 12, color: "green" },
  { key: "Lácteos", label: "Lácteos", defaultPct: 5, color: "blue" },
  { key: "Secos", label: "Granos / Harinas / Secos", defaultPct: 3, color: "amber" },
  { key: "Otros", label: "Otros (salsas, condimentos, bebidas)", defaultPct: 2, color: "gray" },
]

// Map product category names to waste super-categories
export function getWasteCategory(productCategory: string): string {
  const proteina = ["Proteína", "Carne"]
  const verdura = ["Verdura", "Fruta", "Acompañamiento"]
  const lacteos = ["Lácteos", "Queso"]
  const secos = ["Granos", "Harinas", "Endulzantes", "Chocolate", "Pan"]
  if (proteina.some((k) => productCategory.includes(k))) return "Proteína"
  if (verdura.some((k) => productCategory.includes(k))) return "Verdura"
  if (lacteos.some((k) => productCategory.includes(k))) return "Lácteos"
  if (secos.some((k) => productCategory.includes(k))) return "Secos"
  return "Otros"
}
