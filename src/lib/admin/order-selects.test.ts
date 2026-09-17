import { describe, expect, it } from "vitest"
import {
  ADMIN_ORDER_OPTIONAL_COLUMNS,
  ORDERS_PROFILE_FK,
  buildAdminOrderPrintSelect,
  buildAdminOrdersSelect,
  isAdminOrderOptionalColumn,
  missingColumnName,
  missingOptionalOrderColumn,
  orderCustomerLabel,
} from "./order-selects"

/**
 * Regresión de PGRST201: `orders` tiene dos FKs a `profiles`
 * (`orders_user_id_fkey` y `orders_seller_id_fkey`, esta última de la
 * migración 00052). Un embed sin hint hace que PostgREST rechace la consulta
 * completa y el panel de pedidos muestre "Error al cargar los pedidos".
 */
describe("embeds de profiles", () => {
  const selects: Array<[string, string]> = [
    ["lista admin", buildAdminOrdersSelect()],
    ["ticket imprimible", buildAdminOrderPrintSelect()],
  ]

  it.each(selects)("%s usa el hint de FK", (_name, select) => {
    expect(select).toContain(`profiles!${ORDERS_PROFILE_FK}(full_name)`)
  })

  it.each(selects)("%s no deja ningún embed de profiles sin hint", (_name, select) => {
    // Un `profiles(` precedido de `!` es el hint; sin `!` es el embed ambiguo.
    const bareEmbeds = select.match(/(?<!!)\bprofiles\(/g) ?? []
    expect(bareEmbeds).toEqual([])
  })
})

describe("buildAdminOrdersSelect", () => {
  it("incluye las columnas que el panel mapea", () => {
    const select = buildAdminOrdersSelect()
    for (const column of [
      "id",
      "user_id",
      "status",
      "subtotal",
      "delivery_fee",
      "discount",
      "coupon_code",
      "total",
      "payment_method",
      "payment_status",
      "source",
      "created_at",
      "driver_id",
      "delivery_proof_path",
    ]) {
      expect(select).toContain(column)
    }
    expect(select).toContain("addresses(street, number, interior")
  })

  it("omite coupon_code cuando el esquema no lo tiene (reintento por 42703)", () => {
    const select = buildAdminOrdersSelect({ coupon: false })
    expect(select).not.toContain("coupon_code")
    // El resto de columnas se conserva: el reintento solo quita la ausente.
    expect(select).toContain("discount")
    expect(select).toContain("total")
    expect(select).toContain("driver_id")
  })

  it("omite driver_id cuando el esquema no lo tiene (reintento por 42703)", () => {
    const select = buildAdminOrdersSelect({ driver: false })
    expect(select).not.toContain("driver_id")
    expect(select).toContain("coupon_code")
  })

  it("omite delivery_proof_path cuando el esquema no lo tiene (reintento por 42703)", () => {
    const select = buildAdminOrdersSelect({ proof: false })
    expect(select).not.toContain("delivery_proof_path")
    expect(select).toContain("driver_id")
    expect(select).toContain("coupon_code")
  })

  it("solo pide la ruta del comprobante, no su fecha ni su nota", () => {
    // La fecha y la nota llegan al abrir el comprobante, junto con la URL
    // firmada; la lista solo necesita saber si hay y de qué objeto borrarlo.
    const select = buildAdminOrdersSelect()
    expect(select).toContain("delivery_proof_path")
    expect(select).not.toContain("delivery_proof_at")
    expect(select).not.toContain("delivery_proof_note")
  })

  it("puede omitir las tres columnas opcionales a la vez", () => {
    const select = buildAdminOrdersSelect({ coupon: false, driver: false, proof: false })
    expect(select).not.toContain("coupon_code")
    expect(select).not.toContain("driver_id")
    expect(select).not.toContain("delivery_proof_path")
    expect(select).toContain("profiles!")
  })
})

describe("buildAdminOrderPrintSelect", () => {
  it("trae los items, el repartidor y el cupón", () => {
    const select = buildAdminOrderPrintSelect()
    expect(select).toContain("order_items(quantity, unit_price, products(name))")
    expect(select).toContain("delivery_drivers(name)")
    expect(select).toContain("coupon_code")
    expect(select).toContain("scheduled_for")
  })

  it("omite coupon_code sin perder el resto del ticket", () => {
    const select = buildAdminOrderPrintSelect({ coupon: false })
    expect(select).not.toContain("coupon_code")
    expect(select).toContain("order_items(")
    expect(select).toContain("delivery_drivers(name)")
  })
})

describe("missingColumnName", () => {
  it("extrae la columna de un error 42703 de PostgREST", () => {
    expect(
      missingColumnName({
        code: "42703",
        message: 'column orders.coupon_code does not exist',
      })
    ).toBe("coupon_code")
  })

  it("acepta el mensaje sin prefijo de tabla y con comillas", () => {
    expect(
      missingColumnName({ code: "42703", message: 'column "driver_id" does not exist' })
    ).toBe("driver_id")
  })

  it("ignora otros códigos de error", () => {
    expect(
      missingColumnName({ code: "PGRST201", message: "more than one relationship" })
    ).toBeNull()
    expect(missingColumnName({ code: "42P01", message: 'relation "orders" does not exist' })).toBeNull()
  })

  it("es tolerante a error ausente o sin mensaje", () => {
    expect(missingColumnName(null)).toBeNull()
    expect(missingColumnName({ code: "42703" })).toBeNull()
  })
})

describe("missingOptionalOrderColumn", () => {
  it("devuelve la columna cuando está en la lista de opcionales", () => {
    for (const column of ADMIN_ORDER_OPTIONAL_COLUMNS) {
      expect(
        missingOptionalOrderColumn({
          code: "42703",
          message: `column orders.${column} does not exist`,
        })
      ).toBe(column)
      expect(isAdminOrderOptionalColumn(column)).toBe(true)
    }
  })

  it("no degrada un error de esquema real (columna obligatoria ausente)", () => {
    // Si falta una columna que el panel necesita siempre, el error debe
    // propagarse en lugar de reintentarse en un bucle silencioso.
    expect(
      missingOptionalOrderColumn({
        code: "42703",
        message: "column orders.customer_phone does not exist",
      })
    ).toBeNull()
  })

  it("ignora errores que no son 42703", () => {
    expect(
      missingOptionalOrderColumn({ code: "PGRST201", message: "more than one relationship" })
    ).toBeNull()
    expect(missingOptionalOrderColumn(null)).toBeNull()
  })
})

/**
 * Regresión del crash de /admin/pedidos: la migración 00009 hizo nullable
 * `orders.user_id` (checkout de invitado), así que el perfil embebido puede
 * venir nulo y `customer_name` quedar vacío. La etiqueta se calculaba con
 * `order.user_id.slice(0, 8)` sin guarda y el TypeError tumbaba toda la
 * sección con el error boundary.
 */
describe("orderCustomerLabel", () => {
  it("prefiere el nombre del perfil", () => {
    expect(orderCustomerLabel({ customer_name: "Ana Pérez", user_id: "abc12345-6789" })).toBe(
      "Ana Pérez"
    )
  })

  it("cae al id corto cuando el pedido tiene usuario pero no nombre", () => {
    expect(orderCustomerLabel({ customer_name: null, user_id: "abc12345-6789" })).toBe(
      "Usuario #abc12345"
    )
  })

  it("no revienta con pedidos de invitado (user_id nulo)", () => {
    expect(orderCustomerLabel({ customer_name: null, user_id: null })).toBe("Invitado")
  })

  it("ignora nombres vacíos en lugar de renderizar una celda en blanco", () => {
    expect(orderCustomerLabel({ customer_name: "", user_id: null })).toBe("Invitado")
    expect(orderCustomerLabel({ customer_name: "", user_id: "abc12345-6789" })).toBe(
      "Usuario #abc12345"
    )
  })
})
