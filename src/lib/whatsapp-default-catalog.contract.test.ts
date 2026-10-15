import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { WA_QUEUE_KINDS } from "@/lib/whatsapp-sync-queue"

/**
 * Contrato SQL ↔ TypeScript de `00221_whatsapp_catalogo_principal.sql`.
 *
 * El puente entre la marca de la tienda (`products.show_in_whatsapp`) y la
 * curaduría del catálogo de WhatsApp vive en un trigger, y el trigger no tiene
 * pruebas: no hay Postgres en este repo. Lo que sí se puede fijar es su FORMA —
 * y eso es lo que hace este archivo, porque cada pieza que falte rompe la
 * funcionalidad de una manera que ningún test unitario vería:
 *
 *   - sin `is_default` no hay catálogo principal, y el trigger no tiene a quién
 *     alimentar (la marca vuelve a ser huérfana, el bug original);
 *   - sin el índice único parcial, dos catálogos pueden ser "el principal" y la
 *     marca apunta a uno distinto en cada consulta;
 *   - sin el `CHECK` de `kind`, la cola acepta un valor que el procesador no
 *     entiende y el producto se queda sin sincronizar en silencio;
 *   - sin el no-op de "no hay principal", una escritura de producto empieza a
 *     fallar en instalaciones sin catálogo.
 *
 * Y una regla en la dirección contraria: la migración **no** puede reconciliar
 * sola. Un backfill automático reescribiría cientos de productos (y su orden de
 * curaduría) sin que nadie lo vea; la reconciliación es un botón del admin.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00221_whatsapp_catalogo_principal.sql"
)

const sql = readFileSync(MIGRATION, "utf8")

/** Cuerpo de la función del trigger, para no confundirlo con el resto del SQL. */
function triggerBody(): string {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION sync_wa_default_catalog_membership")
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf("$$;", start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe("00221 — catálogo principal", () => {
  it("añade is_default como NOT NULL DEFAULT false (aditivo)", () => {
    expect(sql).toMatch(
      /ALTER TABLE whatsapp_catalogs\s+ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false/
    )
  })

  it("garantiza UN solo principal con un índice único parcial", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_catalogs_single_default/)
    expect(sql).toMatch(/ON whatsapp_catalogs\(is_default\)\s+WHERE is_default/)
  })

  it("siembra el principal de forma idempotente y sin catálogos no hace nada", () => {
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM whatsapp_catalogs WHERE is_default\) THEN\s+RETURN/)
    // Preferencia declarada: el catálogo global, y si no, el activo más antiguo.
    expect(sql).toContain("WHERE slug = 'global'")
    expect(sql).toMatch(/WHERE is_active ORDER BY created_at LIMIT 1/)
  })
})

describe("00221 — cola con dos operaciones", () => {
  it("añade kind con default 'upsert' (aditivo)", () => {
    expect(sql).toMatch(
      /ALTER TABLE whatsapp_sync_queue\s+ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'upsert'/
    )
  })

  it("el CHECK lista EXACTAMENTE los valores que el procesador entiende", () => {
    const match = sql.match(/CHECK \(kind IN \(([^)]*)\)\)/)
    expect(match).not.toBeNull()
    const enSql = (match?.[1] ?? "")
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
    // Si el SQL añade un `kind` sin que el procesador lo maneje, o al revés,
    // este test falla en vez de dejar productos sin sincronizar.
    expect(enSql).toEqual([...WA_QUEUE_KINDS])
  })

  it("se puede re-ejecutar (DROP CONSTRAINT antes de ADD)", () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS whatsapp_sync_queue_kind_check/)
  })
})

describe("00221 — el trigger del puente", () => {
  it("es no-op sin catálogo principal", () => {
    const body = triggerBody()
    expect(body).toMatch(/SELECT id INTO v_catalog FROM whatsapp_catalogs WHERE is_default LIMIT 1/)
    expect(body).toMatch(/IF v_catalog IS NULL THEN\s+RETURN NULL;\s+END IF;/)
  })

  it("en UPDATE sólo actúa si la marca cambió de valor", () => {
    // Sin esto, un bulk de precios de 500 productos dispararía 500 escrituras
    // de curaduría y 500 encolados que no cambian nada.
    expect(triggerBody()).toMatch(
      /IF TG_OP = 'UPDATE' AND NEW\.show_in_whatsapp IS NOT DISTINCT FROM OLD\.show_in_whatsapp THEN\s+RETURN NULL/
    )
  })

  it("en INSERT sin la marca no toca nada (importaciones CSV)", () => {
    // Un producto recién creado no puede estar en la curaduría, así que el
    // DELETE de la rama ELSE sería un no-op por cada alta.
    expect(triggerBody()).toMatch(
      /IF TG_OP = 'INSERT' AND NEW\.show_in_whatsapp IS NOT TRUE THEN\s+RETURN NULL/
    )
  })

  it("un error inesperado se degrada a WARNING y no rompe la escritura", () => {
    const body = triggerBody()
    // El comentario intermedio es parte del contrato: explica que el bloque
    // corre en una subtransacción implícita, así que la fila queda sin cambios
    // (nunca a medias).
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]*?RAISE WARNING/)
    expect(body).toMatch(/RETURN NULL;\s+END;/)
  })

  it("marcar encola 'upsert' y respeta la posición ya elegida", () => {
    const body = triggerBody()
    expect(body).toMatch(/VALUES \(v_catalog, NEW\.id, COALESCE\(v_position, 0\) \+ 1, true\)/)
    // El ON CONFLICT no reescribe `position`: reordenar es trabajo del admin.
    expect(body).toMatch(
      /ON CONFLICT \(catalog_id, product_id\) DO UPDATE SET is_visible = true/
    )
    expect(body).toMatch(/VALUES \(v_catalog, NEW\.id, 'show_in_whatsapp', 'upsert'\)/)
  })

  it("desmarcar encola 'hide' SÓLO si había curaduría", () => {
    const body = triggerBody()
    expect(body).toMatch(/DELETE FROM whatsapp_catalog_items\s+WHERE catalog_id = v_catalog AND product_id = NEW\.id/)
    // `FOUND` es el que evita encolar trabajo para Meta por un producto que
    // nunca estuvo en el catálogo.
    expect(body).toMatch(/IF FOUND THEN[\s\S]*?'show_in_whatsapp', 'hide'/)
  })

  it("re-encolar resetea attempts y processed_at en los dos caminos", () => {
    // Sin el reset, un producto que ya se sincronizó una vez y vuelve a
    // cambiar queda marcado como procesado y su cambio nunca llega a Meta.
    const resets = triggerBody().match(/attempts = 0,\s+queued_at = now\(\),\s+processed_at = NULL/g)
    expect(resets).toHaveLength(2)
  })

  it("se engancha a products en INSERT y en UPDATE de show_in_whatsapp", () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_products_wa_default_membership ON products/)
    expect(sql).toMatch(
      /CREATE TRIGGER trg_products_wa_default_membership\s+AFTER INSERT OR UPDATE OF show_in_whatsapp ON products\s+FOR EACH ROW\s+EXECUTE FUNCTION sync_wa_default_catalog_membership\(\)/
    )
  })

  it("NO reconcilia solo: la migración no reescribe la marca de ningún producto", () => {
    // Un backfill automático reescribiría cientos de productos (y el orden de
    // la curaduría) al desplegar. La reconciliación es un botón del admin.
    expect(sql).not.toMatch(/UPDATE products\s+SET show_in_whatsapp/)
  })
})

describe("quitar una categoría del catálogo NO toca la tienda", () => {
  const actions = readFileSync(join(process.cwd(), "src", "app", "admin", "actions.ts"), "utf8")

  /** Cuerpo de `removeWaCatalogCategory`. */
  function body(): string {
    const start = actions.indexOf("export async function removeWaCatalogCategory")
    expect(start).toBeGreaterThan(-1)
    const end = actions.indexOf("\n}\n", start)
    expect(end).toBeGreaterThan(start)
    return actions.slice(start, end)
  }

  it("borra el lugar en el orden del catálogo", () => {
    // Es lo que hace que la fila desaparezca de la lista.
    expect(body()).toMatch(/from\("whatsapp_catalog_categories"\)[\s\S]*?\.delete\(\)/)
  })

  it("saca los productos de la curaduría (reversible)", () => {
    expect(body()).toMatch(/removeFromWaCuration\(/)
  })

  it("NUNCA borra la fila de `categories`", () => {
    // El punto entero de la función: la categoría sigue en la tienda, así que se
    // puede volver a traer al catálogo con el mismo nombre. Un `delete` sobre
    // `categories` aquí sería el borrado global, que es justo lo que no se pide.
    const src = body()
    expect(src).not.toMatch(/from\("categories"\)[\s\S]{0,80}?\.delete\(/)
    expect(src).not.toMatch(/from\("categories"\)[\s\S]{0,80}?\.update\(/)
  })

  it("no reasigna la categoría de ningún producto", () => {
    // Tampoco debe tocar `products.category_id`: eso movería productos en toda
    // la tienda.
    expect(body()).not.toMatch(/category_id\s*:/)
  })
})
