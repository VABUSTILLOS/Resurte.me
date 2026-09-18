import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/roles", () => ({ requireSellerOrAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  createProspect,
  bulkCreateProspects,
  updateProspect,
  addActivity,
  createAssistedOrder,
  createTask,
  completeCrmTask,
  reopenCrmTask,
  deleteCrmTask,
  listProspectTasks,
  getTaskAgenda,
} from "./actions"
import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"

const SELLER_ID = "seller-111"

type Result = { data?: unknown; error?: unknown }

function tableMock(results: Result[]) {
  const builder: Record<string, unknown> = {}
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "is", "or", "ilike",
    "order", "limit", "range", "gte", "lte",
    "single", "maybeSingle",
  ]
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = function (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    const first = results[0] ?? { data: [], error: null }
    const r = results.length > 1 ? (results.shift() ?? first) : first
    return Promise.resolve(r).then(resolve, reject)
  }
  return builder
}

function serviceWith(tables: Record<string, Result[]>) {
  const builders: Record<string, ReturnType<typeof tableMock>> = {}
  for (const [table, results] of Object.entries(tables)) {
    builders[table] = tableMock(results)
  }
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => builders[t] ?? tableMock([{ data: [], error: null }])),
  } as never)
  return builders
}

const ADMIN_ID = "admin-1"

/**
 * Cambia el rol que ve `requireSellerOrAdminAction`.
 *
 * Por defecto la sesión es de vendedor; las pruebas del pozo lo suben a admin.
 * El rol importa desde F5: `createProspect` decide con él si el prospecto nace
 * asignado a quien escribe o sin asignar en el pozo.
 */
function asRole(role: "seller" | "admin") {
  vi.mocked(requireSellerOrAdminAction).mockResolvedValue({
    userId: role === "admin" ? ADMIN_ID : SELLER_ID,
    role,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  asRole("seller")
})

describe("createProspect", () => {
  it("rechaza nombre vacío", async () => {
    await expect(createProspect({ name: "   " })).rejects.toThrow(
      "El nombre del contacto es obligatorio"
    )
  })

  it("rechaza email con formato inválido", async () => {
    await expect(createProspect({ name: "Ana", email: "correo-malo" })).rejects.toThrow(
      "El correo no tiene un formato válido"
    )
  })

  it("rechaza teléfono y whatsapp fuera de rango", async () => {
    await expect(createProspect({ name: "Ana", phone: "123" })).rejects.toThrow(
      "El teléfono debe tener entre 8 y 15 dígitos"
    )
    await expect(
      createProspect({ name: "Ana", whatsapp: "1".repeat(16) })
    ).rejects.toThrow("El WhatsApp debe tener entre 8 y 15 dígitos")
  })

  it("crea el prospecto con datos saneados y estado por defecto", async () => {
    const inserted = {
      id: 1,
      seller_id: SELLER_ID,
      name: "Ana López",
      restaurant_name: "Tacos El Norte",
      phone: "5512345678",
      whatsapp: null,
      email: null,
      city_id: null,
      tier: null,
      zone: null,
      status: "nuevo",
      user_id: null,
      referral_code: null,
      last_contact_at: null,
      next_follow_up_at: null,
      notes: null,
      source: "manual",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const builders = serviceWith({ crm_prospects: [{ data: inserted, error: null }] })

    const prospect = await createProspect({
      name: "  Ana López  ",
      restaurant_name: " Tacos El Norte ",
      phone: "5512345678",
    })

    expect(prospect.name).toBe("Ana López")
    expect(prospect.status).toBe("nuevo")
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ seller_id: SELLER_ID, name: "Ana López", status: "nuevo" })
    )
  })

  it("el admin que crea sin elegir vendedor deja el prospecto en el pozo", async () => {
    asRole("admin")
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 3, seller_id: null, status: "nuevo" }, error: null }],
    })

    await createProspect({ name: "Ana" })

    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ seller_id: null }))
  })

  it("el admin puede asignar el prospecto a un vendedor concreto", async () => {
    asRole("admin")
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 3, seller_id: SELLER_ID, status: "nuevo" }, error: null }],
    })

    await createProspect({ name: "Ana", seller_id: SELLER_ID })

    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ seller_id: SELLER_ID }))
  })

  it("el vendedor no puede regalar su prospecto a otro", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 3, seller_id: SELLER_ID, status: "nuevo" }, error: null }],
    })

    await createProspect({ name: "Ana", seller_id: "otro-vendedor" })

    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ seller_id: SELLER_ID }))
  })

  it("rechaza segmentación imposible o negativa", async () => {
    await expect(
      createProspect({ name: "Ana", weekly_volume_min: 500, weekly_volume_max: 100 })
    ).rejects.toThrow("El volumen semanal mínimo no puede superar al máximo")
    await expect(createProspect({ name: "Ana", estimated_value: -1 })).rejects.toThrow(
      "El valor previsto no puede ser negativo"
    )
    await expect(createProspect({ name: "Ana", employees: -3 })).rejects.toThrow(
      "El número de empleados no puede ser negativo"
    )
  })

  it("guarda los campos de segmentación declarados", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 3, status: "nuevo" }, error: null }],
    })

    await createProspect({
      name: "Ana",
      estimated_value: 4500.5,
      employees: 12,
      instagram: "  @tacoselnorte  ",
      weekly_volume_min: 100,
      weekly_volume_max: 300,
    })

    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        estimated_value: 4500.5,
        employees: 12,
        instagram: "@tacoselnorte",
        weekly_volume_min: 100,
        weekly_volume_max: 300,
      })
    )
  })

  it("propaga error de base de datos como error genérico", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: { message: "db down" } }] })
    await expect(createProspect({ name: "Ana" })).rejects.toThrow("Error al crear el prospecto")
  })
})

describe("bulkCreateProspects", () => {
  it("rechaza importaciones vacías o que exceden 200 filas", async () => {
    await expect(bulkCreateProspects([])).rejects.toThrow("No hay filas para importar")
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `P${i}` }))
    await expect(bulkCreateProspects(many)).rejects.toThrow(
      "Máximo 200 prospectos por importación"
    )
  })

  it("reporta errores por fila y no inserta nada si alguna falla", async () => {
    const builders = serviceWith({
      cities: [{ data: [{ id: 1, name: "Ciudad de México" }], error: null }],
      crm_prospects: [{ data: null, error: null }],
    })
    const result = await bulkCreateProspects([
      { name: "Ana", city_name: "Ciudad de México" },
      { name: "Luis", email: "malo" },
      { name: "Sara", city_name: "Narnia" },
    ])
    expect(result.created).toBe(0)
    expect(result.errors).toEqual([
      { row: 2, message: "El correo no tiene un formato válido" },
      { row: 3, message: 'Ciudad "Narnia" no existe en el catálogo' },
    ])
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).not.toHaveBeenCalled()
  })

  it("inserta filas válidas con ciudad resuelta y source=import", async () => {
    const builders = serviceWith({
      cities: [{ data: [{ id: 7, name: "Guadalajara" }], error: null }],
      crm_prospects: [{ data: null, error: null }],
    })
    const result = await bulkCreateProspects([
      { name: "Ana", city_name: "guadalajara" },
      { name: "Luis" },
    ])
    expect(result).toEqual({ created: 2, errors: [] })
    const insert = builders.crm_prospects?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Ana", city_id: 7, source: "import", status: "nuevo" }),
      expect.objectContaining({ name: "Luis", city_id: null, source: "import" }),
    ])
  })
})

describe("updateProspect", () => {
  // El gemelo del arreglo de F3 en la superficie del vendedor: cualquier ruta
  // que escriba `status` tiene que limpiar `loss_reason` y `closed_at` en el
  // mismo `UPDATE`, o reabrir un trato perdido choca con los `CHECK` de 00184.
  it("reabrir limpia motivo y fecha en el mismo update", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "en_seguimiento", cities: null }, error: null }],
    })

    await updateProspect(7, { status: "en_seguimiento" })

    const update = builders.crm_prospects?.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "en_seguimiento", loss_reason: null, closed_at: null })
    )
  })

  it("ganar limpia el motivo sin borrar la fecha de cierre", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "cliente_activo", cities: null }, error: null }],
    })

    await updateProspect(7, { status: "cliente_activo" })

    const patch = (builders.crm_prospects?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(patch.loss_reason).toBeNull()
    expect("closed_at" in patch).toBe(false)
  })

  it("un cambio de contacto no toca los campos de cierre", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "perdido", cities: null }, error: null }],
    })

    await updateProspect(7, { notes: "  Llamar el lunes  " })

    const patch = (builders.crm_prospects?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(patch).toEqual({ notes: "Llamar el lunes" })
  })

  it("rechaza un estado fuera del vocabulario", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: null }] })
    await expect(updateProspect(7, { status: "ganado" as never })).rejects.toThrow(
      "Estado de prospecto inválido"
    )
  })

  it("escribe los campos de segmentación", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "nuevo", cities: null }, error: null }],
    })

    await updateProspect(7, {
      estimated_value: 900,
      employees: 4,
      instagram: "@norte",
      weekly_volume_min: 10,
      weekly_volume_max: 20,
    })

    const patch = (builders.crm_prospects?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(patch).toEqual({
      estimated_value: 900,
      employees: 4,
      instagram: "@norte",
      weekly_volume_min: 10,
      weekly_volume_max: 20,
    })
  })

  it("un campo numérico vacío se guarda como no declarado, no como cero", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "nuevo", cities: null }, error: null }],
    })

    await updateProspect(7, { estimated_value: null, instagram: "   " })

    const patch = (builders.crm_prospects?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(patch).toEqual({ estimated_value: null, instagram: null })
  })

  it("rechaza un rango invertido en la edición", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: null }] })
    await expect(
      updateProspect(7, { weekly_volume_min: 90, weekly_volume_max: 10 })
    ).rejects.toThrow("El volumen semanal mínimo no puede superar al máximo")
  })

  it("no escribe seller_id: la reasignación tiene su propia puerta", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 7, status: "nuevo", cities: null }, error: null }],
    })

    await updateProspect(7, { notes: "hola", seller_id: "otro" } as never)

    const patch = (builders.crm_prospects?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect("seller_id" in patch).toBe(false)
  })
})

describe("addActivity", () => {
  it("rechaza tipos de actividad inválidos", async () => {
    await expect(
      addActivity(1, { type: "paloma-mensajera" as never })
    ).rejects.toThrow("Tipo de actividad inválido")
  })

  it("rechaza duraciones inválidas", async () => {
    await expect(
      addActivity(1, { type: "llamada", duration_seconds: 0 })
    ).rejects.toThrow("La duración debe ser mayor a 0")
    await expect(
      addActivity(1, { type: "llamada", duration_seconds: -5 })
    ).rejects.toThrow("La duración debe ser mayor a 0")
  })

  it("falla si el prospecto no pertenece al vendedor", async () => {
    serviceWith({ crm_prospects: [{ data: null, error: { message: "not found" } }] })
    await expect(addActivity(99, { type: "llamada" })).rejects.toThrow("Prospecto no encontrado")
  })

  it("registra la actividad y promueve prospecto nuevo a contactado", async () => {
    const builders = serviceWith({
      crm_prospects: [
        { data: { id: 5, status: "nuevo" }, error: null },
        { data: null, error: null },
      ],
      crm_activities: [{ data: null, error: null }],
    })
    await addActivity(5, { type: "llamada", summary: " Platicamos  ", duration_seconds: 120 })

    const insert = builders.crm_activities?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect_id: 5,
        seller_id: SELLER_ID,
        type: "llamada",
        direction: "saliente",
        summary: "Platicamos",
        duration_seconds: 120,
      })
    )
    const update = builders.crm_prospects?.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "contactado", last_contact_at: expect.any(String) })
    )
  })
})

describe("createAssistedOrder", () => {
  it("exige al menos un producto", async () => {
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [] })
    ).rejects.toThrow("El pedido debe tener al menos un producto")
  })

  it("rechaza cantidades no enteras o menores a 1", async () => {
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 0 }] })
    ).rejects.toThrow("Las cantidades deben ser enteros mayores a 0")
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 1.5 }] })
    ).rejects.toThrow("Las cantidades deben ser enteros mayores a 0")
  })

  it("exige prospecto vinculado a una cuenta", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: null, city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 1, quantity: 2 }] })
    ).rejects.toThrow("vinculado a una cuenta")
  })

  it("rechaza productos que no existen en el catálogo", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
      products: [{ data: [], error: null }],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 1, items: [{ productId: 999, quantity: 1 }] })
    ).rejects.toThrow("Producto inválido en el pedido (999)")
  })

  it("rechaza direcciones que no pertenecen al cliente", async () => {
    serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 1, whatsapp: null, phone: null, email: null, restaurant_name: null },
          error: null,
        },
      ],
      products: [{ data: [{ id: 1, name: "Tortilla", price: 25, sale_price: null, stock_status: "in_stock" }], error: null }],
      addresses: [{ data: null, error: null }],
    })
    await expect(
      createAssistedOrder({ prospectId: 1, addressId: 42, items: [{ productId: 1, quantity: 1 }] })
    ).rejects.toThrow("La dirección seleccionada no pertenece al cliente")
  })

  it("crea el pedido con precios del catálogo y registra actividad", async () => {
    const builders = serviceWith({
      crm_prospects: [
        {
          data: { id: 1, name: "Ana", user_id: "client-1", city_id: 3, whatsapp: "5512345678", phone: null, email: "ana@x.mx", restaurant_name: null },
          error: null,
        },
      ],
      products: [
        {
          data: [
            { id: 1, name: "Tortilla", price: 25, sale_price: 20, stock_status: "in_stock" },
            { id: 2, name: "Salsa", price: 30, sale_price: null, stock_status: "in_stock" },
          ],
          error: null,
        },
      ],
      addresses: [{ data: { id: 9, city: "CDMX", state: "CDMX" }, error: null }],
      orders: [{ data: { id: 77 }, error: null }],
      order_items: [{ data: null, error: null }],
      crm_activities: [{ data: null, error: null }],
    })

    const result = await createAssistedOrder({
      prospectId: 1,
      addressId: 9,
      items: [
        { productId: 1, quantity: 2 }, // 20 × 2 = 40
        { productId: 2, quantity: 1 }, // 30 × 1 = 30
      ],
      note: "entrega lunes",
    })

    expect(result).toEqual({ orderId: 77 })
    const orderInsert = builders.orders?.insert as ReturnType<typeof vi.fn>
    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "client-1",
        seller_id: SELLER_ID,
        city_id: 3,
        address_id: 9,
        status: "pending",
        total: 70,
        subtotal: 70,
        customer_phone: "5512345678",
        customer_email: "ana@x.mx",
      })
    )
    const itemsInsert = builders.order_items?.insert as ReturnType<typeof vi.fn>
    expect(itemsInsert).toHaveBeenCalledWith([
      { order_id: 77, product_id: 1, quantity: 2, unit_price: 20 },
      { order_id: 77, product_id: 2, quantity: 1, unit_price: 30 },
    ])
    const activityInsert = builders.crm_activities?.insert as ReturnType<typeof vi.fn>
    expect(activityInsert).toHaveBeenCalledWith(
      expect.objectContaining({ prospect_id: 1, type: "pedido", outcome: "pedido_confirmado" })
    )
  })
})

describe("tareas del CRM", () => {
  // El módulo compartido con el panel. Aquí se fijan las tres reglas que hacen
  // que las tareas sean del CRM y no una lista suelta de recordatorios:
  //
  //  1. **El alcance se decide sobre el prospecto.** Toda tarea cuelga de un
  //     trato, y quien no puede ver el trato no puede tocar su trabajo. La
  //     prueba que importa es la negativa: borrar una tarea de un prospecto
  //     ajeno **no emite ningún `delete`**.
  //  2. **El responsable es el vendedor del prospecto, no quien escribe.** Un
  //     admin repartiendo carga no se queda con el trabajo.
  //  3. **Completar y reabrir son un par, no dos asignaciones de campo.** El
  //     `CHECK` bicondicional de 00185 no admite "completada sin fecha".

  const PROSPECT_ROW = { id: 10, seller_id: "owner-999" }

  it("el alcance del vendedor viaja como filtro en la consulta", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
      crm_tasks: [{ data: null, error: null }],
    })

    await createTask(10, { title: "Llamar" })

    const eq = builders.crm_prospects?.eq as ReturnType<typeof vi.fn>
    expect(eq).toHaveBeenCalledWith("seller_id", SELLER_ID)
  })

  it("el responsable nace siendo el vendedor del prospecto, no quien escribe", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
      crm_tasks: [{ data: null, error: null }],
    })

    await createTask(10, { title: "  Llamar a Juan  " })

    const insert = builders.crm_tasks?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith({
      prospect_id: 10,
      seller_id: "owner-999",
      title: "Llamar a Juan",
      due_at: null,
      priority: "media",
      created_by: SELLER_ID,
    })
  })

  it("un prospecto en el pozo deja la tarea sin responsable", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: { id: 10, seller_id: null }, error: null }],
      crm_tasks: [{ data: null, error: null }],
    })

    await createTask(10, { title: "Repartir" })

    const insert = builders.crm_tasks?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ seller_id: null }))
  })

  it("una fecha ilegible no se guarda como fecha", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
      crm_tasks: [{ data: null, error: null }],
    })

    await createTask(10, { title: "Revisar", due_at: "el jueves" })

    const insert = builders.crm_tasks?.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ due_at: null }))
  })

  it("rechaza el alta antes de tocar la base si el título o la prioridad no valen", async () => {
    serviceWith({ crm_prospects: [{ data: PROSPECT_ROW, error: null }] })

    await expect(createTask(10, { title: "   " })).rejects.toThrow(/obligatorio/i)
    await expect(createTask(10, { title: "Ok", priority: "urgente" })).rejects.toThrow(
      /Prioridad/i
    )
    expect(vi.mocked(createServiceClient)).not.toHaveBeenCalled()
  })

  it("no se puede crear una tarea sobre un prospecto fuera de alcance", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: null, error: null }],
      crm_tasks: [{ data: null, error: null }],
    })

    await expect(createTask(999, { title: "Colarse" })).rejects.toThrow(
      "Prospecto no encontrado"
    )
    expect(builders.crm_tasks?.insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("completar escribe estado y fecha de cierre en el MISMO update", async () => {
    const builders = serviceWith({
      crm_tasks: [{ data: { id: 3, prospect_id: 10 }, error: null }, { data: null, error: null }],
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
    })

    await completeCrmTask(3)

    const update = builders.crm_tasks?.update as ReturnType<typeof vi.fn>
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(patch.status).toBe("completada")
    expect(typeof patch.completed_at).toBe("string")
  })

  it("reabrir limpia la fecha de cierre", async () => {
    const builders = serviceWith({
      crm_tasks: [{ data: { id: 3, prospect_id: 10 }, error: null }, { data: null, error: null }],
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
    })

    await reopenCrmTask(3)

    const patch = (builders.crm_tasks?.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>
    expect(patch).toEqual({ status: "pendiente", completed_at: null })
  })

  it("una tarea que no existe no se completa", async () => {
    const builders = serviceWith({ crm_tasks: [{ data: null, error: null }] })

    await expect(completeCrmTask(404)).rejects.toThrow("Tarea no encontrada")
    expect(builders.crm_tasks?.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("BORRAR una tarea de un prospecto fuera de alcance no emite ningún delete", async () => {
    // La propiedad central del módulo: la barrera no es la UI, es esta consulta.
    const builders = serviceWith({
      crm_tasks: [{ data: { id: 3, prospect_id: 999 }, error: null }, { data: null, error: null }],
      crm_prospects: [{ data: null, error: null }],
    })

    await expect(deleteCrmTask(3)).rejects.toThrow("Prospecto no encontrado")

    expect(builders.crm_tasks?.delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("dentro del alcance, el borrado sí se emite", async () => {
    const builders = serviceWith({
      crm_tasks: [{ data: { id: 3, prospect_id: 10 }, error: null }, { data: null, error: null }],
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
    })

    await deleteCrmTask(3)

    const remove = builders.crm_tasks?.delete as ReturnType<typeof vi.fn>
    expect(remove).toHaveBeenCalledTimes(1)
    const eq = builders.crm_tasks?.eq as ReturnType<typeof vi.fn>
    expect(eq).toHaveBeenCalledWith("id", 3)
  })

  it("listar las tareas de un prospecto ajeno no lee la tabla de tareas", async () => {
    const builders = serviceWith({
      crm_prospects: [{ data: null, error: null }],
      crm_tasks: [{ data: [], error: null }],
    })

    await expect(listProspectTasks(999)).rejects.toThrow("Prospecto no encontrado")
    expect(builders.crm_tasks?.select as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("la lista vuelve en orden de trabajo, no en orden de llegada", async () => {
    const row = (over: Record<string, unknown>) => ({
      id: 1,
      prospect_id: 10,
      seller_id: null,
      title: "t",
      due_at: null,
      priority: "media",
      status: "pendiente",
      completed_at: null,
      created_by: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      ...over,
    })
    serviceWith({
      crm_prospects: [{ data: PROSPECT_ROW, error: null }],
      crm_tasks: [
        {
          data: [
            row({ id: 1, due_at: null }),
            row({ id: 2, due_at: "2020-01-01T09:00:00.000Z" }),
          ],
          error: null,
        },
      ],
    })

    const tasks = await listProspectTasks(10)

    // La vencida primero; la sin fecha nunca se adelanta por no tener fecha.
    expect(tasks.map((t) => t.id)).toEqual([2, 1])
  })
})

describe("agenda de tareas", () => {
  // La agenda es la única lectura del módulo que filtra por el vendedor del
  // **prospecto** y no por `crm_tasks.seller_id`: es la regla del módulo, y
  // además la única que no se desfasa cuando un trato cambia de manos por una
  // ruta que no toca las tareas.

  const AGENDA_ROW = {
    id: 3,
    prospect_id: 10,
    seller_id: "owner-999",
    title: "Llamar a Juan",
    due_at: "2026-09-14T09:00:00.000Z",
    priority: "alta",
    status: "pendiente",
    completed_at: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    crm_prospects: { id: 10, name: "Juan Pérez", restaurant_name: "Tacos El Norte", phone: "5512345678" },
  }

  it("el vendedor acota por el dueño del prospecto, no por el de la tarea", async () => {
    const builders = serviceWith({ crm_tasks: [{ data: [AGENDA_ROW], error: null }] })

    await getTaskAgenda()

    const select = builders.crm_tasks?.select as ReturnType<typeof vi.fn>
    // `!inner` no es decorativo: sin él PostgREST deja la fila padre y anula el
    // embebido, que es lo contrario de acotar.
    expect(select).toHaveBeenCalledWith(expect.stringContaining("crm_prospects!inner("))
    const eq = builders.crm_tasks?.eq as ReturnType<typeof vi.fn>
    expect(eq).toHaveBeenCalledWith("crm_prospects.seller_id", SELLER_ID)
    expect(eq).toHaveBeenCalledWith("status", "pendiente")
  })

  it("el admin no filtra por vendedor y ve la agenda entera", async () => {
    vi.mocked(requireSellerOrAdminAction).mockResolvedValue({
      userId: SELLER_ID,
      role: "admin",
    } as never)
    const builders = serviceWith({ crm_tasks: [{ data: [AGENDA_ROW], error: null }] })

    await getTaskAgenda()

    const select = builders.crm_tasks?.select as ReturnType<typeof vi.fn>
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("!inner"))
    const eq = builders.crm_tasks?.eq as ReturnType<typeof vi.fn>
    expect(eq).not.toHaveBeenCalledWith("crm_prospects.seller_id", expect.anything())
  })

  it("cada tarea viaja con el cliente al que pertenece", async () => {
    serviceWith({ crm_tasks: [{ data: [AGENDA_ROW], error: null }] })

    const entries = await getTaskAgenda()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.task.title).toBe("Llamar a Juan")
    expect(entries[0]?.prospect).toEqual({
      id: 10,
      name: "Juan Pérez",
      restaurant_name: "Tacos El Norte",
      phone: "5512345678",
    })
  })

  it("un prospecto sin nombre no deja la agenda sin tarea", async () => {
    serviceWith({
      crm_tasks: [{ data: [{ ...AGENDA_ROW, crm_prospects: null }], error: null }],
    })

    const entries = await getTaskAgenda()

    expect(entries[0]?.prospect).toBeNull()
    expect(entries[0]?.task.id).toBe(3)
  })
})
