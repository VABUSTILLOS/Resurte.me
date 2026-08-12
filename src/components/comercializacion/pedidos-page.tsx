"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Plus,
  Minus,
  Search,
  Trash2,
  ShoppingCart,
  Package,
} from "lucide-react"
import {
  Button,
  Select,
  Input,
  FieldLabel,
  Badge,
  EmptyState,
  Spinner,
  SectionCard,
} from "./ui"
import { useToast } from "@/components/toast"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { formatDateTime } from "@/lib/comercializacion/dates"
import type { SellerClientSummary, AssistedOrderSummary, ClientAddress, CatalogProduct } from "@/lib/comercializacion/types"

interface CartItem {
  product: CatalogProduct
  quantity: number
}

const PAYMENT_METHODS = [
  { value: "cash_on_delivery", label: "Efectivo contra entrega" },
  { value: "spei", label: "Transferencia (SPEI)" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "card", label: "Tarjeta" },
]

export function PedidosPage({
  clients,
  initialOrders,
}: {
  clients: SellerClientSummary[]
  initialOrders: AssistedOrderSummary[]
}) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const preSelected = searchParams.get("prospecto")

  const [selectedClient, setSelectedClient] = useState<string>("")
  const [addresses, setAddresses] = useState<ClientAddress[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery")
  const [note, setNote] = useState("")

  const [productQuery, setProductQuery] = useState("")
  const [productResults, setProductResults] = useState<CatalogProduct[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])

  const [orders, setOrders] = useState<AssistedOrderSummary[]>(initialOrders)
  const [submitting, setSubmitting] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Pre-selección desde "Hacer pedido" en dashboard/detalle
  useEffect(() => {
    if (!preSelected) return
    const timeout = setTimeout(() => {
      const client = clients.find((c) => c.prospectId === Number(preSelected))
      if (client) setSelectedClient(client.userId)
    }, 0)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelected])

  // Cargar direcciones del cliente seleccionado
  useEffect(() => {
    if (!selectedClient) {
      const timeout = setTimeout(() => {
        setAddresses([])
        setSelectedAddress("")
      }, 0)
      return () => clearTimeout(timeout)
    }
    let cancelled = false
    import("@/lib/comercializacion/actions")
      .then(({ getClientAddresses }) => getClientAddresses(selectedClient))
      .then((res) => {
        if (cancelled) return
        setAddresses(res)
        setSelectedAddress(res.length === 1 ? String(res[0]?.id) : "")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedClient])

  // Búsqueda de productos (debounce)
  useEffect(() => {
    if (!productQuery.trim()) {
      const timeout = setTimeout(() => setProductResults([]), 0)
      return () => clearTimeout(timeout)
    }
    const t = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const { searchCatalogProducts } = await import("@/lib/comercializacion/actions")
        const res = await searchCatalogProducts(productQuery)
        setProductResults(res)
      } catch {
        setProductResults([])
      } finally {
        setSearchingProducts(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [productQuery])

  function addToCart(product: CatalogProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
    setProductQuery("")
    setProductResults([])
  }

  function updateQty(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  function removeFromCart(id: number) {
    setCart((prev) => prev.filter((i) => i.product.id !== id))
  }

  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0)

  async function submitOrder() {
    if (!selectedClient) {
      toast("Selecciona un cliente", "error")
      return
    }
    if (!selectedAddress) {
      toast("Selecciona una dirección de entrega", "error")
      return
    }
    if (cart.length === 0) {
      toast("Agrega al menos un producto", "error")
      return
    }
    const client = clients.find((c) => c.userId === selectedClient)
    setSubmitting(true)
    try {
      const { createAssistedOrder } = await import("@/lib/comercializacion/actions")
      const result = await createAssistedOrder({
        prospectId: client!.prospectId,
        addressId: Number(selectedAddress),
        items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        paymentMethod,
        note: note || undefined,
      })
      toast(`Pedido #${result.orderId} creado 🎉`)
      setCart([])
      setNote("")
      await loadOrders()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al crear el pedido", "error")
    } finally {
      setSubmitting(false)
    }
  }

  async function loadOrders() {
    setLoadingOrders(true)
    try {
      const { getAssistedOrders } = await import("@/lib/comercializacion/actions")
      setOrders(await getAssistedOrders())
    } catch {
    } finally {
      setLoadingOrders(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pedidos asistidos</h1>
        <p className="text-sm text-gray-500">
          Coloca el pedido por tu cliente restaurantero directamente desde aquí.
        </p>
      </div>

      {/* Builder */}
      <SectionCard title="Nuevo pedido para un cliente">
        <div className="space-y-4">
          {/* Cliente + dirección */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Cliente *</FieldLabel>
              <Select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
              >
                <option value="">— Selecciona un cliente —</option>
                {clients.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.prospectName}
                    {c.email ? ` · ${c.email}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Dirección de entrega *</FieldLabel>
              <Select
                value={selectedAddress}
                onChange={(e) => setSelectedAddress(e.target.value)}
                disabled={!selectedClient}
              >
                <option value="">
                  {selectedClient
                    ? addresses.length === 0
                      ? "Sin direcciones guardadas"
                      : "— Selecciona una dirección —"
                    : "Primero selecciona el cliente"}
                </option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.street} {a.number}, {a.neighborhood}, {a.city}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Búsqueda de productos */}
          <div>
            <FieldLabel>Agregar productos</FieldLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Buscar producto del catálogo… (ej. tortilla, carne, jitomate)"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
            </div>
            {productQuery.trim() && !searchingProducts ? (
              productResults.length > 0 ? (
                <ul className="mt-2 divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {productResults.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => addToCart(p)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {p.brand ?? "Catálogo"}
                            {p.unit ? ` · ${p.unit}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[#0E7A0E] shrink-0">
                          {formatMoney(p.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 mt-2">Sin resultados para “{productQuery}”</p>
              )
            ) : null}
          </div>

          {/* Carrito */}
          {cart.length > 0 ? (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <ShoppingCart className="w-4 h-4 text-[#0E7A0E]" />
                <span className="text-xs font-semibold text-gray-700">
                  Carrito · {cart.reduce((s, i) => s + i.quantity, 0)} artículos
                </span>
              </div>
              <ul className="divide-y divide-gray-50">
                {cart.map((i) => (
                  <li key={i.product.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{i.product.name}</p>
                      <p className="text-xs text-gray-400">
                        {formatMoney(i.product.price)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(i.product.id, -1)}
                        className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-semibold w-6 text-center">{i.quantity}</span>
                      <button
                        onClick={() => updateQty(i.product.id, 1)}
                        className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold text-gray-900 w-20 text-right">
                        {formatMoney(i.product.price * i.quantity)}
                      </span>
                      <button
                        onClick={() => removeFromCart(i.product.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-base font-bold text-[#0E7A0E]">{formatMoney(total)}</span>
              </div>
            </div>
          ) : null}

          {/* Pago + nota */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Método de pago</FieldLabel>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Nota para el pedido</FieldLabel>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Entregar antes de las 10 am"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={submitOrder} disabled={submitting} size="lg">
              {submitting ? <Spinner className="!w-4 !h-4 !border-white" /> : <ShoppingCart className="w-4 h-4" />}
              {submitting ? "Creando pedido…" : "Crear pedido"}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Mis pedidos */}
      <SectionCard
        title="Mis pedidos colocados"
        action={
          loadingOrders ? (
            <Spinner className="!w-4 !h-4" />
          ) : (
            <Badge color="gray">{orders.length}</Badge>
          )
        }
      >
        {orders.length === 0 ? (
          <EmptyState
            title="Aún no has colocado pedidos"
            subtitle="Usa el formulario de arriba para hacer el primer pedido asistido."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {orders.map((o) => (
              <li key={o.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                    <Package className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      Pedido #{o.id}
                      <span className="text-gray-400 font-normal"> · {o.client_name}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {o.item_count} artículos · {formatDateTime(o.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {o.payment_status === "paid" ? (
                    <Badge color="green">Pagado</Badge>
                  ) : o.status === "cancelled" ? (
                    <Badge color="red">Cancelado</Badge>
                  ) : (
                    <Badge color="amber">Pendiente de pago</Badge>
                  )}
                  <span className="text-sm font-bold text-gray-900">{formatMoney(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
