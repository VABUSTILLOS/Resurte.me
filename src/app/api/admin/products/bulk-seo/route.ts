import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { KieAiError, chatCompletion, isKieAiConfigured } from "@/lib/ai/kie-ai"
import {
  SEO_MAX_IDS,
  buildSeoMessages,
  needsSeo,
  parseSeoProposal,
  type SeoProposal,
} from "@/lib/seo-batch"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * POST /api/admin/products/bulk-seo
 *
 * Ronda 7 — propone `seo_title` / `seo_description` con IA para la selección.
 * Solo genera propuestas (no escribe): el panel las muestra en un preview
 * editable y las aplica con el PATCH de `update`, que ya deja bitácora con el
 * diff antes/después.
 *
 * Body: `{ ids: number[], overwrite?: boolean }`. Los productos que ya tienen
 * ambos campos se devuelven en `skipped` salvo que `overwrite` sea true.
 * Máximo `SEO_MAX_IDS` ids por llamada (el panel manda tandas).
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    if (!isKieAiConfigured()) {
      return NextResponse.json(
        { error: "KIE_AI_API_KEY no está configurada. Ver docs/KIE_AI.md." },
        { status: 500 }
      )
    }

    const parsed = await readJsonBody<{ ids?: unknown; overwrite?: unknown }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data
    const ids = Array.isArray(body.ids)
      ? [
          ...new Set(
            body.ids.filter((v): v is number => typeof v === "number" && Number.isInteger(v))
          ),
        ]
      : []
    if (ids.length === 0) {
      return NextResponse.json({ error: "Se requiere ids" }, { status: 400 })
    }
    if (ids.length > SEO_MAX_IDS) {
      return NextResponse.json({ error: `Máximo ${SEO_MAX_IDS} productos por tanda` }, { status: 400 })
    }
    const overwrite = body.overwrite === true

    const supabase = await createServiceClient()
    const { data: rows, error } = await supabase
      .from("products")
      .select("id,name,brand,description,tags,seo_title,seo_description,category_id")
      .in("id", ids)
      .is("deleted_at", null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const products = (rows ?? []) as unknown as {
      id: number
      name: string
      brand: string | null
      description: string | null
      tags: string[] | null
      seo_title: string | null
      seo_description: string | null
      category_id: number | null
    }[]

    const categoryIds = [
      ...new Set(products.map((p) => p.category_id).filter((v): v is number => v !== null)),
    ]
    const categoryNames = new Map<number, string>()
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase
        .from("categories")
        .select("id,name")
        .in("id", categoryIds)
      for (const c of (cats ?? []) as unknown as { id: number; name: string }[]) {
        categoryNames.set(c.id, c.name)
      }
    }

    const skipped: { id: number; name: string; reason: string }[] = []
    const failed: { id: number; name: string; reason: string }[] = []
    const proposals: SeoProposal[] = []

    for (const product of products) {
      if (!overwrite && !needsSeo(product)) {
        skipped.push({ id: product.id, name: product.name, reason: "ya tiene SEO" })
        continue
      }
      try {
        // Igual que el botón del formulario: sin `model` la API usa su default.
        const { content } = await chatCompletion({
          model: "",
          messages: buildSeoMessages({
            id: product.id,
            name: product.name,
            brand: product.brand,
            description: product.description,
            tags: product.tags,
            categoryName:
              product.category_id != null ? (categoryNames.get(product.category_id) ?? null) : null,
          }),
          temperature: 0.4,
        })
        const parsed = parseSeoProposal(content)
        if (!parsed) {
          failed.push({ id: product.id, name: product.name, reason: "respuesta sin JSON válido" })
          continue
        }
        proposals.push({
          id: product.id,
          name: product.name,
          seo_title: parsed.title,
          seo_description: parsed.description,
        })
      } catch (err) {
        failed.push({
          id: product.id,
          name: product.name,
          reason:
            err instanceof KieAiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "error desconocido",
        })
      }
    }

    // Los ids inexistentes (o en la papelera) se reportan como omitidos.
    const found = new Set(products.map((p) => p.id))
    for (const id of ids) {
      if (!found.has(id)) skipped.push({ id, name: `#${id}`, reason: "no disponible" })
    }

    return NextResponse.json({ success: true, proposals, skipped, failed })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/admin/products/bulk-seo]", error)
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
