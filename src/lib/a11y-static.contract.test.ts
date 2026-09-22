import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { pintaPrimitivo } from "./contrast"

/**
 * Guardia estática de accesibilidad — la superficie que axe no puede ver.
 *
 * `e2e/a11y.spec.ts` corre axe sobre 8 rutas públicas. `/admin/**` y
 * `/panel/**` exigen sesión y CI no tiene credenciales, así que **ningún gate
 * miraba esa superficie**: el `✅` de axe cubría exactamente las rutas donde el
 * panel no vive. Esta guardia cubre el hueco con lo que sí se puede decidir sin
 * navegador: hechos del JSX y del CSS, leídos del árbol de sintaxis.
 *
 * POR QUÉ EL AST Y NO EXPRESIONES REGULARES
 *
 * La medición que originó esta ronda lo dejó claro. Un `<tag …>` por líneas
 * encontraba **4** de las 251 apariciones de `focus:outline-none` (los listados
 * de atributos multilínea lo rompen); el AST encontró 12. Un `imgSinAlt` por
 * líneas daba **9** porque casaba `<img` dentro de comentarios y cadenas; el AST
 * da 0. Y un detector de diálogos por texto produjo 4 falsos positivos sobre
 * componentes que sí traen `aria-labelledby`. En este repo, cualquier hecho
 * sobre atributos JSX se lee con el compilador de TypeScript o no se lee.
 *
 * QUÉ **NO** ES ESTA GUARDIA
 *
 * No es axe. No calcula contraste, ni orden de tabulación, ni si un nombre
 * accesible es *útil* — solo si existe. Su valor no está en la cobertura sino en
 * que es determinista y corre en cada `npm test`.
 *
 * LOS DETECTORES SE PRUEBAN CONTRA FIXTURES SINTÉTICAS ANTES DE MIRAR EL
 * PERÍMETRO. Es lo que separa una guardia de un `✅` vacuo: un detector roto que
 * no encuentra nada también produce cero hallazgos, y las aserciones de abajo
 * pasarían igual. Por eso cada regla tiene su positivo y su negativo sobre
 * código escrito aquí mismo, y solo después se afirma el perímetro real.
 *
 * R7 CIERRA UN HUECO MEDIDO, NO SOSPECHADO. `iconOnlyButton` llevaba dos rondas
 * declarado «medido, no aprobado» por su tasa de falsos positivos. Se midió con
 * cuatro ajustes de precisión (ver `docs/PLAN-MEJORAS.md`, fila A17): los 25
 * hallazgos resultaron verdaderos positivos, uno por uno, y los falsos venían de
 * tres formas que el detector ya sabe leer — `aria-label={t("…")}` (expresión,
 * no literal), texto pintado por expresión (`{copied ? "copiado" : "copiar"}`) y
 * props por spread. Corregidas las tres, los 25 se arreglaron y R7 congela cero.
 *
 * `inputNoName` ENTRA, y con las tres vías resueltas. La fila A17 lo dejó fuera
 * porque el nombre de un campo puede venir de un `<label htmlFor>` en otro nodo
 * del archivo, de lo que renderice un componente contenedor (`<Field label=…>`)
 * o de un spread, y ninguna de las tres se resolvía sin salir del archivo. La
 * medición de esta ronda encontró el perímetro exacto de la fila —**193** campos,
 * los que no traen `placeholder`— y lo trió: **43** eran defectos, 17 sin nombre
 * de ninguna clase y 26 con una etiqueta hermana que no asociaba nada, que es
 * justo el caso que el heurístico absolvía por proximidad (un `<label>` sin
 * `htmlFor` no asocia, aunque esté pegado al campo). Los 43 se corrigieron y R8
 * los congela en cero con siete pruebas de detector.
 *
 * Las tres vías se resuelven sin salir del archivo, y lo que no se puede decidir
 * no se mide: el `id` de un campo se coteja con los `htmlFor` del archivo —por
 * texto, así que `htmlFor={`roi-${k}`}` reconoce a su `id={`roi-${k}`}`—, el
 * `<label>` que envuelve exonera salvo que su `htmlFor` declare otro id, el
 * padre directo exonera si es un componente con props de nombre, y un elemento
 * con spread queda fuera. El `placeholder` cuenta como nombre, que es lo que ya
 * hace la regla `label` de axe-core —el gate de `e2e/a11y.spec.ts`—; sin eso el
 * perímetro no sería el de la fila, sino el de todos los buscadores del repo.
 *
 * HUECO DECLARADO: el detector mide campos escritos como etiqueta HTML. Un campo
 * escrito como componente propio (`<Input>` de `comercializacion/ui.tsx`) queda
 * fuera, porque la definición vive en otro archivo y el detector no la lee. Se
 * midió en esta ronda: 34 usos, 26 de ellos con un `<FieldLabel>` hermano que
 * tampoco asocia —el mismo defecto, en otra forma—, y los 34 se corrigieron a
 * mano con `aria-label`. Lo que falta no es el arreglo sino la guardia: traerlos
 * al contrato exige resolver el componente, y eso es otra ronda.
 */

const RAIZ = process.cwd()
const DIRS = [join(RAIZ, "src", "app"), join(RAIZ, "src", "components")]

/**
 * Perímetro del flujo concurrente (foodos / recompensas / auth): no se toca ni
 * se congela desde aquí, para que dos líneas de trabajo no se bloqueen entre sí.
 */
const AJENOS = [
  join("src", "app", "panel", "foodos"),
  join("src", "app", "recompensas"),
  join("src", "components", "auth"),
]

function esAjeno(archivo: string): boolean {
  const rel = relative(RAIZ, archivo)
  return AJENOS.some((a) => rel === a || rel.startsWith(a + "/"))
}

function archivosTsx(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) archivosTsx(p, out)
    else if (p.endsWith(".tsx")) out.push(p)
  }
  return out
}

const PERIMETRO = DIRS.flatMap((d) => archivosTsx(d))
  .filter((f) => !esAjeno(f))
  .sort()

/** Ruta relativa: los mensajes de fallo deben ser navegables. */
function rel(archivo: string): string {
  return relative(RAIZ, archivo)
}

// ---------------------------------------------------------------------------
// Lectura de atributos JSX
// ---------------------------------------------------------------------------

/**
 * Texto de un atributo JSX, aplanando lo que puede aportar cadenas: literales,
 * plantillas, `clsx(...)`/`cn(...)` con argumentos condicionales, arrays y
 * concatenaciones. Sin esto, `className={cn("p-2", activo && "bg-green-700")}`
 * se leería como cadena vacía y el detector de foco no vería nada.
 */
function textos(node: ts.Node | undefined, out: string[] = []): string[] {
  if (!node) return out
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text)
  else if (ts.isNumericLiteral(node)) out.push(node.text)
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text)
    for (const span of node.templateSpans) textos(span.expression, out)
  } else if (ts.isJsxExpression(node)) textos(node.expression, out)
  else if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  )
    textos(node.expression, out)
  else if (ts.isBinaryExpression(node)) {
    textos(node.left, out)
    textos(node.right, out)
  } else if (ts.isConditionalExpression(node)) {
    textos(node.whenTrue, out)
    textos(node.whenFalse, out)
  } else if (ts.isCallExpression(node)) {
    textos(node.expression, out)
    for (const arg of node.arguments) textos(arg, out)
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) textos(el, out)
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) textos(prop.initializer, out)
    }
  } else if (ts.isPropertyAccessExpression(node)) textos(node.expression, out)
  return out
}

function atributo(attrs: ts.JsxAttributes, nombre: string): ts.JsxAttribute | undefined {
  return attrs.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === nombre,
  )
}

function textoAtributo(attrs: ts.JsxAttributes, nombre: string): string | null {
  const a = atributo(attrs, nombre)
  if (!a) return null
  return textos(a.initializer).join(" ")
}

type Elemento = {
  tag: string
  attrs: ts.JsxAttributes
  linea: number
  clase: string
  /** Elementos JSX que lo contienen, del más externo al más cercano. */
  ancestros: Elemento[]
  /** Hijos JSX directos, para decidir si el elemento pinta texto (R7). */
  hijos: ts.Node[]
}

/**
 * Todos los elementos JSX abiertos o autocerrados del archivo, con su línea y
 * su cadena de ancestros.
 *
 * Los ancestros se necesitan porque el indicador de foco no siempre vive en el
 * elemento enfocado: en un campo de búsqueda con forma de píldora lo natural es
 * pintar el borde del contenedor (`focus-within:`), y eso también es un
 * indicador visible para WCAG 2.4.7. Sin la cadena, R1 marcaría como defecto un
 * diseño correcto.
 *
 * El recorrido respeta la estructura real del JSX (`JsxElement.children` no
 * incluye las etiquetas de apertura ni de cierre), así que la pila no se
 * desincroniza con elementos anidados dentro de `{llaves}`.
 */
function elementos(sf: ts.SourceFile): Elemento[] {
  const out: Elemento[] = []
  const pila: Elemento[] = []

  const crear = (
    n: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    hijos: ts.Node[],
  ): Elemento => ({
    tag: n.tagName.getText(),
    attrs: n.attributes,
    linea: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
    clase: textoAtributo(n.attributes, "className") ?? "",
    ancestros: [...pila],
    hijos,
  })

  const visitar = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const e = crear(n.openingElement, [...n.children])
      out.push(e)
      pila.push(e)
      for (const hijo of n.children) visitar(hijo)
      pila.pop()
      return
    }
    if (ts.isJsxSelfClosingElement(n)) {
      out.push(crear(n, []))
      return
    }
    if (ts.isJsxFragment(n)) {
      for (const hijo of n.children) visitar(hijo)
      return
    }
    ts.forEachChild(n, visitar)
  }

  visitar(sf)
  return out
}

// ---------------------------------------------------------------------------
// Reglas R1–R4 y R6: hechos por elemento o por archivo
// ---------------------------------------------------------------------------

/** Un `outline-none` de foco solo es legítimo si algo lo reemplaza. */
const OUTLINE_NONE = /(?:^|\s)focus(?:-visible)?:outline-none(?:\s|$)/

/**
 * Descompone `sm:group-focus:ring-2` en su última variante y su valor.
 *
 * La versión anterior comparaba subcadenas del `className` (`/focus:ring-/`), así
 * que un token con variantes delante —`group-focus:ring-2`, `sm:focus:ring-2`—
 * ya contaba como indicador. Analizar el token entero conserva esa aceptación y
 * además deja de confundir `focus-within:ring-2` con `focus:ring-2`, que son
 * cosas distintas: la primera reacciona al foco de un hijo, no del elemento.
 */
function ultimaVariante(token: string): { variante: string; valor: string } | null {
  const i = token.lastIndexOf(":")
  if (i <= 0 || i === token.length - 1) return null
  return { variante: token.slice(0, i), valor: token.slice(i + 1) }
}

/** La variante reacciona al foco del propio elemento (`focus`, `group-focus`…). */
const VARIANTE_PROPIA = /(?:^|[:-])(?:focus|focus-visible)$/
/** La variante reacciona al foco de un hijo (`focus-within`, `group-focus-within`). */
const VARIANTE_CONTENEDOR = /(?:^|[:-])focus-within$/

/** Familias que pueden pintar la señal. `focus-within` no acepta `bg-`. */
const FAMILIA_PROPIA = /^(?:ring-|border-|bg-|text-|shadow-|underline-|outline-)/
const FAMILIA_CONTENEDOR = /^(?:ring-|border-|outline-)/

/**
 * Valores que nombran una señal de foco sin pintarla: anillo de 0px, borde o
 * fondo transparente, sombra `none`, contorno de 0px, desplazamiento de anillo
 * (mueve el anillo, no lo dibuja) y `ring-inset` (fija el estilo, no el ancho).
 *
 * Sin esta lista bastaba escribir `focus:ring-0` para satisfacer R1 sin que
 * nadie viera nada al tabular: el contrato premiaba la forma del reemplazo en
 * vez de su efecto, que es justo el defecto que R1 existe para encontrar.
 */
const VALOR_SIN_PINTURA =
  /^(?:ring-0|ring-\[0(?:px)?\]|ring-transparent|ring-inset|ring-offset-.+|border-0|border-\[0(?:px)?\]|border-transparent|bg-transparent|text-transparent|shadow-none|shadow-transparent|outline-0|outline-\[0(?:px)?\]|outline-none|outline-transparent)$/

/** ¿Algún token del `className` pinta una señal de foco visible? */
function pintaFoco(clase: string, variantes: RegExp, familias: RegExp): boolean {
  return clase.split(/\s+/).some((token) => {
    const v = ultimaVariante(token)
    if (!v || !variantes.test(v.variante)) return false
    return !VALOR_SIN_PINTURA.test(v.valor) && familias.test(v.valor)
  })
}

/** R1 — `focus:outline-none` sin indicador de reemplazo (WCAG 2.4.7 AA). */
function focoSinIndicador(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter(
    (e) =>
      OUTLINE_NONE.test(e.clase) &&
      !pintaFoco(e.clase, VARIANTE_PROPIA, FAMILIA_PROPIA) &&
      !e.ancestros.some((a) => pintaFoco(a.clase, VARIANTE_CONTENEDOR, FAMILIA_CONTENEDOR)),
  )
}

/** R2 — `role="dialog"` o `<dialog>` sin nombre accesible. */
function dialogosSinNombre(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => {
    const esDialogo = e.tag === "dialog" || textoAtributo(e.attrs, "role") === "dialog"
    if (!esDialogo) return false
    return (
      textoAtributo(e.attrs, "aria-label") === null &&
      textoAtributo(e.attrs, "aria-labelledby") === null &&
      textoAtributo(e.attrs, "title") === null
    )
  })
}

/** R3 — `<img>` sin `alt` (WCAG 1.1.1 A). */
function imgsSinAlt(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => e.tag === "img" && textoAtributo(e.attrs, "alt") === null)
}

/** R4 — `tabIndex` positivo: rompe el orden de tabulación del documento. */
function tabIndexPositivo(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => {
    const t = textoAtributo(e.attrs, "tabIndex")
    return t !== null && /^[1-9]/.test(t.trim())
  })
}

// ---------------------------------------------------------------------------
// Regla R7: nombre accesible en controles que no pintan texto
// ---------------------------------------------------------------------------

/** Controles que un lector de pantalla anuncia como botón o enlace. */
const CONTROLES = new Set(["button", "a", "summary"])
const ATRIBUTOS_DE_NOMBRE = ["aria-label", "aria-labelledby", "title"]

/**
 * ¿El atributo nombra el elemento?
 *
 * Un literal vacío no nombra —`aria-label=""` es el mismo defecto con más
 * ceremonia—, pero **cualquier expresión sí**: `aria-label={t("common.delete")}`
 * es un nombre real que no se puede resolver sin ejecutar el código. Darlo por
 * ausente era el falso positivo más caro del detector: en el panel casi todos
 * los botones de icono ya venían rotulados así.
 */
function nombra(attrs: ts.JsxAttributes, nombre: string): boolean {
  const a = atributo(attrs, nombre)
  if (!a) return false
  const i = a.initializer
  if (!i) return true
  if (ts.isStringLiteral(i)) return i.text.trim() !== ""
  if (ts.isJsxExpression(i)) return i.expression !== undefined
  return true
}

/**
 * ¿El subárbol pinta texto que un lector de pantalla pueda anunciar?
 *
 * Delega en `pintaPrimitivo` de `contrast.ts` en vez de reimplementar el
 * reconocimiento de expresiones: `{t("…")}` y `{abierto ? "− menos" : "+3 más"}`
 * pintan texto, y una versión que solo mirara literales los habría contado como
 * vacíos. Un icono dentro del botón también nombra **si trae su propio
 * `aria-label`**; sin él no aporta nada, que es justo el defecto que R7 busca.
 */
function pintaTexto(nodos: ts.Node[]): boolean {
  let si = false
  const visitar = (n: ts.Node): void => {
    if (si) return
    if (ts.isJsxText(n)) {
      if (n.text.trim().length > 0) si = true
      return
    }
    if (ts.isStringLiteral(n) && n.text.trim().length > 0) {
      si = true
      return
    }
    if (ts.isJsxExpression(n) && n.expression && pintaPrimitivo(n.expression)) {
      si = true
      return
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const ab = ts.isJsxElement(n) ? n.openingElement : n
      if (nombra(ab.attributes, "aria-label") || nombra(ab.attributes, "alt")) {
        si = true
        return
      }
      if (ts.isJsxElement(n)) for (const h of n.children) visitar(h)
      return
    }
    ts.forEachChild(n, visitar)
  }
  for (const n of nodos) visitar(n)
  return si
}

/** Props por spread: el nombre puede venir de fuera, así que no se mide. */
function tieneSpread(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.some((p) => ts.isJsxSpreadAttribute(p))
}

/** `display:none` / recortado: fuera del árbol de accesibilidad, no necesita nombre. */
const FUERA_DEL_ARBOL = /(?:^|\s)(?:hidden|sr-only)(?:\s|$)/

/** R7 — control sin nombre accesible (WCAG 4.1.2 A). */
function controlSinNombre(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => {
    if (!CONTROLES.has(e.tag) && textoAtributo(e.attrs, "role") !== "button") return false
    if (tieneSpread(e.attrs)) return false
    if (FUERA_DEL_ARBOL.test(e.clase)) return false
    return !ATRIBUTOS_DE_NOMBRE.some((n) => nombra(e.attrs, n)) && !pintaTexto(e.hijos)
  })
}

// ---------------------------------------------------------------------------
// Regla R8: nombre accesible en campos de formulario
// ---------------------------------------------------------------------------

/**
 * Campos que un lector de pantalla anuncia con un nombre. Se miden por la
 * etiqueta HTML, no por el componente: un `<Input>` propio solo se puede juzgar
 * leyendo su definición, y ahí ya se ve el `<input>` real.
 */
const CAMPOS = new Set(["input", "select", "textarea"])

/** `type` literal del campo, en minúsculas. */
function tipoDeCampo(attrs: ts.JsxAttributes): string {
  return (textoAtributo(attrs, "type") ?? "").trim().toLowerCase()
}

/** Un componente propio (`<Field …>`) decide por sí mismo cómo rotula a su hijo. */
function esComponente(tag: string): boolean {
  return /^[A-Z]/.test(tag)
}

/**
 * La forma con la que un campo se deja asociar: el texto de su `id`.
 *
 * No basta el literal. `id={`roi-${field.key}`}` y `htmlFor={`roi-${field.key}`}`
 * son la misma expresión escrita dos veces, y compararlas por su texto las
 * reconoce; quedarse en los literales convertiría en hallazgo una asociación que
 * el navegador sí resuelve. Un identificador —`htmlFor={id}` frente a `id={id}`—
 * y un acceso a propiedad —`htmlFor={campo.id}` frente a `id={campo.id}`— se
 * cotejan igual: dentro de un archivo, la misma expresión es el mismo valor.
 *
 * `null` significa que **no hay nada que cotejar**: sin `id`, o con un `id`
 * vacío. Ahí no se mide, porque el campo no declara con qué asociarse.
 */
function formaDeAsociacion(attrs: ts.JsxAttributes, nombre: string): string | null {
  const a = atributo(attrs, nombre)
  const i = a?.initializer
  if (!i) return null
  if (ts.isStringLiteral(i) || ts.isNoSubstitutionTemplateLiteral(i)) return i.text.trim() || null
  if (!ts.isJsxExpression(i) || !i.expression) return null
  const e = i.expression
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text.trim() || null
  if (ts.isIdentifier(e)) return `$${e.text}`
  return e.getText().replace(/\s+/g, " ")
}

/**
 * Vía 1 — los ids que algún `<label htmlFor>` **del mismo archivo** reclama.
 *
 * El `<label>` y el campo pueden estar en ramas distintas del JSX (lo normal:
 * uno al lado del otro dentro de un `<div>`), así que la asociación se resuelve
 * por el archivo entero y no por el subárbol. Un `<label>` **sin** `htmlFor` no
 * reclama nada: no aparece aquí, y por eso el campo que tiene al lado sigue
 * siendo un hallazgo en vez de quedar absuelto por proximidad.
 */
function idsReclamados(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>()
  for (const e of elementos(sf)) {
    if (e.tag !== "label") continue
    const forma = formaDeAsociacion(e.attrs, "htmlFor")
    if (forma) out.add(forma)
  }
  return out
}

/**
 * Vía 2 — props con las que un componente contenedor rotula a su hijo.
 *
 * `<Field label="Correo">` no pinta el `<label>` en este nodo: lo pinta dentro
 * de `Field`, y el archivo no puede saber con qué forma. Se exime por eso, no
 * por sospecha, y la exención se limita al **padre directo**, que es el único
 * que recibe el campo. El `placeholder` entra en la lista porque un contenedor
 * que lo recibe lo reenvía al campo, y ahí ya nombra.
 */
const PROPS_DE_NOMBRE = ["label", "aria-label", "aria-labelledby", "title", "placeholder"]

/**
 * El nodo JSX del elemento, tal como aparece entre los hijos de su padre.
 */
function nodoDe(e: Elemento): ts.Node {
  const ab = e.attrs.parent
  return ts.isJsxOpeningElement(ab) ? ab.parent : ab
}

/**
 * ¿Tiene al lado una etiqueta visible que no lo nombra?
 *
 * Es el defecto que el heurístico anterior absolvía por proximidad: un `<label>`
 * **hermano** —no ancestro— **sin `htmlFor`** no asocia nada. El campo puede
 * salvarse con un `placeholder`, pero entonces su nombre accesible es el del
 * ejemplo y no el de la etiqueta que el usuario ve, que es justo lo que prohíbe
 * WCAG 2.5.3 (Label in Name) y lo que deja a un lector de pantalla anunciando
 * «Ej: 2.5» donde la pantalla dice «Cantidad (kg)».
 *
 * Se mira el hermano directo, y un `<label>` **con** `htmlFor` no cuenta: si lo
 * tiene, ya está atado a otro campo y no es la etiqueta de este. Se midió que en
 * el perímetro no hay ninguna etiqueta visible un nivel más arriba —dentro de un
 * envoltorio, junto al campo—, así que el hermano directo cubre lo que hay.
 */
function etiquetaHermanaSuelta(e: Elemento): boolean {
  const padre = e.ancestros[e.ancestros.length - 1]
  if (!padre) return false
  const propio = nodoDe(e)
  return padre.hijos.some((h) => {
    if (h === propio || !(ts.isJsxElement(h) || ts.isJsxSelfClosingElement(h))) return false
    const ab = ts.isJsxElement(h) ? h.openingElement : h
    if (ab.tagName.getText() !== "label") return false
    // Un `<label>` que trae `htmlFor` —aunque no se pueda resolver— no es una
    // etiqueta suelta: reclama una asociación. Sin él, no asocia nada.
    return atributo(ab.attributes, "htmlFor") === undefined
  })
}

/**
 * R8 — campo de formulario sin nombre accesible (WCAG 4.1.2 A / 2.5.3 A).
 *
 * Un nombre puede llegar por cinco vías, y las tres últimas son las que el
 * heurístico anterior no sabía leer: un `<label htmlFor>` que apunta al `id` del
 * campo **en otro nodo del mismo archivo**; un `<label>` que lo envuelve; las
 * props de un componente contenedor (`<Field label=…>`); el `placeholder`; y el
 * spread, que no se mide. Cuando ninguna nombra al campo, lo que queda es un
 * control mudo o una etiqueta visible que no asocia nada.
 */
function campoSinNombre(sf: ts.SourceFile): Elemento[] {
  const reclamados = idsReclamados(sf)
  return elementos(sf).filter((e) => {
    if (!CAMPOS.has(e.tag)) return false
    // Vía 3: con spread, el nombre puede venir de fuera y no se mide.
    if (tieneSpread(e.attrs)) return false
    if (tipoDeCampo(e.attrs) === "hidden") return false
    if (FUERA_DEL_ARBOL.test(e.clase)) return false
    // Un nombre explícito manda: quien lo escribió quiso nombrar el campo.
    if (ATRIBUTOS_DE_NOMBRE.some((n) => nombra(e.attrs, n))) return false
    // Vía 1: el `id` que algún `<label htmlFor>` del archivo reclama.
    const id = formaDeAsociacion(e.attrs, "id")
    if (id && reclamados.has(id)) return false
    // `<label>` ancestro: la asociación implícita del HTML. Un `<label>` que
    // además trae `htmlFor` asocia por el id —no por envolver—, así que solo
    // exonera si su `htmlFor` no se puede cotejar aquí o es el de este campo.
    const ancestro = e.ancestros.find((a) => a.tag === "label")
    if (ancestro) {
      const suyo = formaDeAsociacion(ancestro.attrs, "htmlFor")
      if (suyo === null || suyo === id) return false
    }
    // Vía 2: el padre directo es un componente que lo rota desde dentro.
    const padre = e.ancestros[e.ancestros.length - 1]
    if (padre && esComponente(padre.tag) && PROPS_DE_NOMBRE.some((p) => nombra(padre.attrs, p))) {
      return false
    }
    // La etiqueta suelta se comprueba antes que el `placeholder`: el
    // `placeholder` nombra, pero no con el texto que el usuario ve al lado.
    if (etiquetaHermanaSuelta(e)) return true
    // El `placeholder` sí nombra, y por eso cierra la regla: es lo que ya hace
    // la regla `label` de axe-core —el gate que este repo corre en
    // `e2e/a11y.spec.ts`, con `non-empty-placeholder` en su lista de aceptación—
    // y el último recurso del cálculo de nombre accesible del navegador. El
    // contrato mide si el nombre **existe**; que un `placeholder` sea un nombre
    // pobre es asunto de WCAG 3.3.2, no de esta regla.
    return !nombra(e.attrs, "placeholder")
  })
}

/**
 * R6 — un archivo que anima con framer-motion respeta la preferencia del
 * sistema. `reducedMotion="user"` no apaga las animaciones: desactiva las de
 * transformación y layout, que son las que producen mareo. Es la forma que ya
 * usa `recompensas/page.tsx`, y framer-motion no la hereda por defecto.
 */
function importaFramerMotion(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "framer-motion",
  )
}

/** `MotionConfig reducedMotion="user"` montado en este archivo. */
function tieneMotionConfig(sf: ts.SourceFile): boolean {
  return elementos(sf).some(
    (e) =>
      e.tag === "MotionConfig" &&
      (textoAtributo(e.attrs, "reducedMotion") ?? "").replace(/["']/g, "") === "user",
  )
}

function motionSinPreferencia(sf: ts.SourceFile): boolean {
  return importaFramerMotion(sf) && !tieneMotionConfig(sf)
}

/**
 * Cobertura heredada de `MotionConfig`, declarada a mano.
 *
 * `motionSinPreferencia` mira un archivo aislado, y eso deja fuera a los hijos
 * que animan y confían en un `MotionConfig` que vive en el padre: en
 * `src/app/recompensas/_components/**` hay 19 así, y su cobertura real viene de
 * `src/app/recompensas/page.tsx`, que envuelve todos sus usos. No son defectos,
 * pero tampoco eran un hecho verificado: si alguien borra ese `MotionConfig`,
 * los 19 pierden el movimiento reducido y ningún test se entera, porque
 * `AJENOS` excluye `recompensas` del perímetro.
 *
 * Esta tabla convierte la suposición en contrato. Cada entrada dice "lo que haya
 * bajo `ambito` hereda la preferencia de `proveedor`", y R6c comprueba que el
 * proveedor **de verdad** monta `MotionConfig reducedMotion="user"`. Un hijo sin
 * `MotionConfig` propio y sin proveedor declarado sigue siendo un hallazgo.
 */
const COBERTURA_MOTION: { ambito: string; proveedor: string }[] = [
  {
    ambito: join("src", "app", "recompensas", "_components"),
    proveedor: join("src", "app", "recompensas", "page.tsx"),
  },
]

/** Los archivos que cubren los ámbitos declarados, para recorrerlos en R6b. */
const ALCANCE_MOTION = COBERTURA_MOTION.flatMap(({ ambito }) =>
  archivosTsx(join(RAIZ, ambito)),
).sort()

/**
 * ¿Anima con framer-motion, sin `MotionConfig` propio y sin un proveedor
 * declarado que lo cubra? `ruta` es relativa a la raíz del repo.
 */
function motionSinCobertura(sf: ts.SourceFile, ruta: string): boolean {
  if (!motionSinPreferencia(sf)) return false
  return !COBERTURA_MOTION.some(({ ambito }) => ruta === ambito || ruta.startsWith(ambito + "/"))
}

// ---------------------------------------------------------------------------
// Regla R5: el contrato de movimiento reducido de globals.css
// ---------------------------------------------------------------------------

const GLOBALS = join(RAIZ, "src", "app", "globals.css")
const CSS = readFileSync(GLOBALS, "utf8")

/**
 * Extrae el bloque `@media (prefers-reduced-motion: reduce)` por conteo de
 * llaves. El contrato es una lista escrita a mano, así que lo que importa es su
 * contenido real, no que exista la cabecera.
 */
function bloqueReducido(css: string): string {
  const marca = "@media (prefers-reduced-motion: reduce)"
  const inicio = css.indexOf(marca)
  if (inicio === -1) return ""
  const desde = css.indexOf("{", inicio)
  if (desde === -1) return ""
  let prof = 0
  for (let i = desde; i < css.length; i++) {
    const c = css[i]
    if (c === "{") prof++
    else if (c === "}") {
      prof--
      if (prof === 0) return css.slice(desde, i + 1)
    }
  }
  return css.slice(desde)
}

const BLOQUE = bloqueReducido(CSS)

/**
 * `animate-none` es la utilidad que *quita* animación: no necesita cobertura.
 * Las utilidades con nombre (`animate-pulse`) sí: Tailwind las declara con
 * `animation: … infinite`, y sin entrada en el bloque siguen latiendo con
 * `prefers-reduced-motion: reduce`. Los valores arbitrarios
 * (`animate-[fadeUp_0.15s_ease-out]`) no tienen clase previsible, así que los
 * cubre el selector de atributo, no una entrada por nombre.
 */
const CATCH_ALL_ARBITRARIO = '[class*="animate-["]'

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function claseCubierta(token: string): boolean {
  if (token === "animate-none") return true
  if (token.includes("[")) return BLOQUE.includes(CATCH_ALL_ARBITRARIO)
  return new RegExp(`\\.${escapeRe(token)}(?![\\w-])`).test(BLOQUE)
}

/**
 * Tokens `animate-*` realmente aplicados en el perímetro.
 *
 * Se leen **solo** de atributos `className`, y se verificó que en el perímetro
 * actual no existe ninguna aparición de `animate-` fuera de uno: la única forma
 * de perder una sería construir el nombre en una constante aparte y pasarla por
 * identificador, cosa que hoy no ocurre.
 */
function tokensAnimate(): Map<string, string[]> {
  const usos = new Map<string, string[]>()
  for (const archivo of PERIMETRO) {
    const sf = ts.createSourceFile(
      archivo,
      readFileSync(archivo, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    for (const e of elementos(sf)) {
      for (const m of e.clase.matchAll(/(?:^|\s)(animate-[^\s"']+)/g)) {
        const token = m[1]
        if (!token) continue
        const previos = usos.get(token) ?? []
        previos.push(`${rel(archivo)}:${e.linea}`)
        usos.set(token, previos)
      }
    }
  }
  return usos
}

// ---------------------------------------------------------------------------
// Autopruebas de los detectores
// ---------------------------------------------------------------------------

function analizar(fuente: string) {
  const sf = ts.createSourceFile(
    "fixture.tsx",
    fuente,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  return {
    foco: focoSinIndicador(sf).map((e) => e.linea),
    dialogos: dialogosSinNombre(sf).map((e) => e.linea),
    imgs: imgsSinAlt(sf).map((e) => e.linea),
    tabindex: tabIndexPositivo(sf).map((e) => e.linea),
    controles: controlSinNombre(sf).map((e) => e.linea),
    campos: campoSinNombre(sf).map((e) => e.linea),
    motion: motionSinPreferencia(sf),
    motionPropio: tieneMotionConfig(sf),
  }
}

/**
 * Igual que `analizar`, pero para las reglas que dependen de la ruta del
 * archivo: la cobertura heredada se resuelve por dónde vive el archivo.
 */
function analizarEn(fuente: string, ruta: string): { sinCobertura: boolean } {
  const sf = ts.createSourceFile(
    "fixture.tsx",
    fuente,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  return { sinCobertura: motionSinCobertura(sf, ruta) }
}

describe("detectores — se prueban antes de mirar el perímetro", () => {
  it("R1 encuentra el outline eliminado sin reemplazo", () => {
    expect(analizar(`<button className="focus:outline-none">x</button>`).foco).toEqual([1])
    // Multilínea: es justo lo que rompía la lectura por líneas.
    const multilinea = `<button\n  className="px-2\n    focus:outline-none\n    rounded"\n>\nx\n</button>`
    expect(analizar(multilinea).foco).toEqual([1])
  })

  it("R1 no marca lo que sí reemplaza el indicador", () => {
    expect(
      analizar(`<button className="focus:outline-none focus-visible:ring-2">x</button>`).foco,
    ).toEqual([])
    expect(
      analizar(`<input className="focus:outline-none focus:border-blue-500" />`).foco,
    ).toEqual([])
    expect(
      analizar(`<a className="focus-visible:outline-none focus-visible:outline-2" />`).foco,
    ).toEqual([])
  })

  it("R1 ve la clase cuando vive dentro de un cn(...) condicional", () => {
    expect(
      analizar(`<div className={cn("p-2", activo && "focus:outline-none")} />`).foco,
    ).toEqual([1])
  })

  it("R1 no confunde una clase distinta que contiene la subcadena", () => {
    expect(analizar(`<div className="focus:outline-hidden" />`).foco).toEqual([])
  })

  it("R1 acepta el indicador que pinta el contenedor con focus-within", () => {
    expect(
      analizar(
        `<div className="focus-within:ring-2 focus-within:ring-brand-500">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([])
    expect(
      analizar(
        `<div className="focus-within:border-[#0E7A0E]">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([])
  })

  it("R1 no acepta un contenedor que solo quita el contorno", () => {
    // Un `focus-within:outline-none` no pinta nada: el campo sigue sin indicador.
    expect(
      analizar(
        `<div className="focus-within:outline-none">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([2])
  })

  it("R1 no acepta un indicador que no pinta nada", () => {
    // El hueco que cerró la Ronda 23: `focus:ring-0` es un anillo de 0px. Antes
    // bastaba escribirlo para satisfacer el contrato sin que nada se viera.
    for (const vacio of [
      "focus:ring-0",
      "focus:ring-[0px]",
      "focus:ring-transparent",
      "focus:ring-inset",
      "focus:ring-offset-2",
      "focus:border-0",
      "focus:border-transparent",
      "focus:bg-transparent",
      "focus:text-transparent",
      "focus:shadow-none",
      "focus-visible:outline-0",
      "focus-visible:outline-transparent",
    ]) {
      expect(analizar(`<button className="focus:outline-none ${vacio}">x</button>`).foco).toEqual(
        [1],
      )
    }
    // Y el contenedor tampoco se salva con un anillo de 0px.
    expect(
      analizar(
        `<div className="focus-within:ring-0">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([2])
    expect(
      analizar(
        `<div className="focus-within:border-transparent">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([2])
  })

  it("R1 sigue aceptando el indicador real que acompaña a un valor vacío", () => {
    // `focus:border-transparent` no pinta, pero el anillo que lo acompaña sí: el
    // detector mira el token, no la clase entera.
    expect(
      analizar(
        `<input className="focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />`,
      ).foco,
    ).toEqual([])
    expect(
      analizar(`<input className="focus:outline-none focus:bg-brand-500" />`).foco,
    ).toEqual([])
  })

  it("R1 no confunde focus-within con el foco del propio elemento", () => {
    // `focus-within:ring-2` reacciona al foco de un hijo. En el propio elemento
    // con `focus:outline-none` no pinta nada al tabular hacia él.
    expect(analizar(`<button className="focus:outline-none focus-within:ring-2">x</button>`).foco).toEqual(
      [1],
    )
  })

  it("R1 acepta el indicador con variantes delante", () => {
    // La versión por regex comparaba subcadenas, así que esto ya contaba; el
    // analizador por token tiene que seguir aceptándolo.
    expect(analizar(`<input className="focus:outline-none sm:focus:ring-2" />`).foco).toEqual([])
    expect(
      analizar(`<input className="focus:outline-none group-focus:ring-2" />`).foco,
    ).toEqual([])
  })

  it("R1 no hereda el indicador de un contenedor hermano ya cerrado", () => {
    // Si la pila no se vaciara, este segundo campo quedaría exento por error.
    const fuente = `<div className="focus-within:ring-2">\n<input className="focus:outline-none" />\n</div>\n<input className="focus:outline-none" />`
    expect(analizar(fuente).foco).toEqual([4])
  })

  it("R1 sí ve el contenedor cuando el campo está dentro de una expresión", () => {
    const fuente = `<div className="focus-within:ring-2">\n{activo && <input className="focus:outline-none" />}\n</div>`
    expect(analizar(fuente).foco).toEqual([])
  })

  it("R2 encuentra el diálogo sin nombre y respeta las tres formas de nombrarlo", () => {
    expect(analizar(`<div role="dialog" />`).dialogos).toEqual([1])
    expect(analizar(`<dialog open />`).dialogos).toEqual([1])
    expect(analizar(`<div role="dialog" aria-label="Ajustes" />`).dialogos).toEqual([])
    expect(analizar(`<div role="dialog" aria-labelledby="titulo" />`).dialogos).toEqual([])
    expect(analizar(`<dialog title="Ajustes" />`).dialogos).toEqual([])
    // `role` no literal (condicional) no debe declararse diálogo por accidente.
    expect(analizar(`<div role={rol} />`).dialogos).toEqual([])
  })

  it("R3 encuentra el img sin alt y acepta alt vacío decorativo", () => {
    const src = "https://cdn.resurte.mx/zapato.png"
    expect(analizar(`<img src="${src}" />`).imgs).toEqual([1])
    expect(analizar(`<img src="${src}" alt="Zapato" />`).imgs).toEqual([])
    expect(analizar(`<img src="${src}" alt="" />`).imgs).toEqual([])
  })

  it("R4 encuentra el tabIndex positivo y acepta 0 y -1", () => {
    expect(analizar(`<div tabIndex={2} />`).tabindex).toEqual([1])
    expect(analizar(`<div tabIndex="3" />`).tabindex).toEqual([1])
    expect(analizar(`<div tabIndex={0} />`).tabindex).toEqual([])
    expect(analizar(`<div tabIndex={-1} />`).tabindex).toEqual([])
  })

  it("R6 exige reducedMotion=user solo a quien anima con framer-motion", () => {
    const sin = `import { motion } from "framer-motion"\nexport const A = () => <motion.div />`
    expect(analizar(sin).motion).toBe(true)

    const con = `import { motion, MotionConfig } from "framer-motion"\nexport const A = () => <MotionConfig reducedMotion="user"><motion.div /></MotionConfig>`
    expect(analizar(con).motion).toBe(false)

    const ajeno = `import { useState } from "react"\nexport const A = () => <div />`
    expect(analizar(ajeno).motion).toBe(false)

    // El nombre en un comentario no cuenta: la regla lee el atributo, no el texto.
    const comentado = `import { motion } from "framer-motion"\n// reducedMotion="user"\nexport const A = () => <motion.div />`
    expect(analizar(comentado).motion).toBe(true)
  })

  it("R6 no da por cubierto a un hijo cuyo ancestro no está declarado", () => {
    const hijo = `import { motion } from "framer-motion"\nexport const A = () => <motion.div />`
    // Sin `MotionConfig` propio y sin proveedor declarado para esa ruta: hallazgo.
    expect(analizarEn(hijo, "src/app/otra/Foo.tsx").sinCobertura).toBe(true)
  })

  it("R6 acepta al hijo que vive bajo un proveedor declarado", () => {
    const hijo = `import { motion } from "framer-motion"\nexport const A = () => <motion.div />`
    expect(analizarEn(hijo, "src/app/recompensas/_components/Foo.tsx").sinCobertura).toBe(false)
    // La exención es por directorio, no por subcadena: un vecino no entra.
    expect(analizarEn(hijo, "src/app/recompensas/_components2/Foo.tsx").sinCobertura).toBe(true)
  })

  it("R6 no exime a quien monta su propio MotionConfig, esté donde esté", () => {
    const propio = `import { motion, MotionConfig } from "framer-motion"\nexport const A = () => <MotionConfig reducedMotion="user"><motion.div /></MotionConfig>`
    expect(analizarEn(propio, "src/app/otra/Foo.tsx").sinCobertura).toBe(false)
  })

  it("R6 no acepta un MotionConfig que no pide la preferencia del sistema", () => {
    const flojo = `import { motion, MotionConfig } from "framer-motion"\nexport const A = () => <MotionConfig reducedMotion="always"><motion.div /></MotionConfig>`
    expect(analizarEn(flojo, "src/app/otra/Foo.tsx").sinCobertura).toBe(true)
    expect(analizar(flojo).motionPropio).toBe(false)
  })

  it("R5 reconoce cobertura por nombre y por selector arbitrario", () => {
    // El bloque real de globals.css debe seguir cubriendo lo que ya cubría:
    // si el extractor se rompiera, todo pasaría y la guardia sería decorativa.
    expect(BLOQUE).not.toBe("")
    expect(BLOQUE).toContain(".animate-spin")
    expect(BLOQUE).toContain(".animate-fade-up")
    expect(claseCubierta("animate-spin")).toBe(true)
    expect(claseCubierta("animate-none")).toBe(true)
    expect(claseCubierta("animate-[fadeUp_0.15s_ease-out]")).toBe(BLOQUE.includes(CATCH_ALL_ARBITRARIO))
    // Un token que no está en el bloque no puede darse por cubierto.
    expect(claseCubierta("animate-inventado-xyz")).toBe(false)
  })

  it("R7 encuentra el control de icono sin nombre", () => {
    expect(analizar(`<button onClick={f}><Trash2 /></button>`).controles).toEqual([1])
    expect(analizar(`<a href="/x"><ExternalLink /></a>`).controles).toEqual([1])
    expect(analizar(`<div role="button" onClick={f}><Trash2 /></div>`).controles).toEqual([1])
  })

  it("R7 no marca el control que ya tiene nombre", () => {
    expect(analizar(`<button aria-label="Eliminar"><Trash2 /></button>`).controles).toEqual([])
    expect(analizar(`<button title="Cerrar"><X /></button>`).controles).toEqual([])
    expect(analizar(`<button aria-labelledby="titulo"><X /></button>`).controles).toEqual([])
    // El nombre puede ser una expresión: no se resuelve sin ejecutar el código.
    expect(
      analizar(`<button aria-label={t("common.delete")}><Trash2 /></button>`).controles,
    ).toEqual([])
  })

  it("R7 ve el texto pintado por expresión, no solo los literales", () => {
    expect(analizar(`<button>{t("common.save")}</button>`).controles).toEqual([])
    expect(
      analizar(`<button>{abierto ? "− menos" : \`+3 más\`}</button>`).controles,
    ).toEqual([])
    // Un icono con su propio rótulo sí nombra al botón que lo contiene.
    expect(
      analizar(`<button>{copiado ? <Check aria-label="Copiado" /> : <Copiar />}</button>`)
        .controles,
    ).toEqual([])
  })

  it("R7 no confunde un icono mudo con un nombre", () => {
    // El icono sin rótulo es el defecto, no la coartada: no aporta nombre.
    expect(analizar(`<button>{copiado ? <Check /> : <Copiar />}</button>`).controles).toEqual([1])
  })

  it("R7 distingue un nombre vacío de uno ausente", () => {
    expect(analizar(`<button aria-label=""><Trash2 /></button>`).controles).toEqual([1])
    expect(analizar(`<button aria-label=" "><Trash2 /></button>`).controles).toEqual([1])
  })

  it("R7 no mide lo que no puede decidir", () => {
    // Spread: el nombre puede venir de fuera.
    expect(analizar(`<button {...props}><Trash2 /></button>`).controles).toEqual([])
    // Fuera del árbol de accesibilidad.
    expect(analizar(`<button className="hidden"><Trash2 /></button>`).controles).toEqual([])
    expect(analizar(`<button className="sr-only"><Trash2 /></button>`).controles).toEqual([])
    // Un `<div>` con icono no es un control.
    expect(analizar(`<div><Trash2 /></div>`).controles).toEqual([])
  })

  it("R8 encuentra el campo sin nombre", () => {
    expect(analizar(`<input type="email" />`).campos).toEqual([1])
    expect(analizar(`<select value={estado} />`).campos).toEqual([1])
    expect(analizar(`<textarea rows={3} />`).campos).toEqual([1])
    // Un nombre vacío no nombra, ni en el atributo ni en el hueco de ejemplo.
    expect(analizar(`<input aria-label="" />`).campos).toEqual([1])
    expect(analizar(`<input aria-label=" " />`).campos).toEqual([1])
    expect(analizar(`<input placeholder=" " />`).campos).toEqual([1])
  })

  it("R8 no marca el campo que ya tiene nombre", () => {
    expect(analizar(`<input aria-label="Correo" />`).campos).toEqual([])
    expect(analizar(`<input aria-labelledby="titulo" />`).campos).toEqual([])
    expect(analizar(`<input title="Correo" />`).campos).toEqual([])
    expect(analizar(`<input aria-label={t("campos.correo")} />`).campos).toEqual([])
    expect(analizar(`<input placeholder="tu@correo.mx" />`).campos).toEqual([])
    // Otro nodo no es un campo.
    expect(analizar(`<div aria-label="Correo" />`).campos).toEqual([])
  })

  it("R8 resuelve el nombre que vive en otro nodo del mismo archivo (vía 1)", () => {
    // El `<label>` y el campo están en ramas distintas del JSX: lo normal.
    expect(
      analizar(`<div>\n<label htmlFor="correo">Correo</label>\n<input id="correo" />\n</div>`).campos,
    ).toEqual([])
    // El `htmlFor` de otro campo no nombra a este.
    expect(
      analizar(`<div>\n<label htmlFor="otro">Otro</label>\n<input id="correo" />\n</div>`).campos,
    ).toEqual([3])
    // `htmlFor={id}` frente a `id={id}`: la misma expresión escrita dos veces.
    expect(
      analizar(`<div>\n<label htmlFor={id}>Correo</label>\n<input id={id} />\n</div>`).campos,
    ).toEqual([])
    // Dos expresiones distintas no son la misma asociación.
    expect(
      analizar(`<div>\n<label htmlFor={campo.id}>Correo</label>\n<input id={otro.id} />\n</div>`)
        .campos,
    ).toEqual([3])
  })

  it("R8 acepta el <label> que envuelve al campo", () => {
    expect(analizar(`<label>Correo\n<input />\n</label>`).campos).toEqual([])
    // Envolver no basta si el `<label>` trae `htmlFor`: asocia por el id, y el
    // id que declara no es el del campo que envuelve.
    expect(
      analizar(`<div>\n<label htmlFor="otro">Correo\n<input id="correo" />\n</label>\n</div>`)
        .campos,
    ).toEqual([3])
    // Si el `htmlFor` coincide con el id del campo, ya lo resolvió la vía 1.
    expect(
      analizar(`<div>\n<label htmlFor="correo">Correo\n<input id="correo" />\n</label>\n</div>`)
        .campos,
    ).toEqual([])
  })

  it("R8 resuelve el nombre que pone el componente contenedor (vía 2)", () => {
    expect(analizar(`<Field label="Correo">\n<input />\n</Field>`).campos).toEqual([])
    expect(analizar(`<Field aria-label="Correo">\n<input />\n</Field>`).campos).toEqual([])
    // Un componente sin props de nombre no absuelve a su hijo.
    expect(analizar(`<Field>\n<input />\n</Field>`).campos).toEqual([2])
    // Un `<div>` no decide nada por su hijo, aunque lleve la prop.
    expect(analizar(`<div label="Correo">\n<input />\n</div>`).campos).toEqual([2])
  })

  it("R8 marca el <label> hermano sin htmlFor", () => {
    // El caso que el heurístico anterior daba por nombrado: la etiqueta está al
    // lado, pero no asocia nada — ni con `htmlFor` ni envolviendo al campo.
    expect(
      analizar(`<div>\n<label>Cantidad (kg)</label>\n<input type="number" />\n</div>`).campos,
    ).toEqual([3])
    // Y sigue siendo defecto cuando un `placeholder` tapa el hueco: el nombre
    // que anuncia el lector de pantalla no es el que el usuario ve al lado.
    expect(
      analizar(
        `<div>\n<label>Cantidad (kg)</label>\n<input type="number" placeholder="Ej: 2.5" />\n</div>`,
      ).campos,
    ).toEqual([3])
    // Un `<label>` con `htmlFor` no es una etiqueta suelta, aunque apunte a otro
    // campo: ese ya tiene dueño.
    expect(
      analizar(`<div>\n<label htmlFor="otro">Cantidad</label>\n<input id="kg" />\n</div>`).campos,
    ).toEqual([3])
  })

  it("R8 no mide lo que no puede decidir", () => {
    // Vía 3: con spread, el nombre puede venir de fuera.
    expect(analizar(`<input {...props} />`).campos).toEqual([])
    // Fuera del árbol de accesibilidad: `type="hidden"` no se anuncia.
    expect(analizar(`<input type="hidden" value={token} />`).campos).toEqual([])
    expect(analizar(`<input className="hidden" />`).campos).toEqual([])
    expect(analizar(`<input className="sr-only" />`).campos).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Perímetro real — tolerancia cero
// ---------------------------------------------------------------------------

function leerConAst(archivo: string): ts.SourceFile {
  return ts.createSourceFile(
    archivo,
    readFileSync(archivo, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

function hallazgos(fn: (sf: ts.SourceFile) => Elemento[]): string[] {
  const out: string[] = []
  for (const archivo of PERIMETRO) {
    for (const e of fn(leerConAst(archivo))) out.push(`${rel(archivo)}:${e.linea} <${e.tag}>`)
  }
  return out
}

describe("perímetro — accesibilidad estática", () => {
  it("R1: ningún control pierde su indicador de foco", () => {
    expect(hallazgos(focoSinIndicador)).toEqual([])
  })

  it("R2: todo diálogo tiene nombre accesible", () => {
    expect(hallazgos(dialogosSinNombre)).toEqual([])
  })

  it("R3: ningún img sin alt", () => {
    expect(hallazgos(imgsSinAlt)).toEqual([])
  })

  it("R4: ningún tabIndex positivo", () => {
    expect(hallazgos(tabIndexPositivo)).toEqual([])
  })

  it("R7: ningún control se queda sin nombre accesible", () => {
    // Tolerancia cero: los 25 que había se corrigieron con `aria-label` en esta
    // ronda. Si vuelve a aparecer un botón de icono mudo, falla aquí.
    expect(hallazgos(controlSinNombre)).toEqual([])
  })

  it("R8: ningún campo de formulario se queda sin nombre accesible", () => {
    // Tolerancia cero: los 43 que había —17 sin nombre de ninguna clase y 26 con
    // una etiqueta hermana que no asociaba nada— se corrigieron en esta ronda,
    // casi todos conectando la etiqueta visible con `htmlFor`+`id`. Si vuelve a
    // aparecer un campo mudo, o una etiqueta visible que no asocia, falla aquí.
    expect(hallazgos(campoSinNombre)).toEqual([])
  })

  it("R5: toda animación usada está en el bloque de movimiento reducido", () => {
    const sinCubrir: string[] = []
    for (const [token, usos] of tokensAnimate()) {
      if (!claseCubierta(token)) sinCubrir.push(`${token} (${usos.length} usos, p.ej. ${usos[0]})`)
    }
    expect(sinCubrir).toEqual([])
  })

  it("R6: quien anima con framer-motion respeta la preferencia del sistema", () => {
    const sinPreferencia = PERIMETRO.filter((f) => motionSinPreferencia(leerConAst(f)))
    expect(sinPreferencia.map(rel)).toEqual([])
  })

  it("R6b: quien anima bajo un MotionConfig heredado está declarado", () => {
    // El ámbito vive fuera de `PERIMETRO` (es ajeno), así que se recorre aparte.
    // El canario evita que un `readdir` roto deje la regla sin archivos que leer.
    expect(ALCANCE_MOTION.length).toBeGreaterThan(10)
    const sinCobertura = ALCANCE_MOTION.filter((f) => motionSinCobertura(leerConAst(f), rel(f)))
    expect(sinCobertura.map(rel)).toEqual([])
  })

  it("R6c: cada proveedor declarado monta de verdad MotionConfig reducedMotion=user", () => {
    const sinMontar = COBERTURA_MOTION.filter(
      ({ proveedor }) => !tieneMotionConfig(leerConAst(join(RAIZ, proveedor))),
    ).map(({ proveedor }) => proveedor)
    expect(sinMontar).toEqual([])
  })

  it("el perímetro es el esperado (si esto cambia, las reglas de arriba cambian de significado)", () => {
    // Falla si el recorrido deja de encontrar archivos: sin esto, un `readdir`
    // roto haría pasar las cinco reglas anteriores con cero archivos leídos.
    expect(PERIMETRO.length).toBeGreaterThan(380)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/admin/"))).toBe(true)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/"))).toBe(true)
    // Los tres perímetros ajenos se comprueban igual que `esAjeno`, con
    // prefijo y no con subcadena: `src/components/panel/foodos/*` sí entra.
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/panel/foodos"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/recompensas"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/auth"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/panel/foodos"))).toBe(true)
  })
})
