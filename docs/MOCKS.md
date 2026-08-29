# Contrato de mocks fallback — Resurte.me

> Documenta **por qué existen los datos de respaldo (mocks)** en las herramientas del panel, **cómo se combinan con los datos reales** de Supabase y **por qué NO deben eliminarse** como "datos falsos".

## Resumen ejecutivo

Hay **2 pares de datos de respaldo** en la app, ambos en herramientas del panel (`src/app/panel/`):

| Par | Archivo | Propósito | Mecanismo de fusión |
| --- | --- | --- | --- |
| `MOCK_INGREDIENTS` + `DEFAULT_INGREDIENTS` | `src/components/panel/costeo/costeo-shared.ts` (líneas 69, 495) | Ingredientes de ejemplo para el **costeo** | `mergeWithCatalog()` en `src/lib/catalog.ts` (línea 50) |
| `DISH_DATA` + `DEFAULT_DISHES` | `src/app/panel/rentabilidad/page.tsx` (líneas 19, 140) | Platillos de ejemplo para **rentabilidad** | Dedupe por nombre normalizado contra dishes del costeo |

**Regla de oro**: el catálogo/datos reales **siempre ganan** sobre los mocks. Los mocks son un *skeleton de respaldo* para que las herramientas funcionen aunque el restaurante aún no haya cargado su catálogo real — **nunca aparecen en pantalla como datos falsos cuando existen datos reales**.

---

## 1. Costeo — `MOCK_INGREDIENTS` / `DEFAULT_INGREDIENTS`

**Ubicación**: `src/components/panel/costeo/costeo-shared.ts`, líneas 69 y 495 (~400 líneas de datos).

### Estructura
```ts
export const MOCK_INGREDIENTS: Record<string, IngredientOption[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin 80/20", unit: "kg", price: 189 },
    // ... ~8 ingredientes por categoría
  ],
  "taquerias-antojitos": [ /* ... */ ],
  // 15 categorías de restaurante (slugs)
}

export const DEFAULT_INGREDIENTS: IngredientOption[] = [
  { name: "Ingrediente 1", unit: "kg", price: 0 },
  { name: "Ingrediente 2", unit: "kg", price: 0 },
]
```

- Las claves son **slugs de categoría de restaurante** (e.g. `"hamburguesas-hot-dogs"`, `"taquerias-antojitos"`, `"mariscos-pescados"`, `"pizzas-comida-italiana"`…). No son slugs de restaurantes individuales.
- Si la categoría del restaurante seleccionado no tiene entrada → cae a `DEFAULT_INGREDIENTS` (2 placeholders con precio 0).

### Consumo (contrato)
En `src/app/panel/costeo/page.tsx` (líneas 43-59):
```ts
const mockIngredients = selectedCollection
  ? (MOCK_INGREDIENTS[selectedCollection.slug] || DEFAULT_INGREDIENTS)
  : DEFAULT_INGREDIENTS

const [catalogIngredients, setCatalogIngredients] = useState<CatalogProduct[]>([])
useEffect(() => { /* getCatalogProducts() → productos reales is_visible de Supabase */ }, [])

const ingredients = useMemo(
  () => mergeWithCatalog(mockIngredients, catalogIngredients),
  [mockIngredients, catalogIngredients],
)
```

---

## 2. El contrato de `mergeWithCatalog` (`src/lib/catalog.ts:50`)

```ts
export function mergeWithCatalog(mock, catalog) {
  if (catalog.length === 0) return mock          // (1) catálogo vacío → mocks puros
  // (2) catálogo primero: precios autoritativos
  catalog.forEach((p) => { /* push si normalizeName no visto */ })
  // (3) mocks rellenan huecos que el catálogo no cubre
  mock.forEach((m) => { /* push si normalizeName no visto */ })
}
```

Reglas del contrato:

1. **Catálogo vacío → mocks completos**: si Supabase no devuelve productos (no configurado, error, o restaurante sin catálogo), se usa el mock tal cual. La herramienta sigue siendo útil.
2. **Catálogo gana por nombre normalizado**: un producto real con el mismo `normalizeName()` que un mock **reemplaza** al mock (precio real autoritativo). `normalizeName` viene de `src/lib/normalize.ts`.
3. **Los mocks rellenan huecos**: ingredientes de ejemplo que el catálogo no cubre se mantienen en la lista (p.ej. ingredientes de marca genérica que el restaurante aún no da de alta).
4. **El catálogo solo carga productos `is_visible = true`** ordenados por nombre (`catalog.ts:22-26`).
5. **Cache en memoria**: `getCatalogProducts()` memoiza la promesa en `cachePromise` (módulo-level, por sesión del panel); `resetCatalogCache()` la invalida (exportada para tests/mantenimiento).

> **Por qué no borrar los mocks**: son la *barrera de degradación*. Si se eliminan y el catálogo está vacío, la herramienta de costeo deja de servir (lista vacía + UX rota). Son intencionales y están documentados — no son datos falsos en pantalla.

---

## 3. Rentabilidad — `DISH_DATA` / `DEFAULT_DISHES`

**Ubicación**: `src/app/panel/rentabilidad/page.tsx`, líneas 19 y 140.

```ts
const DISH_DATA: Record<string, DishData[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Hamburguesa clásica", cost: 48, price: 149, category: "Burgers" },
    // ... platillos con cost/price/category/alert
  ],
  // 14 categorías
}

const DEFAULT_DISHES: DishData[] = [
  { name: "Platillo estrella", cost: 45, price: 140, category: "Principal" },
  // ...
]
```

### Consumo (contrato)
En `src/app/panel/rentabilidad/page.tsx` (líneas 172-200):
```ts
const mockDishes = selectedCollection
  ? (DISH_DATA[selectedCollection.slug] || DEFAULT_DISHES)
  : DEFAULT_DISHES

// Dishes reales del costeo (localStorage + sync a BD vía /api/panel/dishes)
const costeoDishes: DishData[] = useMemo(() => /* sharedDishes → {name, cost, price, ...} */)

const dishes = useMemo(() => {
  // Dedupe por nombre: los dishes del costeo reemplazan a los mock
  const costeoNames = new Set(costeoDishes.map((d) => normalizeName(d.name)))
  const filteredMock = mockDishes.filter((d) => !costeoNames.has(normalizeName(d.name)))
  let merged = [...costeoDishes, ...filteredMock]
  // Aplica overrides de precio guardados por el usuario
  merged = merged.map((d) => ({ ...d, price: priceOverrides[d.name] ?? d.price }))
  // ...
})
```

Reglas:

1. **Datos reales del costeo ganan**: los platillos creados en la herramienta de costeo reemplazan a los del mock con el mismo `normalizeName()`. Se persisten con `useSharedDishes`: localStorage como cache inmediato y tabla `panel_dishes` (migración 00053) sincronizada por dueño (sesión o `guest_token` anónimo) y colección vía `/api/panel/dishes`; al iniciar sesión, `/api/addresses/claim` reclama las filas guest.
2. **Sin categoría seleccionada** → solo `DEFAULT_DISHES`.
3. **`alert` en mocks** = pistas de food cost (p.ej. "Costo elevado — considera ajustar porción de portobello") — contenido educativo, no datos de producción.

---

## 4. Riesgos y qué NO hacer

| Riesgo | Acción correcta |
| --- | --- |
| Confundir mocks con "datos falsos en producción" y borrarlos | **NO eliminar**. Documentados como fallback intencional. Verificar con la regla de oro: solo visibles cuando no hay datos reales. |
| Añadir precios irreales a los mocks (p.ej. inflar `price` para que el costeo "se vea bien") | Actualizar solo si cambia el mercado; los mocks deben reflejar costos realistas de ingredientes típicos. |
| Depender de los mocks para validación de dinero | **Nunca**. El flujo de pagos real (`/api/payments/stripe`, checkout) NO usa mocks — usa `products`/`product_stores` de Supabase con RLS y triggers de precio. |
| Duplicar `MOCK_INGREDIENTS`/`DISH_DATA` en otro archivo | Reutilizar los exports existentes; un solo lugar de verdad para cada par. |
| Modificar `mergeWithCatalog` sin actualizar este doc | El contrato (catálogo gana por `normalizeName`, mocks rellenan huecos, catálogo vacío → mocks) es la especificación de comportamiento. |

## 5. Verificación (smoke de degradación)

1. Panel → **Costeo**: con `NEXT_PUBLIC_SUPABASE_URL` inválido (o sin catálogo), la lista de ingredientes muestra los `MOCK_INGREDIENTS` de la categoría.
2. Panel → **Costeo** con catálogo cargado: los precios mostrados son los de `products` (reales), no los del mock.
3. Panel → **Rentabilidad**: con dishes guardados en costeo, esos aparecen con la etiqueta "Mi menú" y los mock con la misma categoría desaparecen de la lista.

---

## Referencias

- Código: `src/lib/catalog.ts` (merge), `src/lib/normalize.ts` (normalizeName), `src/components/panel/costeo/costeo-shared.ts` (mocks), `src/app/panel/costeo/page.tsx`, `src/app/panel/rentabilidad/page.tsx`.
- Relacionado: `docs/OPS.md` (crons y operaciones), `REPORTE.md` (revivir código muerto), `supabase/ESQUEMA.md` (drift de esquema).
