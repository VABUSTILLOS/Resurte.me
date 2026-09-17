/**
 * Fábrica de filas de `crm_prospects` para las pruebas del CRM.
 *
 * Ronda 7: el contrato compartido `CrmProspectRow` exige los 24 campos de la
 * tabla. Escribir el literal completo en cada `describe` hacía que añadir una
 * columna rompiera varios archivos de prueba a la vez, así que el valor por
 * defecto vive aquí y cada caso pisa solo lo que le importa.
 *
 * No es código de producción: solo lo importan los `*.test.ts` del CRM.
 */

import type { CrmProspectRow } from "./crm-core"

/**
 * Campos a pisar. Acepta `undefined` explícito para que se le pueda pasar
 * cualquier `Partial<…>` derivado (por ejemplo `Partial<AssignableProspect>`,
 * que hace opcional `city_id`) sin que la opcionalidad se contagie al resultado.
 */
export type CrmProspectOverrides = {
  [K in keyof CrmProspectRow]?: CrmProspectRow[K] | undefined
}

/** Fila mínima válida: sin vendedor, estado `nuevo`, sin etiquetas. */
export function crmProspect(overrides: CrmProspectOverrides = {}): CrmProspectRow {
  return Object.assign(
    {
      id: 1,
      seller_id: null,
      lead_id: null,
      name: "Prospecto",
      restaurant_name: null,
      phone: null,
      whatsapp: null,
      email: null,
      city_id: null,
      city_name: null,
      tier: null,
      zone: null,
      status: "nuevo",
      user_id: null,
      referral_code: null,
      last_contact_at: null,
      next_follow_up_at: null,
      notes: null,
      source: "manual",
      tags: [],
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    } satisfies CrmProspectRow,
    overrides,
  )
}
