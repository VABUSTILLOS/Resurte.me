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
> **Actualización (Ronda 23).** La medición de arriba es la del día de la
> auditoría y se conserva como línea base. Al cerrar las oleadas A, C y D el
> árbol mide **370 archivos / 6,445 tests**, `knip` exit 0. Lo que cambió no fue
> el diagnóstico —**sigue sin haber humo**: ninguna de las 54 superficies está
> rota— sino la **fiabilidad de la medición**: la ronda encontró y corrigió
> cinco instrumentos que decían estar midiendo y no medían (ver §8), cerró
> `c1`/`c2`/`c3` de la Oleada C, que eran tres silencios del esquema (ver §9), y
> sacó la única capacidad que se anunciaba como beneficio de un nivel donde no
> existía (§10).
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
   Ronda 18): `orders.seller_id` sin escritor (**eliminada en `00189`**, ver §9),
   atribución por grep, `estimated_value` es foto y no histórico, motivo de
   pérdida no retroactivo, límite de 50 pedidos y `crm_tasks` con **0 políticas
   RLS** (**declarada en la Oleada C**, ver §9).
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

---

## 8. Estado tras la Ronda 23 — los cinco instrumentos que mentían

La auditoría de §1–§7 sigue siendo válida en su diagnóstico: **ninguna de las 54
superficies está rota ni es humo**, y las debilidades estructurales que declaró
(el cobro a la plataforma, la escalera de niveles, la ausencia de tests de
superficie en el panel, `CRM1`–`CRM6`, ESC/POS, roles granulares) siguen ahí. La
Ronda 23 atacó el **tercer** eje, el que la auditoría no podía ver porque era
ella misma parte interesada: **la fiabilidad de los instrumentos con los que se
mide el sitio**.

Encontró cinco que afirmaban medir y no medían. Los cinco tienen la misma forma:
**descartaban en silencio lo que no entendían**, y por eso producían ceros que
parecían buenas noticias.

| # | Instrumento | Lo que decía | Lo que pasaba de verdad |
|---|---|---|---|
| 1 | El arnés de e2e sobre `next dev` | «10 rojos porque el servidor de producción no arranca» | El servidor arrancaba bien: había **168 perfiles de Chromium zombis** en el `$TMPDIR` del sistema y Chromium se colgaba con **CPU al 0 %** y sin error. `next dev`, además, crecía **~7 MB/s hasta 6.6 GB**; `next build` pide **216 MB** |
| 2 | El calentamiento de `global-setup.ts` | «El `prerender-manifest.json` se corrompe solo» | Lo corrompía el propio calentamiento con `CONCURRENCY = 4` (fallaba en la ruta **8 de 64**). Con 1 no falla nunca. Next escribe el manifest **sin truncar**, así que la avería se autoalimenta y es permanente en `dev` |
| 3 | `RE_VARIANTE` (`src/lib/contrast.ts`) | «Cero `placeholder:` en fallo» | No incluía `placeholder:`, así que **todo `placeholder:text-*` era invisible**: **15 pares, 10 en fallo**, cuatro de ellos reales en `CheckoutFlowScreen.tsx` |
| 4 | `PALETA` (`src/lib/contrast.ts`) | «La familia `neutral` no existe en el tema» | Tailwind v4 escribe los acromáticos como `oklch(70.8% 0 none)` —hue literal `none`— y el patrón exigía `[\d.]+`: **13 pares descartados en silencio**, uno **vivo** (`wallet-card-view.tsx:209`, 4,35 → 6,16) |
| 5 | Las filas `A14`, `A15`, `A17`, `CX1`, `CX8`, `CX9` | Tasas de falsos positivos, conteos de import y de tokens | `A14` describía como hallazgo la **ceguera** del contrato a `recompensas` (y `AJENOS` lo hacía ciego de verdad); `A17` declaraba **113** botones sin nombre cuando eran **25**, y los 25 eran verdaderos; `CX8`/`CX9` contaban 654 y 775 tokens sin medir el par, y medido **no queda ninguno vivo** |

**Lo que se cerró con medición.** `CX1` (`/panel` sin contrato de contraste):
475 pares, 60 fallos AA, 51 arreglos, contrato propio con perímetro y trinquete.
`CX5` (hueco de `ring-0`): detector reescrito. `CX6` (`warm-400` a 3,08): era un
**fallo vivo** con 4 usos, corregido. `CX7`: ya resuelto. `CX8`/`CX9`: 191 fallos
crudos → 162 falsos → 29 exentos → **0 vivos**, con 121 ediciones y 4 reglas de
exención que particionan los 29 sin solape. `A14`: 20 archivos, 19 con import
real, todos bajo el `MotionConfig` del padre. `A15`: `InvoiceScannerScreen.tsx`
de **2,19:1** a **5,2:1**. `A17`: los 25 botones arreglados y la regla `R7` los
congela en cero; los **193** campos quedan **medidos y sin contrato**, con la
razón escrita.

**Lo que sigue abierto y por qué.** Las oleadas A–D están cerradas. `AU10` sigue
**a medias y bloqueado**: el e2e autenticado existe en código (`signInAsAdmin()`)
y no tiene con qué entrar, porque este entorno no tiene semilla ni usuario de
prueba — y eso es un bloqueo de **credenciales**, no de implementación, igual que
los pendientes de §7. La Oleada E queda en espera por el mismo motivo.

**Lo que esta ronda deja como método.** La lección no es «medir más», es
**hacer que el instrumento diga lo que no puede ver**. Los cinco fallos de la
tabla son cinco casos del mismo error: un medidor que se salta sin avisar lo que
no entiende no es un medidor, es una opinión con salida numérica. Por eso el
cierre no fue ajustar los números del backlog, sino escribir contratos con
**fuente de verdad legible** —`ADMIN_SECTIONS` para el calentamiento,
`medirPlaceholders()` para los placeholders, `numeroOklch()` para los
acromáticos— y dejar **escrito lo que no se congela**: los 193 campos de `a7` y
las cuatro reglas de exención de `a4` son estados declarados, no deudas
olvidadas.

---

## 9. Estado tras la Oleada C — los tres silencios del esquema

La Ronda 23 midió cinco instrumentos que **mentían**. La Oleada C encontró tres
superficies del esquema que no mentían: **callaban**. Y desde fuera, un silencio
se lee igual que un acierto.

| # | Silencio | Lo que se veía desde el código | Lo que había de verdad |
|---|---|---|---|
| 1 | `orders.seller_id` | Una columna de atribución con FK a `profiles` y su índice: se lee como una capacidad disponible | **Nadie la escribió nunca y nadie la leyó.** Ninguna vista, RPC ni política la usa; ningún archivo de `src/` o `e2e/` la nombra. Habría devuelto `NULL` para siempre. Su único efecto medible era la **segunda FK `orders → profiles`**, la causa exacta del `PGRST201` que `src/lib/admin/order-selects.ts` documenta |
| 2 | 24 tablas con RLS encendida y **cero políticas** | Deny-by-default, que es lo correcto: el contrato de cobertura las aprueba con nota | Deny-by-default **sin una línea que dijera quién las lee**. Nueve no tenían ni un `COMMENT ON TABLE`; catorce tenían un comentario que describía la tabla pero no el acceso. Sólo `crm_tasks` lo declaraba (`00185`). La superficie se leía idéntica con el permiso bien puesto que con el permiso mal puesto |
| 3 | `crm_prospects.estimated_value` | Un valor previsto por trato con índice parcial, `CHECK` y comentario: se lee como un dato con seguimiento | Es **una foto sin serie detrás**. No existe tabla, columna ni trigger que conserve cómo cambió. El CRM puede responder «cuánto vale el pipeline hoy» y **no** «cuánto valía el mes pasado», y la segunda pregunta no se deriva de la primera |

**`c1` — `orders.seller_id`.** Decisión: **eliminarla**, no documentarla. Una
columna de atribución que devuelve cero en silencio es peor que su ausencia: la
ausencia se nota al consultarla, el cero se construye encima. Migración
`00189_drop_orders_seller_id.sql` (única destructiva de la ronda; `DROP COLUMN`
no reescribe la tabla y se lleva FK e índice). Tres comentarios históricos
corregidos (`00052`, `00071`, `00155`) y reescrito el bloque de
`src/lib/admin/order-selects.ts`, que ahora dice **por qué el hint de FK se
conserva** aunque hoy `PGRST201` ya no pueda ocurrir: la decisión debe quedar
escrita, no depender de que el esquema deje de ser ambiguo por casualidad.
`src/lib/orders-seller-id.contract.test.ts` (9) congela la eliminación — el modo
de fallo real no es que alguien la lea, es que alguien la **vuelva a añadir**— y
falla si una migración nueva la reintroduce.

**`c2` — RLS sin políticas.** Decisión: **no añadir políticas** (el acceso es de
servicio; inventar políticas de cliente sería crear una superficie que nadie
pidió) y **declarar el modelo de acceso**. Las 24 se acceden con
`createServiceClient()` desde un archivo identificable; `rate_limits` lo hace por
la RPC `consume_rate_limit`, cuyo `EXECUTE` quedó restringido a `service_role` en
`00165`. La declaración vive en `src/lib/rls-declared.contract.test.ts` (11) como
un registro con el archivo que prueba cada acceso, **no** como 24 `COMMENT ON
TABLE` nuevos, por una razón concreta: un comentario en la base de datos no se
puede verificar y este contrato sí. Añadir una tabla con RLS y sin políticas
rompe el test hasta que alguien escriba, en una línea, quién la lee.

**`c3` — `estimated_value` es una foto.** Decisión: **declarar la limitación, no
construir la serie.** Las dos mitades del CRM ya estaban bien y no se tocaron: la
etiqueta visible dice **«Previsto»** (nunca «valor del trato») y `crm-money.ts`
documenta desde antes que un `null` no es `$0` y que la diferencia solo se
calcula cuando existen los dos lados. Lo que faltaba era admitir que el previsto
**no tiene memoria**. La tentación era crear la tabla de snapshots; no se hizo
porque una tabla de histórico sin lector es exactamente la superficie muerta que
`00189` acababa de eliminar, y añadirla habría sido una feature nueva, no un
arreglo. En su lugar la limitación se escribe en el docstring de
`src/lib/crm-money.ts` **y se hace falsable**: `crm-forecast.contract.test.ts`
(15) falla si aparece una tabla de serie del previsto, si `estimated_value` se
duplica en otra tabla, si el módulo del dinero deja de ser puro —no puede
consultar `orders`; el real le llega ya calculado— o si alguien vuelve a citar
`orders.seller_id` como si existiera, que es la regresión de `c1` vista desde el
CRM.

Vale la pena anotar cómo se encontró el último hueco de este contrato: el
detector de `CREATE TABLE` exigía un salto de línea antes del paréntesis de
cierre, así que **una tabla declarada en una sola línea se le escapaba**. Lo
delató el propio ejercicio de probar la guarda plantando un probe: el probe
—escrito en una línea— no hizo fallar el test que debía. Es el error de §8 otra
vez, esta vez dentro del contrato que lo denuncia, y por eso los fixtures del
detector incluyen ahora la forma de una línea y un `CHECK` con paréntesis de
precisión antes del cierre.

**Lo que la Oleada C deja como método, otra vez.** Los tres casos son el mismo
error que los cinco de §8, visto desde el otro lado: **una ausencia de
información se renderiza igual que una buena noticia**. La reparación no fue
cambiar el comportamiento —ninguna de las 54 superficies cambió de forma
visible— sino **escribir la decisión donde se pueda verificar**: un contrato que
falla si la columna vuelve, un registro que falla si una tabla nueva no se
declara, y una declaración que falla si alguien construye la serie que hoy no
existe.

---

## 10. Estado tras la Oleada D — la promesa sin entrega

La Oleada B encontró instrumentos de **prueba** que mentían (§8) y la Oleada C
encontró superficies de **esquema** que callaban (§9). La Oleada D encontró una
tercera cosa, y es la más simple de las tres: **una capacidad que se vendía y no
se entregaba**.

| Lo que decía el sitio | Lo que había de verdad |
|---|---|
| `pos_integraciones` —«Conectar tu punto de venta»— era una función del nivel **Diamante**, el más caro: aparecía en la escalera pública como beneficio de subir, en la tabla de restaurantes del admin como capacidad del nivel, y en el panel del dueño como candado | Los **seis** adaptadores comerciales están declarados `implemented: false` (`src/lib/pos/registry.ts`) y el webhook responde **503**. No había nada que operar, así que tampoco había nada que cobrar: el candado pedía el nivel más caro a cambio de una hoja de ruta |

**La decisión.** **Conservar la superficie y sacarla del candado.** Conservar,
porque la pantalla es honesta y útil: el restaurantero ve que su proveedor está
contemplado, qué le falta a cada uno, y el camino que sí funciona —la importación
del menú por CSV— está justo al lado. Sacarla del candado, porque el candado de
nivel existe para **cobrar lo que cuesta operar** y aquí no había costo que
cobrar. La capacidad queda en **Verde**: se ve, se usa, y no se cobra.

**Por qué no bastó cambiar el nivel.** `FEATURE_MIN_TIER` es un mapa de nivel
mínimo y bajarlo parecía una línea. No lo era, porque el mismo `featuresForTier`
que responde «¿qué puede usar este restaurante?» es el que arma
`PUBLIC_TIER_LADDER`, la escalera de marketing — y en esa escalera «Verde» **no
significa gratis**: significa «el beneficio que te da subir a Verde», que se
anuncia con una palomita en los cuatro niveles. El mismo valor tenía tres
lecturas y ninguna estaba escrita:

| Pregunta | Predicado | Superficies |
|---|---|---|
| ¿Qué me da **subir** a este nivel? | `perksForTier` — excluye la línea base | Escalera pública de `/restaurantes`, badge por función |
| ¿Qué **puede usar** este restaurante? | `featuresForTier` | Tabla de restaurantes del admin, KPIs de adopción, resumen del panel |
| ¿Qué nivel **exige la escritura**? | `hasFeature` / `canUseFeature` | Los seis `requireFoodosFeature("pos_integraciones")` del panel |

La reparación fue **nombrar cada lectura**: `perksForTier` para la escalera,
`featuresForTier` para la capacidad real, `hasFeature` intacto como único
predicado de escritura. `ToolGrid` no necesitó cambios —su candado aparece solo
si `canUse` es falso— y `ToolPreviewNotice` deja de mostrar el aviso de nivel en
la pantalla de POS, porque ya no hay nivel que mostrar.

**Y la condición de subida queda congelada.** El test exige que la única
capacidad en Verde sea una **sin un solo adaptador implementado**: el día que
alguien implemente el primero, el test falla y obliga a subir el nivel — que es
la conversación correcta, en el momento en que aparece el costo, y no después.
También se corrigió el calificador de leads, que ante el dolor «la operación se
me desordena» recomendaba `pos_integraciones`: mandaba al prospecto a una puerta
que no abre. Ahora recomienda el **POS de mostrador**, que existe, y la
recomendación sube de Diamante a Oro —el nivel que de verdad hace falta—.

**Lo que la Oleada D deja como método.** Las tres oleadas son la misma lección
vista desde tres lados: un instrumento de prueba que no dice lo que no ve, un
esquema que calla, y un **nombre que hace dos trabajos**. En los tres casos la
reparación fue la misma y ninguna cambió el comportamiento visible de las 54
superficies: **escribir la decisión donde se pueda verificar**.
