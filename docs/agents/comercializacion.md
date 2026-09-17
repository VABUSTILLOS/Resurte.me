# Agente: Comercialización (CRM del vendedor)

## Posee
- `src/app/comercializacion/**` (dashboard, prospectos, ficha, pedidos, agente)
- `src/lib/comercializacion/**`
- `src/components/comercializacion/**`

## No posee, pero depende de ello
La Ronda 10 (**Fusión Comercialización × Leads**) hizo que esta superficie y
`/admin/leads` compartan un **núcleo único**. Estos archivos viven fuera de la
carpeta del vendedor y los consume también el admin, así que **no se cambian
desde aquí sin revisar `docs/agents/admin.md`**:

| Compartido | Qué es |
|---|---|
| `src/lib/crm-core.ts` | tipos, vocabulario de estados, mapeo, escalera de columnas y **alcance** |
| `src/lib/crm-prospects.ts` | el **único** lector de listas de `crm_prospects` |
| `src/lib/crm-conversation.ts` | el **único** lector de conversación de un prospecto |
| `src/components/crm/ProspectDetailDrawer.tsx` | la ficha unificada |
| `src/components/crm/ConversationPanel.tsx` | el panel de conversación compartido |
| `src/lib/crm-tags.ts`, `crm-filters.ts`, `crm-pipeline.ts`, `crm-inbox.ts` | motores puros de etiquetas, filtros, pipeline y bandeja |

## Invariantes

1. **El alcance del vendedor es un filtro explícito de código, nunca una
   confianza en RLS.** Las server actions usan `createServiceClient()`, que
   **ignora RLS por completo**. La política `crm_prospects_owner_all`
   (`USING seller_id = auth.uid()`) protege las lecturas hechas con el cliente
   del usuario, pero **no** las de servicio. Por eso cada lectura pasa por
   `scopeForRole(role, userId)` y `applyCrmScope(...)`, y cada escritura por
   `.eq("seller_id", userId)`. La RLS es la segunda capa, no la primera.
2. **`seller_id IS NULL` es el pozo sin repartir y es invisible para el
   vendedor.** Un lead web entra al pipeline sin vendedor y el admin lo reparte.
   `sellerScope(userId)` traduce a `seller_id = userId`, que **excluye** los
   nulos. **Nunca añadir `OR seller_id IS NULL`** a una política ni al alcance:
   expondría la cartera sin repartir a todos los vendedores a la vez. Lo fija
   `src/lib/crm-core.contract.test.ts`.
3. **Un prospecto ajeno responde `"Prospecto no encontrado"`, nunca `"Acceso
   denegado"`.** La diferencia entre ambos mensajes filtra la **existencia** de
   prospectos de otros vendedores: con `"denegado"` el vendedor aprende que ese
   `id` existe aunque no sea suyo. `assertProspectInScope` devuelve siempre el
   mismo error para "no existe" y para "no es tuyo".
4. **El filtro de etiqueta vive en la URL y se aplica en memoria.** El estado
   es `?tag=`, con `tagMatches` (insensible a acentos y mayúsculas) sobre
   `p.tags`. `tagOptions` siempre incluye la etiqueta activa aunque ningún
   prospecto cargado la lleve, para que el filtro no se caiga solo al paginar.
   Una etiqueta inventada cae a "sin filtrar", no lanza.
5. **La normalización de etiquetas es compartida.** `normalizeTag` /
   `normalizeTags` / `parseTagInput` (`@/lib/crm-tags`): 24 caracteres, 12
   etiquetas por prospecto, y `parseTagInput` parte por coma, punto y coma y
   salto de línea. La UI del vendedor **no** reimplementa ninguna de las tres.
6. **`null` ≠ `0` en todos los indicadores.** Un tiempo de respuesta sin
   entrante, una tasa sin denominador y un cliente sin pedidos se pintan como
   *no medido*, nunca como cero. `mapCrmProspect` conserva la diferencia entre
   `null` (dato ausente) y `0` (dato que vale cero) en `tier`, `city_id` y
   `lead_id`; `seller_id` nulo mapea a `null`, jamás a la cadena `"null"`.
7. **La bandeja del vendedor es de solo lectura, y el envío está diferido a
   propósito.** El vendedor ve la conversación de **sus** prospectos (mismo
   alcance, mismo lector `readLeadConversation`, misma ventana de 24 h), pero
   **no** puede enviar: `ConversationPanel` recibe un objeto
   `ConversationPanelActions` con **solo** `load`, y *lo que no se inyecta no se
   renderiza* — sin compositor, sin botón de enviar, sin respuestas rápidas, sin
   plantillas y sin asistente de IA. La razón es que `sendLeadMessage` y
   `suggestLeadReply` están **gateados a admin** (`"Acceso restringido a
   administradores"`): cablearlos tal cual habría puesto un botón que solo sabe
   fallar. Habilitar el envío del vendedor es una ronda propia —requiere decidir
   el gate de rol del pipeline de WhatsApp—, no un descuido de esta.
8. **Sin SLA y sin secuencias de goteo.** Son herramientas de reparto y de
   nutrición masiva que pertenecen al admin; el vendedor no las tiene en su
   navegación ni en su alcance. Si aparecen, es una regresión.
9. **Nunca se registran cuerpos de mensaje en `admin_audit_log`.** La auditoría
   del vendedor sigue el mismo contrato que la del admin: se registra la
   **acción** y metadatos (`{ template, characters }`), nunca el texto.
10. **`PAGE_SIZE` de la lista es `CRM_PAGE_SIZE` (`@/lib/crm-filters`, 50).**
    Estaba duplicado como `50` literal en `prospectos-page.tsx`; ahora se importa.
    Un tope que se escribe dos veces se desincroniza.
11. **No se crea un segundo lector.** Si hace falta leer `crm_prospects` desde
    un sitio nuevo, se usa `readCrmProspects` con el `scope` y los `filters`
    adecuados. `src/lib/crm-reader.contract.test.ts` mantiene la **lista exacta**
    de los 13 archivos que pueden tocar la tabla y **falla tanto si aparece uno
    nuevo como si un archivo de la lista deja de tocarla** (una entrada muerta
    es una entrada que ya no protege nada).
12. **Un módulo `"use server"` solo exporta funciones `async` y tipos.** Un
    `export const BULK_TAG_LIMIT = 200` dentro de un módulo `"use server"` hizo
    fallar el build de Turbopack con `The export setProspectTags was not found in
    module …/actions.ts` — el `export *` del barrel resolvía a nada. **`tsc` y
    ESLint no lo detectan**; lo detecta `src/lib/use-server.contract.test.ts`.
    La constante va sin `export`.
13. **Toda animación respeta `prefers-reduced-motion`** (regla común 4).

## Verificación

**Antes de tocar el alcance o la ficha, correr los contratos del núcleo:**

```bash
npx vitest run src/lib/crm-core.contract.test.ts \
               src/lib/crm-prospects.test.ts \
               src/lib/crm-reader.contract.test.ts \
               src/lib/use-server.contract.test.ts
```

Qué fija cada uno:

- **`crm-core.contract.test.ts`**: el vocabulario de estados es el mismo en las
  tres superficies (`CRM_STATUSES` ≡ `PROSPECT_STATUSES` ≡ los 6 valores del
  `CHECK` de `00052`, leídos **del archivo de migración**); `mapCrmProspect`
  conserva `null` ≠ `0`; `seller_id` nulo mapea a `null`; `isProspectInScope`
  deja ver `seller_id IS NULL` al admin y **nunca** al vendedor; `applyCrmScope`
  no añade filtro en alcance admin; el filtro `statuses` solo deja pasar los
  estados listados.
- **`crm-prospects.test.ts`** (18 pruebas): el alcance del vendedor se traduce a
  `.eq("seller_id", …)`; el admin **no** recibe `eq` y sí ve los `seller_id IS
  NULL`; los filtros que viajan al servidor (`status`, `statuses`, `ids`,
  `sellerPresence: "unassigned"`); la paginación y la búsqueda (que escanea con
  `range(0, 999)` y filtra en memoria — por eso `"cafeteria"` encuentra
  `"Cafetería"`); la escalera de columnas degrada con `42703` y **no** degrada
  con un error que no es de columna; y el contrato de salida.
- **`crm-reader.contract.test.ts`**: la lista **exacta** de archivos que leen
  `crm_prospects` y la lista exacta de los que construyen la escalera de
  columnas.
- **`use-server.contract.test.ts`**: ningún módulo `"use server"` exporta un
  valor de runtime.

**Manual (requiere sesión de vendedor y `00139`/`00140` aplicadas):** entrar a
`/comercializacion/prospectos`, filtrar por una etiqueta y **recargar**: la vista
tiene que reproducir el mismo filtro (vive en la URL). Comprobar que **no**
aparece ningún prospecto sin asignar — el pozo del admin no se filtra desde aquí
porque no se ve en absoluto. Abrir la ficha de un prospecto y su conversación:
debe verse el hilo con la ventana de 24 h y **ningún control de envío**. Abrir la
ficha de un `id` de otro vendedor: tiene que responder `"Prospecto no
encontrado"`, indistinguible de un `id` que no existe.

**e2e:** `npx playwright test e2e/comercializacion.spec.ts`. Sin credenciales de
vendedor en CI el spec cubre lo que sí es comprobable: que las rutas del vendedor
**no se sirven a anónimos** (un anónimo acaba fuera de la ruta, no dentro con
datos), que los parámetros de URL arbitrarios (`?tag=`, `?nuevo=`, la combinación
completa) se descartan sin 5xx, y que la ficha de un `id` absurdo no revienta.
Lo que el spec **no** puede comprobar —que el vendedor deje de ver el pozo sin
asignar— lo cubren los contratos puros, que es donde vive esa regla.

**Ojo con el orden de las rondas:** esta superficie también la toca el agente de
**Panel** cuando cambia `globals.css` o el rail inferior (regla común 3), y el de
**UX móvil** cuando cambia el layout raíz.
