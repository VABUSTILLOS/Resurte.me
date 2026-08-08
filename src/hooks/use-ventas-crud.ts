"use client"

import { useState } from "react"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { uid } from "@/lib/ids"
import type {
  Cliente,
  Mesa,
  Empleado,
  EmpleadoHoy,
  Fichaje,
  TarjetaRegalo,
} from "@/components/panel/ventas/ventas-shared"

type StorageSetter<T> = (value: T | ((prev: T) => T)) => void

// ── Clientes ─────────────────────────────────────────────

export interface ClientesCrud {
  clientes: Cliente[]
  setClientes: StorageSetter<Cliente[]>
  showClientes: boolean
  clienteName: string
  clientePhone: string
  clientePts: string
  clienteEditId: string | null
  clienteDeleteId: string | null
  onToggle: () => void
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onPtsChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onEdit: (c: Cliente) => void
  onDeleteClick: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

export function useClientesCrud(slug: string | null): ClientesCrud {
  const { toast } = useToast()
  const [clientes, setClientes] = useLocalStorage<Cliente[]>("clientes", [], slug)
  const [showClientes, setShowClientes] = useState(false)
  const [clienteName, setClienteName] = useState("")
  const [clientePhone, setClientePhone] = useState("")
  const [clientePts, setClientePts] = useState("")
  const [clienteEditId, setClienteEditId] = useState<string | null>(null)
  const [clienteDeleteId, setClienteDeleteId] = useState<string | null>(null)

  const saveCliente = () => {
    const name = clienteName.trim()
    if (!name) {
      toast("Escribe el nombre del cliente", "warning")
      return
    }
    const pts = Math.max(0, clientePts ? parseInt(clientePts) || 0 : 0)
    if (clienteEditId) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === clienteEditId
            ? { ...c, nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts }
            : c,
        ),
      )
      toast("Cliente actualizado", "success")
    } else {
      setClientes((prev) => [
        ...prev,
        { id: uid("cliente"), nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts, visitas: 0, totalGastado: 0, createdAt: new Date().toISOString() },
      ])
      toast("Cliente agregado", "success")
    }
    setClienteName("")
    setClientePhone("")
    setClientePts("")
    setClienteEditId(null)
  }

  const startEditCliente = (c: Cliente) => {
    setClienteEditId(c.id)
    setClienteName(c.nombre)
    setClientePhone(c.telefono || "")
    setClientePts(String(c.puntos))
  }

  const confirmDeleteCliente = () => {
    if (!clienteDeleteId) return
    setClientes((prev) => prev.filter((c) => c.id !== clienteDeleteId))
    setClienteDeleteId(null)
    toast("Cliente eliminado", "warning")
  }

  return {
    clientes,
    setClientes,
    showClientes,
    clienteName,
    clientePhone,
    clientePts,
    clienteEditId,
    clienteDeleteId,
    onToggle: () => setShowClientes(!showClientes),
    onNameChange: setClienteName,
    onPhoneChange: setClientePhone,
    onPtsChange: setClientePts,
    onSave: saveCliente,
    onCancel: () => {
      setClienteEditId(null)
      setClienteName("")
      setClientePhone("")
      setClientePts("")
    },
    onEdit: startEditCliente,
    onDeleteClick: (id) => setClienteDeleteId(id),
    onCancelDelete: () => setClienteDeleteId(null),
    onConfirmDelete: confirmDeleteCliente,
  }
}

// ── Mesas ────────────────────────────────────────────────

export interface MesasCrud {
  mesas: Mesa[]
  showMesas: boolean
  mesaName: string
  mesaCapacidad: string
  mesaZona: string
  mesaEditId: string | null
  mesaDeleteId: string | null
  onToggle: () => void
  onNameChange: (v: string) => void
  onCapacidadChange: (v: string) => void
  onZonaChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onEdit: (m: Mesa) => void
  onDeleteClick: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

export function useMesasCrud(slug: string | null): MesasCrud {
  const { toast } = useToast()
  const [mesas, setMesas] = useLocalStorage<Mesa[]>("mesas", [], slug)
  const [showMesas, setShowMesas] = useState(false)
  const [mesaName, setMesaName] = useState("")
  const [mesaCapacidad, setMesaCapacidad] = useState("")
  const [mesaZona, setMesaZona] = useState("")
  const [mesaEditId, setMesaEditId] = useState<string | null>(null)
  const [mesaDeleteId, setMesaDeleteId] = useState<string | null>(null)

  const saveMesa = () => {
    const nombre = mesaName.trim()
    if (!nombre) {
      toast("Escribe el nombre de la mesa", "warning")
      return
    }
    const capacidad = Math.max(1, mesaCapacidad ? parseInt(mesaCapacidad) || 1 : 1)
    if (mesaEditId) {
      setMesas((prev) =>
        prev.map((m) => (m.id === mesaEditId ? { ...m, nombre, capacidad, zona: mesaZona.trim() || undefined } : m)),
      )
      toast("Mesa actualizada", "success")
    } else {
      setMesas((prev) => [...prev, { id: uid("mesa"), nombre, capacidad, zona: mesaZona.trim() || undefined }])
      toast("Mesa agregada", "success")
    }
    setMesaName("")
    setMesaCapacidad("")
    setMesaZona("")
    setMesaEditId(null)
  }

  const startEditMesa = (m: Mesa) => {
    setMesaEditId(m.id)
    setMesaName(m.nombre)
    setMesaCapacidad(String(m.capacidad))
    setMesaZona(m.zona || "")
  }

  const confirmDeleteMesa = () => {
    if (!mesaDeleteId) return
    setMesas((prev) => prev.filter((m) => m.id !== mesaDeleteId))
    setMesaDeleteId(null)
    toast("Mesa eliminada", "warning")
  }

  return {
    mesas,
    showMesas,
    mesaName,
    mesaCapacidad,
    mesaZona,
    mesaEditId,
    mesaDeleteId,
    onToggle: () => setShowMesas(!showMesas),
    onNameChange: setMesaName,
    onCapacidadChange: setMesaCapacidad,
    onZonaChange: setMesaZona,
    onSave: saveMesa,
    onCancel: () => {
      setMesaEditId(null)
      setMesaName("")
      setMesaCapacidad("")
      setMesaZona("")
    },
    onEdit: startEditMesa,
    onDeleteClick: (id) => setMesaDeleteId(id),
    onCancelDelete: () => setMesaDeleteId(null),
    onConfirmDelete: confirmDeleteMesa,
  }
}

// ── Empleados + fichajes ─────────────────────────────────

export interface EmpleadosCrud {
  empleados: Empleado[]
  fichajes: Fichaje[]
  showReloj: boolean
  empNombre: string
  empRol: string
  empTarifa: string
  empEditId: string | null
  empDeleteId: string | null
  onToggle: () => void
  onNombreChange: (v: string) => void
  onRolChange: (v: string) => void
  onTarifaChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onFicharEntrada: (id: string) => void
  onFicharSalida: (id: string) => void
  onEdit: (e: EmpleadoHoy) => void
  onDeleteClick: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

export function useEmpleadosCrud(slug: string | null): EmpleadosCrud {
  const { toast } = useToast()
  const [empleados, setEmpleados] = useLocalStorage<Empleado[]>("reloj-empleados", [], slug)
  const [fichajes, setFichajes] = useLocalStorage<Fichaje[]>("reloj-fichajes", [], slug)
  const [showReloj, setShowReloj] = useState(false)
  const [empNombre, setEmpNombre] = useState("")
  const [empRol, setEmpRol] = useState("")
  const [empTarifa, setEmpTarifa] = useState("")
  const [empEditId, setEmpEditId] = useState<string | null>(null)
  const [empDeleteId, setEmpDeleteId] = useState<string | null>(null)

  const saveEmpleado = () => {
    const nombre = empNombre.trim()
    const tarifa = parseFloat(empTarifa)
    if (!nombre || Number.isNaN(tarifa) || tarifa < 0) {
      toast("Completa nombre y tarifa válida", "warning")
      return
    }
    setEmpleados((prev) => {
      const id = empEditId || uid("empleado")
      const exists = prev.some((e) => e.id === id)
      const nuevo: Empleado = { id, nombre, rol: empRol.trim() || undefined, tarifa }
      return exists ? prev.map((e) => (e.id === id ? nuevo : e)) : [...prev, nuevo]
    })
    setEmpNombre("")
    setEmpRol("")
    setEmpTarifa("")
    setEmpEditId(null)
    toast(empEditId ? "Empleado actualizado" : "Empleado agregado", "success")
  }

  const ficharEntrada = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (open) {
      toast("Ya tiene un fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => [...prev, { id: uid("fichaje"), empleadoId, entrada: new Date().toISOString() }])
    toast("Entrada registrada", "success")
  }

  const ficharSalida = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (!open) {
      toast("No hay fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => prev.map((f) => (f.id === open.id ? { ...f, salida: new Date().toISOString() } : f)))
    toast("Salida registrada", "success")
  }

  const confirmDeleteEmpleado = () => {
    if (!empDeleteId) return
    setEmpleados((prev) => prev.filter((e) => e.id !== empDeleteId))
    setEmpDeleteId(null)
    toast("Empleado eliminado", "warning")
  }

  return {
    empleados,
    fichajes,
    showReloj,
    empNombre,
    empRol,
    empTarifa,
    empEditId,
    empDeleteId,
    onToggle: () => setShowReloj(!showReloj),
    onNombreChange: setEmpNombre,
    onRolChange: setEmpRol,
    onTarifaChange: setEmpTarifa,
    onSave: saveEmpleado,
    onCancel: () => {
      setEmpEditId(null)
      setEmpNombre("")
      setEmpRol("")
      setEmpTarifa("")
    },
    onFicharEntrada: ficharEntrada,
    onFicharSalida: ficharSalida,
    onEdit: (e) => {
      setEmpEditId(e.id)
      setEmpNombre(e.nombre)
      setEmpRol(e.rol || "")
      setEmpTarifa(String(e.tarifa))
    },
    onDeleteClick: (id) => setEmpDeleteId(id),
    onCancelDelete: () => setEmpDeleteId(null),
    onConfirmDelete: confirmDeleteEmpleado,
  }
}

// ── Tarjetas de regalo ───────────────────────────────────

export interface TarjetasCrud {
  tarjetas: TarjetaRegalo[]
  setTarjetas: StorageSetter<TarjetaRegalo[]>
  showTarjetas: boolean
  tarjetaMonto: string
  onToggle: () => void
  onMontoChange: (v: string) => void
  onEmitir: () => void
  onCopyCodigo: (codigo: string) => void
}

export function useTarjetasCrud(slug: string | null): TarjetasCrud {
  const { toast } = useToast()
  const [tarjetas, setTarjetas] = useLocalStorage<TarjetaRegalo[]>("tarjetas-regalo", [], slug)
  const [showTarjetas, setShowTarjetas] = useState(false)
  const [tarjetaMonto, setTarjetaMonto] = useState("")

  const emitirTarjeta = () => {
    const monto = parseFloat(tarjetaMonto)
    if (Number.isNaN(monto) || monto <= 0) {
      toast("Ingresa un monto válido", "warning")
      return
    }
    const code = `RT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    setTarjetas((prev) => [...prev, { id: uid("tarjeta"), codigo: code, monto, saldo: monto, estado: "activa", creada: new Date().toISOString() }])
    setTarjetaMonto("")
    toast(`Tarjeta ${code} emitida con $${monto.toFixed(0)}`, "success")
  }

  const copyCodigoTarjeta = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    toast("Código copiado", "success")
  }

  return {
    tarjetas,
    setTarjetas,
    showTarjetas,
    tarjetaMonto,
    onToggle: () => setShowTarjetas(!showTarjetas),
    onMontoChange: setTarjetaMonto,
    onEmitir: emitirTarjeta,
    onCopyCodigo: copyCodigoTarjeta,
  }
}
