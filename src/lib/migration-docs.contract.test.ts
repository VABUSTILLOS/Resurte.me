import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Contrato de la documentación de migraciones: **un doc no puede declarar
 * "pendiente de aplicar" una migración cuyo archivo ya vive en el repo.**
 *
 * Contexto: `docs/OPS.md` mantuvo durante meses una sección
 * §«Migraciones pendientes de aplicar a mano» con seis migraciones —`00082`,
 * `00083`, `00084`, `00085`, `00116` y `00117`— que ya estaban aplicadas a
 * producción. El usuario leía esa lista, creía que tenía SQL acumulado sin
 * correr y volvía a pegar las migraciones en el SQL Editor. Ese gesto tiene un
 * coste real y silencioso: **el editor no registra filas en
 * `supabase_migrations.schema_migrations`**, así que aplicar a mano deja el
 * ledger con un hueco, y `db push` no re-aplica esos huecos nunca (solo empuja
 * versiones locales mayores que la máxima remota). La documentación obsoleta no
 * era cosmética: era la causa del drift.
 *
 * El modo de fallo es el de siempre en este tipo de contrato: el texto no
 * falla, no avisa, y se lee igual de bien. Una migración se aplica, su sección
 * se queda en "pendiente", y nadie lo nota hasta que alguien pega SQL a mano.
 *
 * **Discriminador crítico**: en estos docs la palabra "pendiente" es
 * vocabulario sobrecargado y casi siempre legítimo —"pendiente de cobro",
 * "pendiente de limpieza", "pedido pendiente de pago", "rotación pendiente"— y
 * las sondas REST la usan como etiqueta de resultado
 * (`` `404`/`PGRST205` pendiente · `200` aplicada ``). Por eso el contrato
 * **no** busca "pendiente": busca la frase que sí es una afirmación de trabajo
 * por hacer, **"pendiente de aplicar"**, y solo la marca cuando en el mismo
 * ámbito se nombra una migración concreta.
 *
 * Dos formas de afirmarlo, dos detectores:
 *
 *  1. **En la línea**: `### ⚠️ Migración \`00116\` pendiente de aplicar`.
 *  2. **En un encabezado de sección**: `### Migraciones pendientes de aplicar a
 *     mano` — el encabezado promete trabajo, y las migraciones que nombra su
 *     cuerpo son las que lo constituyen.
 *
 * **Válvula de escape documentada**: una migración recién creada y todavía sin
 * empujar sí puede declararse pendiente. Para ese caso, y solo ese, se escribe
 * el marcador `<!-- migracion-pendiente-ok: motivo -->` en la línea (o en el
 * encabezado de la sección). El marcador es deliberado y local: obliga a
 * escribirlo y a justificarlo, en vez de a desactivar el contrato.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")

/** Directorios que no contienen documentación del proyecto. */
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  ".copilot",
  "node_modules",
  "playwright-report",
  "test-results",
])

/** La afirmación de trabajo por hacer. Nada más cuenta como "pendiente". */
const PENDING_PHRASE = /pendientes?\s+de\s+aplicar/i
/** Excepción explícita y justificada. */
const ESCAPE_HATCH = /<!--\s*migracion-pendiente-ok\s*:/i
/** `00116_product_sales_view.sql`. */
const MIGRATION_FILE_RE = /\b(\d{5})_[a-z0-9_]+\.sql\b/g
/** `` `00116` `` — la versión suelta, que es como la citan los encabezados. */
const MIGRATION_TICK_RE = /`(\d{5})`/g

type Hit = { line: number; version: string; reason: string }

function markdownFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...markdownFiles(full))
    else if (entry.endsWith(".md")) found.push(full)
  }
  return found
}

/** Versiones de migración nombradas en una línea, por archivo o entre backticks. */
function versionsIn(line: string): string[] {
  const versions: string[] = []
  for (const re of [MIGRATION_FILE_RE, MIGRATION_TICK_RE]) {
    re.lastIndex = 0
    for (const match of line.matchAll(re)) {
      const version = match[1]
      if (version) versions.push(version)
    }
  }
  return versions
}

/**
 * Afirmaciones obsoletas: líneas que declaran "pendiente de aplicar" una
 * migración que ya existe como archivo local.
 *
 * `known` son las versiones presentes en `supabase/migrations/`: una
 * afirmación sobre una migración que aún no está en el repo es legítima y no
 * se reporta.
 */
function staleClaims(markdown: string, known: Set<string>): Hit[] {
  const lines = markdown.split("\n")

  // Secciones cuyo encabezado promete trabajo: su cuerpo entero queda bajo
  // sospecha. El fin de la sección es el siguiente encabezado de nivel igual o
  // superior.
  const pendingSections: { line: number; end: number }[] = []
  lines.forEach((text, index) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(text)
    const level = heading?.[1]
    const title = heading?.[2]
    if (level === undefined || title === undefined) return
    if (!PENDING_PHRASE.test(title) || ESCAPE_HATCH.test(text)) return

    let end = lines.length
    for (let next = index + 1; next < lines.length; next++) {
      const candidate = /^(#{1,6})\s+/.exec(lines[next] ?? "")
      const candidateLevel = candidate?.[1]
      if (candidateLevel !== undefined && candidateLevel.length <= level.length) {
        end = next
        break
      }
    }
    pendingSections.push({ line: index + 1, end })
  })

  const hits = new Map<string, Hit>()
  const record = (hit: Hit) => hits.set(`${hit.line}:${hit.version}`, hit)

  lines.forEach((text, index) => {
    const versions = versionsIn(text)
    if (versions.length === 0) return
    const line = index + 1

    if (PENDING_PHRASE.test(text) && !ESCAPE_HATCH.test(text)) {
      for (const version of versions) {
        record({ line, version, reason: "la línea declara «pendiente de aplicar»" })
      }
    }

    for (const section of pendingSections) {
      if (index > section.line - 1 && index < section.end) {
        for (const version of versions) {
          record({
            line,
            version,
            reason: `cae bajo el encabezado de L${section.line}, que declara «pendiente de aplicar»`,
          })
        }
      }
    }
  })

  return [...hits.values()].filter((hit) => known.has(hit.version)).sort((a, b) => a.line - b.line)
}

const KNOWN = new Set(
  readdirSync(MIGRATIONS_DIR)
    .map((name) => /^(\d{5})_/.exec(name)?.[1])
    .filter((version): version is string => Boolean(version))
)

const DOCS = markdownFiles(REPO).map((path) => ({
  path: relative(REPO, path),
  text: readFileSync(path, "utf8"),
}))

describe("contrato de migraciones en la documentación", () => {
  it("el detector reconoce las dos formas de afirmarlo", () => {
    // Regresión exacta: así estaba escrito el encabezado de 00116 en docs/OPS.md.
    expect(
      staleClaims("### ⚠️ Migración `00116` pendiente de aplicar (vista de ventas por producto)", KNOWN)
    ).toEqual([{ line: 1, version: "00116", reason: "la línea declara «pendiente de aplicar»" }])

    // Y así la sección que enumeraba las seis migraciones.
    const section = [
      "### Migraciones pendientes de aplicar a mano",
      "",
      "En el SQL Editor de Supabase, en este orden:",
      "",
      "1. `00082_foodos_payment_proofs.sql` — sin ella subir un comprobante falla.",
      "2. `00117_address_book.sql` — sin ella no se guarda la última dirección usada.",
      "",
      "### Otra sección",
      "",
      "`00153_payment_status_enum_processing_expired.sql` ya está aplicada.",
    ].join("\n")

    expect(staleClaims(section, KNOWN).map((hit) => hit.version)).toEqual(["00082", "00117"])
  })

  it("no confunde «pendiente» con «pendiente de aplicar»", () => {
    // Las sondas REST usan "pendiente" como etiqueta de resultado, no como
    // afirmación de trabajo. Si esto empezara a marcar, el contrato se volvería
    // ruido y alguien lo desactivaría.
    const legitimo = [
      "# 404 PGRST205 = pendiente · 401/403 = aplicada",
      "`00116_product_sales_view.sql` — sonda: `404`/`PGRST205` pendiente · `401`/`403` aplicada.",
      "Las filas ausentes del ledger son nueve: `00043`, `00082`, `00116` y `00117`.",
      "### ⚠️ Contraseña de Postgres: rotación pendiente (incidente 17-sep-2026)",
      "El pedido queda pendiente de pago y el panel lo mostraría como pendiente de cobro.",
      "La tabla legado `product_stores` quedó pendiente de limpieza tras el seed.",
      "`00154_marketplace_delivery_proof.sql` añade `delivery_proof_path` a `orders`.",
    ].join("\n")

    expect(staleClaims(legitimo, KNOWN)).toEqual([])
  })

  it("una afirmación sobre una migración que aún no está en el repo es legítima", () => {
    expect(staleClaims("### Migración `99999` pendiente de aplicar", KNOWN)).toEqual([])
  })

  it("la válvula de escape exime una línea justificada", () => {
    const escaped = "`00154_marketplace_delivery_proof.sql` pendiente de aplicar. <!-- migracion-pendiente-ok: creada, aún sin empujar -->"
    expect(staleClaims(escaped, KNOWN)).toEqual([])
  })

  it("ningún doc declara pendiente de aplicar una migración que ya está en el repo", () => {
    const offenders = DOCS.flatMap((doc) =>
      staleClaims(doc.text, KNOWN).map((hit) => `${doc.path}:${hit.line} → \`${hit.version}\` (${hit.reason})`)
    )

    expect(
      offenders,
      "Estos docs afirman que falta aplicar una migración cuyo archivo ya vive en " +
        "`supabase/migrations/`. Si la migración ya está aplicada, corrige el estado y la " +
        "sonda; si de verdad falta empujarla, usa `npm run db:status` para verlo y aplica con " +
        "`npx supabase db push` en vez de pegarla en el SQL Editor (que deja el ledger sin " +
        "fila y provoca el drift que este contrato existe para evitar)."
    ).toEqual([])
  })

  it("el barrido no pasa en vacío", () => {
    // Canario: si cambia la estructura de los docs o el formato de los nombres,
    // la aserción de arriba pasaría sin haber mirado nada.
    const totalReferences = DOCS.flatMap((doc) => doc.text.split("\n").flatMap(versionsIn)).length

    expect(KNOWN.size, "no se encontró ninguna migración en supabase/migrations/").toBeGreaterThanOrEqual(150)
    expect(DOCS.length, "no se encontró ningún archivo .md que barrer").toBeGreaterThanOrEqual(20)
    expect(
      totalReferences,
      "los docs dejaron de nombrar migraciones por número: el barrido ya no comprueba nada"
    ).toBeGreaterThanOrEqual(20)
  })
})
