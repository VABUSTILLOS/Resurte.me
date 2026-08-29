# Resurte.me

Marketplace mayorista de insumos para restaurantes en México + suite de herramientas de gestión (SaaS) para restauranteros.

## Áreas del producto

| Ruta | Descripción |
| --- | --- |
| `/` y `/[ciudad]` | Landing pública y catálogo por ciudad (marketplace B2B). |
| `/panel` | Suite de ~13 herramientas para restaurantes: ventas, comanda, mermas, costeo, inventario, planificador, temporada, apertura, personal, rentabilidad, analítica y FoodOS (menú digital). |
| `/admin` | Backoffice interno: pedidos, productos, visibilidad, WhatsApp y workflows. |
| `/negocio` | Portal B2B para negocios aliados. |
| `/comercializacion` | Flujos de comercialización. |

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** estricto
- **Tailwind CSS 4**
- **Supabase** (base de datos, auth, storage)
- **Stripe** (pagos)
- **Vitest** (unitarios) + **Playwright** (e2e) + **knip** (código muerto)

## Desarrollo

```bash
npm install
cp .env.local.example .env.local   # completa los valores
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:e2e` | Tests e2e (Playwright) |

## Variables de entorno

Todas están documentadas en [`.env.local.example`](.env.local.example): Supabase, URL del sitio, GA4, verificación de Google y CSP.

## Documentación

- [`docs/OPS.md`](docs/OPS.md) — operación
- [`docs/MOCKS.md`](docs/MOCKS.md) — mocks y datos de prueba
- [`docs/agente-ia.md`](docs/agente-ia.md) — guía del agente IA
- [`docs/guia-captura-campo.md`](docs/guia-captura-campo.md) — captura en campo
