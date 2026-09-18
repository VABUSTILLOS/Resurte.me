# Auditoría de estatus — 54 superficies de producto

> Medición del estado real de cada herramienta del restaurante y de cada función
> del panel admin, para saber qué es fuerte y dónde flaquea el sitio.
>
> **Método:** tres auditorías independientes por subsistema (panel del
> restaurante, FoodOS, admin), cada una obligada a citar archivo y línea y a
> **buscar contraejemplos a la documentación**. La documentación de este repo es
> detallada y se auto-vigila, así que una auditoría que repita los docs no sirve:
> el valor está en contrastarlos contra el código.
>
> **Medición de salud:** `npm run verify` en verde — typecheck, lint,
> **349 archivos de test / 6,080 tests**, `knip` exit 0. 177 migraciones, 22
> specs e2e. **Ninguna herramienta del sitio está rota ni es humo.**
>
> **Advertencia sobre `git log`:** los commits de este árbol son autocommits
> `"Save uncommitted changes"` de la app. No atribuyen trabajo ni expresan
> intención; el historial se ignoró como fuente.

---

## 1. Mapa: un sitio, tres productos, 54 superficies

| Producto | Audiencia | Superficies | Líneas de página |
|---|---|---|---|
| Panel del restaurante (`/panel`) | Dueño, gerente, cocina, mesero, cajero | **13** | 6,085 |
| FoodOS (`/panel/foodos` + `/r/[slug]`) | Restaurante + comensal final | **21** | 16,177 |
| Panel admin (`/admin`) | Resurte.me internamente | **20** | 17,460 |

> Líneas = suma de los `page.tsx` de cada producto, medida con
> `find <dir> -name page.tsx -exec cat {} + | wc -l`. FoodOS excluye `/panel`.

### Escala de estatus

| Estado | Significado |
|---|---|
| **Fuerte** | Funciona de punta a punta con datos reales, tiene tests que lo vigilan y no arrastra deuda que le impida operar. |
| **Sólido** | Funciona con datos reales y cubre su caso de uso, pero le falta algo acotado (tests de superficie, un caso borde, un consumidor). |
| **Parcial** | El alcance es deliberadamente menor al que su nombre promete. |
| **Stub** | Declarado y visible en la UI, sin implementación real. |
| **No existe** | Se esperaría por el contexto del negocio, y no está. |

---

## 2. Panel del restaurante — `/panel` (13 herramientas)

La persistencia **no es localStorage**. `src/hooks/use-synced-storage.ts` (259) y
`src/hooks/use-synced-rows.ts` (313) escriben en Supabase vía
`PUT /api/panel/entries` y `POST /api/panel/rows`, con localStorage como caché
inmediato y resolución de conflictos 409 (`src/lib/panel-merge.ts`, 194). Hay
sync multi-dispositivo real. `personal` y `unirse` no usan localStorage en
absoluto: van directo a la API.

| Herramienta | Qué hace | Persistencia | Rol | Tests | Estado |
|---|---|---|---|---|---|
| `/panel` (hub) | Métricas agregadas de ventas, mermas, inventario, mesas, comandas y clientes; respaldo/restauración | entries + rows + `/api/panel/backup` | todos | lib sync, e2e mobile (parcial) | **Fuerte** |
| `ventas` | CRUD de ventas, corte de caja, reloj checador, antifraude, gift cards, comisiones, reporte gerencial | rows + entries | dueño, gerente, mesero | e2e mobile (parcial) | **Fuerte** |
| `costeo` | Platillos, recetas, combos, food cost objetivo, menú digital | `/api/panel/dishes` + entries | dueño, gerente | `example-data.test.ts` | **Fuerte** |
| `inventario` | Ítems, proveedores, movimientos, órdenes de compra, proyección de stock | entries + rows | dueño, gerente, cocina | — | **Fuerte** |
| `rentabilidad` | Margen por platillo cruzando ventas, mermas y precios | rows + entries | dueño, gerente | — | **Fuerte** |
| `personal` | Invitar, cambiar rol, revocar (consume `TOOL_ACCESS`) | `/api/panel/members` (API directa) | dueño | `members/route.test.ts` | **Fuerte** |
| `unirse` | Aceptar invitación por token; invalida la caché de rol | `/api/panel/members/accept` | sin gate | `accept/route.test.ts` | **Fuerte** |
| `comanda` | KDS de cocina con estados, filtros por canal, insights de producción | entries + rows | dueño, gerente, cocina, mesero | e2e mobile (parcial) | **Sólido** |
| `mermas` | Registro de mermas, tendencias, causas top, metas mensuales | rows + entries | dueño, gerente, cocina | — | **Sólido** |
| `planificador` | Coberturas, listas de compra, transferencias de temporada | entries + rows | dueño, gerente | `shopping-lists.test.ts` (lógica) | **Sólido** |
| `temporada` | Calendario de temporada, lista de compra estacional | entries | dueño, gerente | — | **Sólido** |
| `apertura` | Checklist de apertura, calculadora de inversión, ítems propios | entries | dueño, gerente | — | **Sólido** |
| `analitica` | Rangos 7d/30d/mes sobre datos reales, historial de alertas | entries + rows (lectura) | dueño, gerente | — | **Sólido** |

**Resultado: 7 fuertes, 6 sólidas, 0 débiles.**

El rol se aplica en dos capas: `TOOL_ACCESS` por herramienta y `ROWS_WRITE_ACCESS`
por almacenamiento (`src/lib/panel-roles.ts`), con `canAccessPanelHref` como único
predicado de navegación. `personal` es la única exclusiva del dueño. El nivel de
compra **no oculta campos, solo bloquea escritura** (`useTierGuard`,
`canUseFeature`, `requireFoodosFeature`), y el admin está exento en dos capas.

### Debilidad estructural del panel

Es la superficie donde el restaurantero pasa su día y es la que **menos tests
tiene**: cero archivos bajo `src/components/panel/**` (excluyendo foodos), cero
para `use-synced-*` / `use-panel-role`, y el e2e solo navega superficialmente
(3 rutas en `e2e/mobile.spec.ts`: ventas L1867, comanda L1990, rentabilidad L2039).
La lógica de negocio está testeada; la superficie no.

### Deuda declarada del panel

- **i18n incompleto:** `panel/page.tsx`, `mermas`, `costeo` e `inventario` no
  importan `@/lib/i18n` en absoluto; `ventas` hace **una sola** llamada a `t()`.
  En `en` se ven en español.
- **Datos de ejemplo embebidos:** `costeo` (`MOCK_INGREDIENTS`) y `rentabilidad`
  (`DISH_DATA`) mezclan base de ejemplo con catálogo real. Están diferenciados
  con `ExampleDataBanner`, así que el usuario no se confunde, pero la base vive
  en código en vez de estar catalogada.
- `temporada` y `apertura` usan catálogos hardcodeados como *defaults*
  personalizables y sincronizados: es intencional, no un defecto.

---

## 3. FoodOS — `/panel/foodos` + `/r/[slug]` (21 superficies)

El panel vive en `src/app/panel/foodos/**`, casi todo `"use client"`, consumiendo
las server actions de `src/app/panel/foodos/actions.ts` (3,859 líneas). Hay
**~60 archivos de test específicos de FoodOS**, incluidos **11 `*-gates.test.ts`**
que vigilan el gating por nivel y por rol, y dos specs e2e (`foodos.spec.ts`,
`foodos-pos.spec.ts`).

| Superficie | Qué hace | Nivel | Tests | Estado |
|---|---|---|---|---|
| `tablero` | Reportes con ventana de fechas, filtro por sucursal, tope 5,000 filas con bandera `truncated` | Gratis | e2e | **Fuerte** |
| `menu` | Categorías, ítems, opciones, overrides por sucursal | Gratis | `foodos.test.ts` | **Fuerte** |
| `mostrador` | POS de mostrador: ventas, folios, pagos, cierre | Diamante | `mostrador-gates.test.ts` | **Fuerte** |
| `caja` | Corte de caja y arqueo por turno | Diamante | `caja-gates.test.ts` | **Fuerte** |
| `mesas` | Comandero de salón: zonas, mesas, cuentas, comandas | Diamante | `mesas-gates.test.ts` | **Fuerte** |
| `clientes` | CRM del restaurante: RFM, campañas, automatizaciones | Plata | `foodos-rfm.test.ts` | **Fuerte** |
| `flotilla` | Delivery propio: repartidores, entregas, zonas, eventos | Oro | `flotilla/*` | **Fuerte** |
| `mesero-ia` | Agente IA de WhatsApp con máquina de estados | Diamante | `foodos-ai-wa/state-machine` | **Fuerte** |
| `/r/[slug]` | Micrositio público: menú, combos, cupones, reseñas, pedido | Gratis | `e2e/foodos.spec.ts` | **Fuerte** |
| `restaurante` | Configuración: sucursales, horarios, webhooks | Gratis | `connect-actions.test.ts` | **Sólido** |
| `combos` | Combos y reglas de upsell | Gratis | — | **Sólido** |
| `pedidos` | Lista de pedidos, detalle, impresión, cancelación | Gratis | e2e | **Sólido** |
| `cocina` | KDS ligero de FoodOS | Gratis | — | **Sólido** |
| `cupones` | Cupones y uso | Gratis | — | **Sólido** |
| `inbox` | Bandeja WhatsApp + sesiones de IA | Diamante | `actions.notifications.test.ts` | **Sólido** |
| `catering` | Paquetes y solicitudes de catering | Diamante | `foodos-catering*` | **Sólido** |
| `wallet` | Pases Apple/Google Wallet + lealtad | Diamante | `foodos-wallet/*` | **Sólido** |
| `app-marca` | App de marca (PWA) del restaurante | Diamante | `foodos-app-brand.test.ts` | **Sólido** |
| `sitio-ia` | Páginas SEO generadas por IA | Diamante | `foodos-ai/seo` | **Sólido** |
| `whatsapp` | Conexión WhatsApp Business y catálogo | Gratis (sin gate) | `foodos-whatsapp.test.ts` | **Sólido** |
| `pos` | Integraciones con POS externos | Diamante | `pos-gates.test.ts` | **Stub** |

**Resultado: 9 fuertes, 11 sólidas, 1 stub.**

La ejecución operativa (mostrador → mesas → cocina → caja → tablero) es lo más
maduro de todo el sitio, y lo es porque tiene **reglas explícitas defendidas por
test**:

- **El folio nunca se reutiliza.** Se reserva con `foodos_next_folio` después de
  validar todo, pero si `createFoodosOrder` falla el número ya quedó reservado.
  Es deliberado: un hueco en el consecutivo es el precio correcto de no reimprimir
  nunca un folio visto. No agregar una ruta de "liberar folio".
- **Una sola regla de ingreso:** `payment_status === "paid"`. Cualquier reporte
  nuevo que cuente filas en vez de pagos repite el bug de la Fase 6 (el tablero
  contaba `pending`/`processing` como ingreso y promediaba sobre todas las filas).
- **El día local tiene una sola autoridad** (`src/lib/local-date.ts`): el reporte
  agrupa por `dayKeyOf`, no por `toISOString()`.
- **Fail-closed en roles:** una superficie que no está en `FOODOS_SURFACE_ACCESS`
  no se abre, y un rol desconocido se resuelve a `mesero`, no a `gerente`.

### Debilidades de FoodOS

1. **`pos` es un stub deliberado.** Los 6 proveedores están declarados con
   `implemented:false` (`src/lib/pos/registry.ts`) y el webhook entrante responde
   **503**. No es un fallo silencioso —está documentado— pero la superficie
   aparece en el panel con nivel Diamante y no hace nada. El camino real hoy es
   la importación CSV.
2. **No hay ESC/POS.** La impresión es HTML imprimible + `window.print()`
   (`src/lib/foodos-printing/types.ts:9-13`). Sin impresora térmica real, un POS de
   mostrador no sobrevive en un restaurante de verdad.
3. **El dinero del restaurante no llega al restaurante.** El cobro con tarjeta
   entra a la cuenta de la plataforma (`create-intent?type=foodos`). El enrutado
   vía **Stripe Connect existe en código pero está apagado en producción**
   (`STRIPE_CONNECT_ENABLED` ausente; lo afirman `src/lib/foodos-payouts.ts:9`,
   `src/lib/foodos/actions/payouts-admin.ts:6`,
   `src/app/api/admin/foodos/payouts/route.ts:14`). Hoy la dispersión es **manual**
   desde `/admin/foodos/dispersiones`. Lo que sí funciona completo es el
   comprobante de pago manual.
4. **La escalera de niveles concentra el valor en la cima.** De 10 capacidades
   premium, **8 exigen Diamante** (`src/lib/foodos-entitlements.ts`): POS,
   comandero, wallet, app de marca, sitio IA, catering, mesero IA e integraciones
   POS. Solo `marketing_ia` abre en Plata y `flotilla` en Oro.
5. **Wallet sin certificados reales:** Apple Wallet responde 501 sin certificados;
   Google Wallet redirige. La superficie es sólida, el último tramo no.
6. **Deudas declaradas y acotadas:** `FULFILLMENT_LABELS` y
   `PAYMENT_METHOD_LABELS` de `foodos-reportes.ts` están en español fijo (en `en`
   se ven en español; `CHANNEL_LABELS` sí es compartida), y `METHOD_LABEL` de
   `pedidos/page.tsx` no es el conjunto canónico de métodos — la clave `efectivo`
   no corresponde a ningún slug real.

**Lo que sí está bien y conviene no romper:** multi-sucursal real
(`foodos_branches`, overrides y horarios por sucursal, filtros `branch_id` en el
tablero) y **Realtime** con `postgres_changes` en cocina, pedidos, mesas e inbox.
No hay mocks ni datos de demo en las páginas de panel de FoodOS.

---

## 4. Panel admin — `/admin` (20 secciones)

**17,460 líneas** en los `page.tsx` de las secciones y **58 `route.ts`** bajo
`src/app/api/admin/**`. El módulo real de auditoría es `src/lib/audit-log.ts`
(catálogo de **78 acciones**, inserta en `admin_audit_log` con service_role,
**44 archivos lo importan**).

| Sección | Qué hace | Líneas | Tests | Estado |
|---|---|---|---|---|
| `productos` | Catálogo: tabla server-side, bulk con deshacer, papelera 30d, IA SEO, galería, reporte de ventas | **6,595** | ~19 route + ~12 unit + 2 e2e | **Fuerte** |
| `leads` (CRM) | Tablero, bandeja, secuencias, respuestas rápidas, SLA, import CSV | **1,840** | ~15 lib + 3 página + 2 e2e | **Fuerte** |
| `whatsapp` | Catálogo, plantillas, sync | **1,964** | `comercializacion/whatsapp.test.ts` | **Fuerte** |
| `pedidos` | Tabla server-side, acciones masivas, repartidor, comprobantes | 1,208 | 3 route + 2 e2e | **Fuerte** |
| `whatsapp/automations` | Motor de automatizaciones + cron diario + dedupe | 434 | `whatsapp-automations-engine` | **Fuerte** |
| `recompensas` | Servicios canjeables, cola de canjes, revisión de facturas | 17 + 1,240 | 3 route + lib | **Fuerte** |
| `admin` (dashboard) | KPIs vs ayer, auto-refresh, alertas, widget CRM | 540 | 4 lib + 2 e2e | **Fuerte** |
| `conversion` | Embudo con deltas, cohortes, breakdowns UTM, export CSV | 860 | 5 lib + 2 route | **Sólido** |
| `bitacoras` | Auditoría, errores, emails (3 tabs) | 651 | contract + e2e guards | **Sólido** |
| `comisiones` | Devengo calculado por la base (RPC), pagar/cancelar/ajustar con auditoría | 531 | 4 route + 2 lib | **Sólido** |
| `restaurantes` | Nivel en vivo, override manual, KPIs de adopción | 479 | `restaurantes.test.ts` (23) | **Sólido** |
| `foodos/dispersiones` | Única definición del saldo; registra dispersión vía RPC | 412 | `foodos-payouts` + route | **Sólido (manual)** |
| `foodos/restaurantes` | Cola de revisión: único camino a `status='active'` | 207 | `foodos-moderation` + e2e | **Sólido** |
| `operar` | Impersonar un restaurante (la cookie no es credencial) | 66 | `operating-picker.contract` | **Sólido** |
| `marketing` | Order-bumps, cupones, afinidades | 608 | 3 route + 1 unit + e2e | **Sólido** |
| `proveedores` | CRUD + vínculo de productos con costo/SKU | 611 | 4 route + 1 lib | **Sólido** |
| `seo-ia` | Panel GEO de 80 celdas + inventario de activos citables | 199 + 760 | 3 unit | **Sólido** |
| `sistema` | Estado de integraciones + reporte de acceso admin | 279 | `admin-auth.test.ts` | **Sólido** |
| `usuarios` | Listar/buscar usuarios, cambiar rol con reglas | 253 | `admin-roles.test.ts` + e2e | **Sólido** |
| `repartidores` | Alta y activar/desactivar. **Sin tracking, rutas, zonas ni capacidad** | 180 | 1 route + 1 lib | **Parcial** |
| **Facturación CFDI** | — | — | — | **No existe** |

**Resultado: 7 fuertes, 12 sólidos, 1 parcial, 1 inexistente.**

El admin es la superficie **mejor cubierta por tests** y la única con e2e sobre
flujos de escritura reales (`admin-productos.spec.ts`,
`admin-productos-modal.spec.ts`, `admin-deep-links.spec.ts`, `compartir.spec.ts`).

### Debilidades del admin

1. **El acceso admin es todo-o-nada.** `MANAGED_ROLES = ["admin","vendedor","cliente"]`
   (`src/lib/admin-roles.ts:6`) y el `CHECK` de la base solo admite esos tres
   (`00067_master_admin_roles.sql:17`, reconfirmado en `00071:90`). **No existen
   roles granulares** de ops/marketing/finanzas: cualquier admin puede tocar
   productos, dinero, usuarios y CRM. Lo más cercano es el rol `vendedor`, que
   solo alcanza `/comercializacion`.
2. **Facturación CFDI no existe.** Grep de `cfdi/timbrado/facturapi/sat/rfc` en
   `src/` sin resultados. Lo que el panel llama "facturas" son **tickets subidos
   por usuarios para ganar créditos** (`invoice_submissions`): aprobarlos acredita
   monedero vía `approve_invoice_submission` (00144), no timbra nada. Es manual y
   sin valor fiscal. Depende de contratar un PAC.
3. **Huecos de auditoría.** El repo ya tiene un contrato que vigila esto
   (`src/lib/admin-audit.contract.test.ts`: toda ruta mutante debe llamar a
   `logAdminAction` o estar exenta **con motivo escrito**). Las 10 exenciones
   estaban justificadas salvo `bump-affinity`: su motivo solo cubría el campo
   `weight` ("solo desempata entre sugerencias; no cambia precio"), pero POST y
   DELETE **crean y borran el par**, que sí es merchandising atribuible a una
   persona. Era el único caso donde la excepción era más estrecha que la ruta.
   ✅ **Resuelto (Ronda 20).** La **duplicidad de bitácoras** también quedó
   cerrada: `/api/admin/audit-log` leía `notifications` a través del `audit.ts`
   legado (4 acciones, un único consumidor) mientras `/admin/bitacoras` leía
   `admin_audit_log`; ahora ambos leen el mismo libro y el módulo legado se
   retiró.
4. **Dos endpoints admin no usaban `requireAdmin()`.** ✅ **Resuelto (Ronda 20):**
   `seed-products` y `update-images` se protegían con token de entorno
   (`SEED_API_TOKEN` / `ADMIN_API_SECRET`, fail-closed) y llevaban datos
   hardcodeados de un solo uso. Violaban el invariante #1 de
   `docs/agents/admin.md:11-12`. Eran scripts, no features: se retiraron.
5. **Cobertura e2e desigual.** Sin e2e para ~10 secciones (bitácoras-UI,
   comisiones, conversion, proveedores, recompensas, seo-ia, sistema, whatsapp,
   dispersiones, repartidores). Y el e2e **no autentica** —el repo no tiene seed
   ni credenciales—, así que verifica guards y render, no flujos.
6. **El CRM tiene el ciclo de retroalimentación roto** (filas `CRM1`–`CRM6` de la
   Ronda 18): `orders.seller_id` sin escritor, atribución por grep,
   `estimated_value` es foto y no histórico, motivo de pérdida no retroactivo,
   límite de 50 pedidos y `crm_tasks` con **0 políticas RLS**.
7. **Retención limitada en bitácoras:** 100 filas (auditoría) y 200 (errores),
   sin export.

---

## 5. Dónde el sitio es fuerte

1. **El ciclo operativo del restaurante está completo y con reglas defendidas por
   test.** Mostrador → mesas → cocina → caja → tablero comparte una sola autoridad
   de día local y una sola regla de ingreso. Los bugs clásicos del dominio
   (promediar sobre filas en vez de sobre pagos, agrupar por UTC, reutilizar
   folios, leer las últimas 200 filas y llamarlo reporte de 90 días) están
   **explícitamente cerrados** y anotados como decisiones.
2. **Los tres pilares del negocio interno están maduros:** `productos` (6,595
   líneas, 19 rutas de API, 30+ módulos de test), `leads`/CRM (1,840 líneas + 15
   módulos) y `whatsapp` + automations. Es donde el equipo invierte y se nota.
3. **Disciplina de ingeniería poco común:** 6,080 tests, `verify` verde, `knip`
   limpio, 177 migraciones en sincronía verificada con `supabase migration list`, y
   **contratos de test que vigilan la propia documentación**
   (`docs-pointers.contract`, `e2e-specs.contract`, `knip-config.contract`,
   `local-date.contract`, `floats.contract`, `a11y-static.contract`,
   `migration-docs.contract`).
4. **Los invariantes están escritos y tienen contraejemplos vivos.** `docs/agents/*.md`
   declara invariantes por superficie, y esta auditoría pudo **encontrar las
   violaciones** precisamente porque estaban escritas. Eso es documentación que
   sirve.
5. **Degradación honesta por defecto:** `isSupabaseConfigured()` en render, banderas
   `degraded` y `truncated`, `ExampleDataBanner` sobre datos de ejemplo, 409 con el
   valor vigente para merge. El sitio prefiere decir "no tengo esto" antes que
   mentir con formato de tabla.
6. **Cobertura competitiva medida contra tres competidores** (FluxSales,
   Maspedidos, take.app) con las brechas conscientes declaradas por escrito, no
   descubiertas por accidente.

## 6. Dónde flaquea (priorizado)

| # | Debilidad | Impacto | Evidencia |
|---|---|---|---|
| 1 | **El dinero del restaurante no llega al restaurante** (Stripe Connect apagado; dispersión manual) | Riesgo fiscal y de confianza; bloquea escalar FoodOS | `foodos-payouts.ts:9`, `payouts-admin.ts:6`, `payouts/route.ts:14` |
| 2 | **POS sin implementar y sin impresión térmica** | El POS no es usable en un restaurante real | 6 proveedores `implemented:false`, webhook 503, solo `window.print()` |
| 3 | **8 de 10 capacidades premium en Diamante** | El valor no se puede probar; el upgrade depende de una recompra previa | `src/lib/foodos-entitlements.ts` |
| 4 | **Admin todo-o-nada (sin roles granulares)** | Riesgo operativo: cualquiera puede tocar todo | `admin-roles.ts:6`, `00067:17` |
| 5 | **El panel del restaurante no tiene tests de superficie** | La pantalla de uso diario es la menos vigilada | 0 tests en `src/components/panel/**` y hooks |
| 6 | **Facturación CFDI no existe** | Bloquea al restaurantero que necesita factura | grep sin resultados; `invoice_submissions` son créditos |
| 7 | **CRM con ciclo de retroalimentación roto** | El CRM no puede atribuir ni aprender | `CRM1`–`CRM6` de la Ronda 18 |
| 8 | **Huecos de auditoría admin** | ✅ **Resuelto (Ronda 20)**: un solo libro, `admin_audit_log` | excepción de `bump-affinity` más estrecha que la ruta; dos feeds paralelos |
| 9 | **Accesibilidad incompleta fuera de rutas públicas** | Riesgo legal y de uso en el móvil | `CX1`–`CX9`, `A14`–`A17` de la Ronda 13 |
| 10 | **Repartidores parcial + Wallet sin certificados** | Dos superficies que prometen más de lo que entregan | `repartidores/page.tsx` (180), Apple 501 |

### Lectura estratégica

El sitio es fuerte donde el restaurante **opera** y donde Resurte.me **vende**;
flaquea exactamente donde el restaurante **cobra y cobra de vuelta** —pago, POS,
impresión, factura— y donde el equipo interno necesita **separar permisos**.

---

## 7. Backlog de remediación

Las diez debilidades están declaradas como filas `AU1`–`AU10` en la Ronda 19 de
`docs/PLAN-MEJORAS.md`, con su orden de ataque. Resumen:

| Prioridad | Acción | Esfuerzo |
|---|---|---|
| **P0** | Unificar la bitácora admin en `admin_audit_log` ✅ hecho (Ronda 20): `bump-affinity` audita y `audit.ts` legado retirado | Bajo |
| **P0** | Borrar `seed-products` y `update-images` ✅ hechos (Ronda 20) | Bajo |
| **P1** | Encender Stripe Connect, o quitar el cobro a la plataforma y dejar solo comprobante manual | Medio |
| **P1** | Abrir la escalera de niveles (`pos_mostrador` y `comandero` a Oro) + modo prueba | Bajo |
| **P1** | Tests de superficie del panel (`ventas`, `comanda`, `inventario`) | Medio |
| **P2** | Cerrar `CRM1`–`CRM6` | Medio |
| **P2** | Impresión ESC/POS | Alto |
| **P2** | Roles granulares admin (ops/marketing/finanzas) | Medio |
| **P3** | CFDI (depende de PAC) y certificados de Wallet | Alto |

Cada cambio debe pasar `npm run verify` y el comando declarado en el playbook de
su superficie (`docs/agents/panel.md`, `docs/agents/admin.md`,
`docs/agents/pos-mesas.md`). Ningún arreglo se considera terminado sin el comando
que lo vigila.

### Pendientes que dependen de credenciales externas

- **C1 — PAC para timbrado CFDI.**
- **A1 completo — OXXO/SPEI habilitados en la cuenta de Stripe.**
- **Stripe Connect** (`STRIPE_CONNECT_ENABLED`) para la dispersión automática.
- **Certificados de Apple Wallet** (hoy 501) y credenciales de Google Wallet.
