import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CREDIT_DAYS,
  CREDIT_DAYS_PROSE,
  DELIVERY_CITIES,
  FREE_SHIPPING_MXN,
  INVOICING,
  MEMBERSHIP_FEE_MXN,
  MIN_ORDER_MXN,
  formatMxn,
  getCommercialFacts,
  getCommercialFactsSummary,
} from "./commercial-facts"
import { MEXICO_CITIES } from "./cities"

describe("commercial-facts", () => {
  it("usa las cifras comerciales verificadas", () => {
    expect(MIN_ORDER_MXN).toBe(500)
    expect(FREE_SHIPPING_MXN).toBe(500)
    expect(MEMBERSHIP_FEE_MXN).toBe(0)
    expect(INVOICING).toBe("CFDI 4.0")
    expect([...CREDIT_DAYS]).toEqual([7, 15, 30])
  })

  it("deriva la cobertura del listado real de ciudades", () => {
    expect(DELIVERY_CITIES).toBe(MEXICO_CITIES.length)
    expect(DELIVERY_CITIES).toBeGreaterThan(0)
  })

  it("formatea montos en pesos mexicanos con separador de miles", () => {
    expect(formatMxn(500)).toBe("$500 MXN")
    expect(formatMxn(2500)).toBe("$2,500 MXN")
  })

  it("no deja etiquetas ni valores vacíos", () => {
    const facts = getCommercialFacts()
    expect(facts.length).toBeGreaterThan(0)
    for (const fact of facts) {
      expect(fact.label.trim()).not.toBe("")
      expect(fact.value.trim()).not.toBe("")
    }
  })

  it("no repite etiquetas", () => {
    const labels = getCommercialFacts().map((f) => f.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("cada valor se puede citar sin el resto de la página", () => {
    // Un valor citable no puede empezar en minúscula ni depender del contexto:
    // si menciona un monto, debe traer la moneda.
    for (const fact of getCommercialFacts()) {
      expect(fact.value).toMatch(/^[A-ZÁÉÍÓÚÑ0-9$]/)
      if (/\d/.test(fact.value) && /\$/.test(fact.value)) {
        expect(fact.value).toContain("MXN")
      }
    }
  })

  it("menciona las condiciones clave que los usuarios preguntan", () => {
    const texto = getCommercialFacts()
      .map((f) => `${f.label} ${f.value} ${f.detail ?? ""}`)
      .join(" ")
    expect(texto).toContain("500")
    expect(texto).toContain(formatMxn(FREE_SHIPPING_MXN))
    expect(texto).toContain("CFDI 4.0")
    expect(texto).toContain("7, 15, 30 días")
    expect(texto).toContain(String(MEXICO_CITIES.length))
  })

  it("el resumen en prosa cubre las mismas condiciones", () => {
    const resumen = getCommercialFactsSummary()
    expect(resumen).toContain(formatMxn(MIN_ORDER_MXN))
    expect(resumen).toContain(formatMxn(FREE_SHIPPING_MXN))
    expect(resumen).toContain("CFDI 4.0")
    expect(resumen).toContain("sin membresía")
    expect(resumen).toContain("7, 15, 30 días")
    expect(resumen).not.toContain("null")
  })
})

// ---------------------------------------------------------------------------
// Guarda anti-deriva: las superficies que citan los motores de IA deben leer
// las cifras comerciales de `commercial-facts.ts`, nunca escribirlas a mano.
// Si alguna vuelve a hardcodear un número, este test falla y evita que un
// motor de IA cite una cifra obsoleta.
// ---------------------------------------------------------------------------
describe("CREDIT_DAYS_PROSE", () => {
  it("redacta los días de crédito en prosa, sin repetir el fraseo a mano", () => {
    expect(CREDIT_DAYS_PROSE).toBe("7, 15 o 30")
    for (const dia of CREDIT_DAYS) {
      expect(CREDIT_DAYS_PROSE).toContain(String(dia))
    }
  })
})

describe("superficies GEO sin cifras hardcodeadas", () => {
  const SUPERFICIES = [
    "./structured-data.ts",
    "./preguntas.ts",
    "./author.ts",
    "../app/llms.txt/route.ts",
    "../app/llms-full.txt/route.ts",
    "../app/preguntas/page.tsx",
    "../app/faq/page.tsx",
    "../app/precios/page.tsx",
    "../components/seo/datos-clave.tsx",
    "../components/seo/fuentes-metodologia.tsx",
  ]

  const PATRONES = [
    /\$500\s*MXN/,
    /\$2,500\s*MXN/,
    /\$35\s*MXN/,
    /CFDI\s*4\.0/,
    /\b20 ciudades\b/,
    /7,\s*15\s*o\s*30 días/,
  ]

  it.each(SUPERFICIES)("%s interpola las cifras desde commercial-facts", (rel) => {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8")
    const ofensivas = PATRONES.filter((re) => re.test(src)).map((re) => re.source)
    expect(ofensivas).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Guarda de valores: una superficie puede no interpolar (marketing, i18n,
// imágenes OG) pero si publica un monto de envío gratis o de pedido mínimo
// tiene que coincidir con la cifra canónica. Esto es lo que habría atrapado
// el "$3,000 MXN" que circulaba en el prompt del agente de ventas mientras el
// resto del sitio decía $2,500 MXN.
// ---------------------------------------------------------------------------
function listarFuentes(dir: URL, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const hijo = new URL(entrada.name + (entrada.isDirectory() ? "/" : ""), dir)
    if (entrada.isDirectory()) listarFuentes(hijo, acc)
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      acc.push(hijo.pathname)
    }
  }
  return acc
}

/** Las líneas comentadas describen el código, no publican una promesa al cliente. */
const ES_COMENTARIO = /^\s*(\/\/|\/\*|\*|\{\/\*)/

describe("cifras publicadas en src coinciden con la fuente de verdad", () => {
  const ARCHIVOS = listarFuentes(new URL("../", import.meta.url))

  const AFIRMACIONES: Array<[string, RegExp, number]> = [
    ["envío gratis", /gratis desde \$([\d,]+)/gi, FREE_SHIPPING_MXN],
    ["pedido mínimo", /m[íi]nimo (?:de |son )?\$([\d,]+)/gi, MIN_ORDER_MXN],
  ]

  it("encuentra archivos que auditar", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100)
  })

  it.each(AFIRMACIONES)("el %s publicado usa la cifra canónica", (nombre, patron, esperado) => {
    const infracciones: string[] = []
    for (const archivo of ARCHIVOS) {
      for (const linea of readFileSync(archivo, "utf8").split("\n")) {
        if (ES_COMENTARIO.test(linea)) continue
        for (const match of linea.matchAll(new RegExp(patron))) {
          const monto = Number((match[1] ?? "").replace(/,/g, ""))
          if (monto !== esperado) {
            infracciones.push(`${archivo.replace(/.*\/src\//, "src/")}: ${nombre} $${match[1]}`)
          }
        }
      }
    }
    expect(infracciones).toEqual([])
  })
})

describe("la lista de ciudades del FAQ coincide con la cobertura real", () => {
  it("nombra todas las ciudades del catálogo", () => {
    const faq = readFileSync(new URL("../app/faq/page.tsx", import.meta.url), "utf8")
    const faltantes = MEXICO_CITIES.filter((ciudad) => {
      // El FAQ usa el nombre corto para la capital, igual que el resto del sitio.
      const etiqueta = ciudad.slug === "cdmx" ? "CDMX" : ciudad.name
      return !faq.includes(etiqueta)
    }).map((ciudad) => ciudad.name)
    expect(faltantes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Guarda de presencia: que una cifra falte es tan dañino como que esté mal.
// El umbral de envío gratis es una de las preguntas que más se le hacen a un
// motor de IA sobre Resurte.me; si no está en `llms.txt` ni en las superficies
// de respuesta, el modelo lo responde con datos de terceros. Esta guarda
// obliga a que cada superficie citable lo publique desde la fuente de verdad.
// ---------------------------------------------------------------------------
describe("las superficies citables publican el umbral de envío gratis", () => {
  const SUPERFICIES_CITABLES = [
    "../app/llms.txt/route.ts",
    "../app/llms-full.txt/route.ts",
    "../app/faq/page.tsx",
    "../app/preguntas/page.tsx",
    "./structured-data.ts",
    "../components/seo/datos-clave.tsx",
    "../components/seo/fuentes-metodologia.tsx",
  ]

  it.each(SUPERFICIES_CITABLES)("%s publica el umbral desde la fuente de verdad", (rel) => {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8")
    const publicaElDato =
      src.includes("FREE_SHIPPING_MXN") || src.includes("getCommercialFacts")
    expect(publicaElDato).toBe(true)
  })
})
