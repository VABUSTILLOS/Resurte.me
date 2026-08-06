"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import {
  ClipboardCheck, ArrowLeft, CheckCircle2, Circle, DollarSign,
  Package, Store, CalendarClock, Printer,
} from "lucide-react"

interface ChecklistItem {
  id: string
  label: string
  phase: string
}

const PHASES = [
  "Planeación", "Legal y permisos", "Local e instalaciones",
  "Equipamiento", "Proveeduría", "Personal", "Soft opening",
]

// Checklist items specific to collection type
const COLLECTION_CHECKLISTS: Record<string, ChecklistItem[]> = {
  "hamburguesas-hot-dogs": [
    { id: "h1", label: "Definir concepto: gourmet, smash, fast casual", phase: "Planeación" },
    { id: "h2", label: "Seleccionar ubicación con alto tráfico peatonal", phase: "Local e instalaciones" },
    { id: "h3", label: "Plancha y freidora industrial", phase: "Equipamiento" },
    { id: "h4", label: "Congelador para carne y papas", phase: "Equipamiento" },
    { id: "h5", label: "Primer pedido: carne molida, pan, queso, papas", phase: "Proveeduría" },
    { id: "h6", label: "Diseñar menú base (3-5 burgers, hot dogs, acompañamientos)", phase: "Planeación" },
  ],
  "taquerias-antojitos": [
    { id: "t1", label: "Definir especialidad: asada, pastor, suadero, mixto", phase: "Planeación" },
    { id: "t2", label: "Trompo para pastor y plancha para asada", phase: "Equipamiento" },
    { id: "t3", label: "Mesa de trabajo de acero inoxidable", phase: "Equipamiento" },
    { id: "t4", label: "Primer pedido: carne, tortillas, verdura, salsas", phase: "Proveeduría" },
    { id: "t5", label: "Tramitar permiso de uso de suelo (puesto o local)", phase: "Legal y permisos" },
    { id: "t6", label: "Contratar taquero y ayudante", phase: "Personal" },
  ],
  "pizzas-comida-italiana": [
    { id: "p1", label: "Definir estilo: napolitana, neoyorquina, al molde", phase: "Planeación" },
    { id: "p2", label: "Horno de piedra o de convección para pizza", phase: "Equipamiento" },
    { id: "p3", label: "Batidora industrial para masa", phase: "Equipamiento" },
    { id: "p4", label: "Cámara de fermentación o espacio refrigerado", phase: "Equipamiento" },
    { id: "p5", label: "Primer pedido: harina, mozzarella, pepperoni, salsa", phase: "Proveeduría" },
    { id: "p6", label: "Cajas para delivery y bolsas térmicas", phase: "Equipamiento" },
  ],
  "comida-mexicana-corrida": [
    { id: "c1", label: "Definir menú rotativo (5-7 guisados)", phase: "Planeación" },
    { id: "c2", label: "Estufa industrial 4-6 quemadores", phase: "Equipamiento" },
    { id: "c3", label: "Ollas grandes, cazos y utensilios", phase: "Equipamiento" },
    { id: "c4", label: "Primer pedido: carnes, verdura, arroz, frijol, tortillas", phase: "Proveeduría" },
    { id: "c5", label: "Contenedores para comida para llevar", phase: "Proveeduría" },
  ],
  "sushi-comida-asiatica": [
    { id: "s1", label: "Definir concepto: tradicional, fusión, rolls", phase: "Planeación" },
    { id: "s2", label: "Proveedor de pescado grado sushi certificado", phase: "Proveeduría" },
    { id: "s3", label: "Arrocera industrial y refrigeración de precisión", phase: "Equipamiento" },
    { id: "s4", label: "Capacitación en manejo de pescado crudo", phase: "Personal" },
    { id: "s5", label: "Primer pedido: salmón, arroz, alga, soya, wasabi", phase: "Proveeduría" },
    { id: "s6", label: "Tramitar certificado de manejo de alimentos", phase: "Legal y permisos" },
  ],
  "cortes-carne-asaderos": [
    { id: "a1", label: "Definir carta de cortes y proveedor de carne", phase: "Planeación" },
    { id: "a2", label: "Parrilla de carbón o gas industrial", phase: "Equipamiento" },
    { id: "a3", label: "Cámara de maduración o refrigerador de carnes", phase: "Equipamiento" },
    { id: "a4", label: "Primer pedido: ribeye, arrachera, chorizo, guarniciones", phase: "Proveeduría" },
    { id: "a5", label: "Contratar parrillero experimentado", phase: "Personal" },
    { id: "a6", label: "Sistema de extracción de humo profesional", phase: "Local e instalaciones" },
  ],
  "pollo-alitas": [
    { id: "al1", label: "Definir concepto: alitas, boneless, o mixto", phase: "Planeación" },
    { id: "al2", label: "Freidora industrial doble canasta", phase: "Equipamiento" },
    { id: "al3", label: "Mesas de trabajo y campana extractora", phase: "Equipamiento" },
    { id: "al4", label: "Primer pedido: alitas, boneless, salsas, aderezos", phase: "Proveeduría" },
    { id: "al5", label: "Diseñar carta de salsas (5+ variedades)", phase: "Planeación" },
  ],
  "mariscos-pescados": [
    { id: "m1", label: "Definir especialidad: ceviches, filetes, tacos, cocteles", phase: "Planeación" },
    { id: "m2", label: "Refrigeradores y congeladores de alta capacidad", phase: "Equipamiento" },
    { id: "m3", label: "Proveedor de mariscos frescos certificado", phase: "Proveeduría" },
    { id: "m4", label: "Estación de limpieza con hielo", phase: "Equipamiento" },
    { id: "m5", label: "Primer pedido: camarón, pescado, pulpo, verdura, limón", phase: "Proveeduría" },
    { id: "m6", label: "Tramitar permiso sanitario para mariscos", phase: "Legal y permisos" },
  ],
  "cafeterias-crepas-desayunos": [
    { id: "cf1", label: "Definir concepto: cafetería de especialidad, desayunos, crepas", phase: "Planeación" },
    { id: "cf2", label: "Máquina de espresso profesional y molino", phase: "Equipamiento" },
    { id: "cf3", label: "Plancha para crepas y wafflera", phase: "Equipamiento" },
    { id: "cf4", label: "Primer pedido: café, harina, huevo, lácteos, Nutella", phase: "Proveeduría" },
    { id: "cf5", label: "Diseñar menú de desayunos y bebidas calientes", phase: "Planeación" },
    { id: "cf6", label: "Mobiliario acogedor (mesas, sillas, decoración)", phase: "Local e instalaciones" },
  ],
  "saludable-ensaladas-pokes": [
    { id: "sp1", label: "Definir concepto: pokes, ensaladas, bowls, wraps", phase: "Planeación" },
    { id: "sp2", label: "Refrigerador de exhibición para ingredientes frescos", phase: "Equipamiento" },
    { id: "sp3", label: "Estación de preparación con tabla de corte", phase: "Equipamiento" },
    { id: "sp4", label: "Primer pedido: pescado, quinoa, lechugas, aderezos", phase: "Proveeduría" },
    { id: "sp5", label: "Contenedores ecológicos para delivery", phase: "Proveeduría" },
    { id: "sp6", label: "Alianzas con apps de comida saludable", phase: "Soft opening" },
  ],
  "postres-panaderia-helados": [
    { id: "pp1", label: "Definir especialidad: pasteles, panadería, helados", phase: "Planeación" },
    { id: "pp2", label: "Horno de convección y batidora industrial", phase: "Equipamiento" },
    { id: "pp3", label: "Vitrina refrigerada para exhibición", phase: "Equipamiento" },
    { id: "pp4", label: "Primer pedido: harina, mantequilla, chocolate, crema", phase: "Proveeduría" },
    { id: "pp5", label: "Empaque atractivo y cajas para pasteles", phase: "Proveeduría" },
    { id: "pp6", label: "Degustación de apertura (invitar vecinos)", phase: "Soft opening" },
  ],
  "comida-arabe-griega": [
    { id: "ag1", label: "Definir concepto: shawarma, falafel, gyros", phase: "Planeación" },
    { id: "ag2", label: "Trompo vertical para shawarma", phase: "Equipamiento" },
    { id: "ag3", label: "Plancha o parrilla para carnes", phase: "Equipamiento" },
    { id: "ag4", label: "Primer pedido: cordero, pollo, garbanzo, tahini, pan pita", phase: "Proveeduría" },
    { id: "ag5", label: "Capacitación en preparación de salsas (tahini, tzatziki)", phase: "Personal" },
    { id: "ag6", label: "Mobiliario estilo rústico-mediterráneo", phase: "Local e instalaciones" },
  ],
  "comida-venezolana-latina": [
    { id: "cv1", label: "Definir especialidad: arepas, cachapas, pabellón", phase: "Planeación" },
    { id: "cv2", label: "Plancha grande para arepas y parrilla", phase: "Equipamiento" },
    { id: "cv3", label: "Freidora para tequeños y empanadas", phase: "Equipamiento" },
    { id: "cv4", label: "Primer pedido: Harina P.A.N., carne, queso, plátano, frijol", phase: "Proveeduría" },
    { id: "cv5", label: "Diseñar menú con bandera de Venezuela (opciones visuales)", phase: "Planeación" },
    { id: "cv6", label: "Estrategia de redes sociales para comunidad latina", phase: "Soft opening" },
  ],
  "bebidas-bares-botanas": [
    { id: "bb1", label: "Definir concepto: bar deportivo, cantina, speakeasy", phase: "Planeación" },
    { id: "bb2", label: "Barra equipada y sistema de refrigeración de bebidas", phase: "Equipamiento" },
    { id: "bb3", label: "Tramitar licencia de venta de alcohol", phase: "Legal y permisos" },
    { id: "bb4", label: "Primer pedido: botanas, cacahuates, cueritos, limones", phase: "Proveeduría" },
    { id: "bb5", label: "Diseñar carta de cocteles y cervezas", phase: "Planeación" },
    { id: "bb6", label: "Sistema de sonido y pantallas", phase: "Equipamiento" },
  ],
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "d1", label: "Definir concepto y propuesta de valor", phase: "Planeación" },
  { id: "d2", label: "Elaborar plan de negocio básico", phase: "Planeación" },
  { id: "d3", label: "Tramitar licencia de funcionamiento", phase: "Legal y permisos" },
  { id: "d4", label: "Seleccionar y acondicionar local", phase: "Local e instalaciones" },
  { id: "d5", label: "Adquirir equipamiento de cocina", phase: "Equipamiento" },
  { id: "d6", label: "Registrarse en Resurte.me como proveedor principal", phase: "Proveeduría" },
  { id: "d7", label: "Hacer primer pedido de insumos", phase: "Proveeduría" },
  { id: "d8", label: "Contratar personal clave", phase: "Personal" },
  { id: "d9", label: "Realizar soft opening con amigos y familia", phase: "Soft opening" },
]

const INVESTMENT_TEMPLATES: Record<string, { item: string; low: number; high: number }[]> = {
  "hamburguesas-hot-dogs": [
    { item: "Plancha y freidora", low: 30000, high: 80000 },
    { item: "Congelador industrial", low: 15000, high: 35000 },
    { item: "Mobiliario (mesas, sillas, barra)", low: 20000, high: 60000 },
    { item: "Renta y depósito (primer mes)", low: 15000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
    { item: "Licencias y permisos", low: 5000, high: 15000 },
    { item: "Branding y menús", low: 5000, high: 15000 },
    { item: "Capital de trabajo (3 meses)", low: 30000, high: 80000 },
  ],
  "taquerias-antojitos": [
    { item: "Plancha y trompo", low: 20000, high: 60000 },
    { item: "Refrigerador industrial", low: 12000, high: 25000 },
    { item: "Puesto/carreta o local", low: 8000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 6000, high: 15000 },
    { item: "Licencias y permisos", low: 3000, high: 10000 },
    { item: "Utensilios y desechables", low: 3000, high: 8000 },
    { item: "Capital de trabajo (3 meses)", low: 20000, high: 50000 },
  ],
  "pizzas-comida-italiana": [
    { item: "Horno para pizza", low: 40000, high: 120000 },
    { item: "Batidora industrial", low: 25000, high: 60000 },
    { item: "Cámara de fermentación", low: 15000, high: 40000 },
    { item: "Mobiliario", low: 20000, high: 50000 },
    { item: "Renta y depósito", low: 15000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 10000, high: 25000 },
    { item: "Cajas y empaque para delivery", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 40000, high: 90000 },
  ],
  "comida-mexicana-corrida": [
    { item: "Estufa industrial", low: 15000, high: 40000 },
    { item: "Refrigerador y congelador", low: 15000, high: 35000 },
    { item: "Ollas, cazos y utensilios", low: 8000, high: 20000 },
    { item: "Mobiliario (mesas, sillas)", low: 10000, high: 30000 },
    { item: "Renta y depósito", low: 8000, high: 25000 },
    { item: "Insumos iniciales (Resurte.me)", low: 7000, high: 18000 },
    { item: "Licencias", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 60000 },
  ],
  "sushi-comida-asiatica": [
    { item: "Arrocera industrial", low: 8000, high: 20000 },
    { item: "Refrigerador de precisión", low: 20000, high: 50000 },
    { item: "Vitrina exhibidora de pescado", low: 15000, high: 35000 },
    { item: "Mobiliario estilo japonés", low: 25000, high: 70000 },
    { item: "Renta y depósito", low: 15000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 15000, high: 35000 },
    { item: "Licencias y certificaciones", low: 8000, high: 20000 },
    { item: "Capital de trabajo (3 meses)", low: 40000, high: 100000 },
  ],
  "cortes-carne-asaderos": [
    { item: "Parrilla industrial", low: 25000, high: 80000 },
    { item: "Cámara de maduración", low: 30000, high: 80000 },
    { item: "Sistema de extracción", low: 15000, high: 40000 },
    { item: "Mobiliario rústico", low: 20000, high: 50000 },
    { item: "Renta y depósito", low: 15000, high: 45000 },
    { item: "Insumos iniciales (Resurte.me)", low: 15000, high: 35000 },
    { item: "Vajilla y cristalería", low: 8000, high: 18000 },
    { item: "Capital de trabajo (3 meses)", low: 50000, high: 120000 },
  ],
  "pollo-alitas": [
    { item: "Freidora industrial doble", low: 15000, high: 40000 },
    { item: "Campana extractora", low: 8000, high: 25000 },
    { item: "Congelador industrial", low: 10000, high: 25000 },
    { item: "Mobiliario básico", low: 8000, high: 20000 },
    { item: "Renta y depósito", low: 8000, high: 25000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 18000 },
    { item: "Empaque para delivery", low: 3000, high: 8000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 60000 },
  ],
  "mariscos-pescados": [
    { item: "Congeladores industriales", low: 20000, high: 50000 },
    { item: "Mesa de trabajo con hielo", low: 8000, high: 25000 },
    { item: "Estufa y freidora", low: 15000, high: 40000 },
    { item: "Mobiliario costero", low: 15000, high: 40000 },
    { item: "Renta y depósito", low: 12000, high: 35000 },
    { item: "Insumos iniciales (Resurte.me)", low: 15000, high: 35000 },
    { item: "Permisos sanitarios", low: 8000, high: 25000 },
    { item: "Capital de trabajo (3 meses)", low: 40000, high: 100000 },
  ],
  "cafeterias-crepas-desayunos": [
    { item: "Máquina espresso y molino", low: 30000, high: 80000 },
    { item: "Plancha y wafflera", low: 5000, high: 15000 },
    { item: "Refrigerador y vitrina", low: 15000, high: 35000 },
    { item: "Mobiliario acogedor", low: 20000, high: 50000 },
    { item: "Renta y depósito", low: 10000, high: 30000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
    { item: "Vajilla y tazas", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 30000, high: 70000 },
  ],
  "saludable-ensaladas-pokes": [
    { item: "Refrigerador de exhibición", low: 20000, high: 45000 },
    { item: "Estación de prep", low: 5000, high: 15000 },
    { item: "Equipo de cocina ligero", low: 10000, high: 25000 },
    { item: "Mobiliario minimalista", low: 10000, high: 30000 },
    { item: "Renta y depósito", low: 8000, high: 25000 },
    { item: "Insumos iniciales (Resurte.me)", low: 10000, high: 25000 },
    { item: "Empaque ecológico", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 60000 },
  ],
  "postres-panaderia-helados": [
    { item: "Horno de convección", low: 25000, high: 60000 },
    { item: "Batidora industrial", low: 20000, high: 50000 },
    { item: "Vitrina refrigerada", low: 15000, high: 35000 },
    { item: "Mobiliario dulce", low: 15000, high: 35000 },
    { item: "Renta y depósito", low: 10000, high: 30000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
    { item: "Empaque y cajas", low: 5000, high: 15000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 60000 },
  ],
  "comida-arabe-griega": [
    { item: "Trompo vertical para shawarma", low: 15000, high: 40000 },
    { item: "Plancha/parrilla", low: 10000, high: 30000 },
    { item: "Refrigeración", low: 12000, high: 25000 },
    { item: "Mobiliario mediterráneo", low: 15000, high: 40000 },
    { item: "Renta y depósito", low: 10000, high: 30000 },
    { item: "Insumos iniciales (Resurte.me)", low: 10000, high: 25000 },
    { item: "Vajilla artesanal", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 30000, high: 70000 },
  ],
  "comida-venezolana-latina": [
    { item: "Plancha para arepas", low: 8000, high: 20000 },
    { item: "Freidora y parrilla", low: 10000, high: 25000 },
    { item: "Refrigeración", low: 10000, high: 20000 },
    { item: "Mobiliario colorido", low: 12000, high: 30000 },
    { item: "Renta y depósito", low: 8000, high: 25000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 18000 },
    { item: "Decoración temática", low: 5000, high: 15000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 55000 },
  ],
  "bebidas-bares-botanas": [
    { item: "Barra equipada", low: 20000, high: 60000 },
    { item: "Sistema de refrigeración", low: 15000, high: 40000 },
    { item: "Equipo de sonido y pantallas", low: 15000, high: 50000 },
    { item: "Mobiliario de bar", low: 15000, high: 40000 },
    { item: "Renta y depósito", low: 12000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
    { item: "Licencia de alcohol", low: 15000, high: 50000 },
    { item: "Capital de trabajo (3 meses)", low: 40000, high: 100000 },
  ],
}

const DEFAULT_INVESTMENT = [
  { item: "Equipamiento de cocina", low: 30000, high: 100000 },
  { item: "Mobiliario y adecuaciones", low: 20000, high: 60000 },
  { item: "Renta y depósito", low: 10000, high: 40000 },
  { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
  { item: "Licencias y permisos", low: 5000, high: 15000 },
  { item: "Capital de trabajo (3 meses)", low: 30000, high: 80000 },
]

export default function AperturaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [checked, setChecked] = useLocalStorage<string[]>("apertura-checked", [], slug)
  const [showCalculator, setShowCalculator] = useState(false)
  const [phaseDates, setPhaseDates] = useLocalStorage<Record<string, string>>("apertura-dates", {}, slug)
  const [customItems, setCustomItems] = useLocalStorage<{ name: string; low: number; high: number }[]>("apertura-custom", [], slug)
  const [newCustomName, setNewCustomName] = useState("")
  const [newCustomLow, setNewCustomLow] = useState("")
  const [newCustomHigh, setNewCustomHigh] = useState("")

  const checkedSet = new Set(checked)

  const checklist = selectedCollection
    ? (COLLECTION_CHECKLISTS[selectedCollection.slug] || DEFAULT_CHECKLIST)
    : DEFAULT_CHECKLIST

  const investment = selectedCollection
    ? (INVESTMENT_TEMPLATES[selectedCollection.slug] || DEFAULT_INVESTMENT)
    : DEFAULT_INVESTMENT

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      if (arr.includes(id)) {
        toast("Elemento desmarcado", "warning")
        return arr.filter((i) => i !== id)
      }
      toast("Elemento marcado como listo", "success")
      return [...arr, id]
    })
  }

  function setPhaseDate(phase: string, date: string) {
    setPhaseDates((prev) => ({ ...prev, [phase]: date }))
  }

  const completedCount = checklist.filter((c) => checkedSet.has(c.id)).length
  const progress = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0
  const invLow = investment.reduce((s, i) => s + i.low, 0) + customItems.reduce((s, i) => s + i.low, 0)
  const invHigh = investment.reduce((s, i) => s + i.high, 0) + customItems.reduce((s, i) => s + i.high, 0)

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para recibir un checklist y calculadora de inversión personalizados.
        </p>
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-avoid-break { break-inside: avoid; }
        }
      `}</style>
      <div className="flex items-center gap-4 mb-6 print:hidden">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Kit de apertura</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-2 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-2 rounded-xl transition-colors"
          aria-label="Imprimir kit de apertura"
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Progreso de apertura</h3>
          </div>
          <span className="text-sm font-bold text-indigo-600">
            {completedCount}/{checklist.length}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-[#108910] h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {progress >= 80 ? "¡Casi listo para abrir!" :
           progress >= 50 ? "Vas por buen camino." :
           progress > 0 ? "Continúa con los siguientes pasos." :
           "Marca los pasos conforme los completes."}
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-4 mb-6">
        {PHASES.map((phase) => {
          const items = checklist.filter((c) => c.phase === phase)
          if (items.length === 0) return null
          const phaseComplete = items.every((c) => checkedSet.has(c.id))
          const phaseDate = phaseDates[phase] || ""
          return (
          <div key={phase} className="bg-white rounded-2xl border border-gray-100 overflow-hidden print-avoid-break">
            <div className={`px-5 py-3 flex items-center gap-2 border-b ${phaseComplete ? "bg-green-50 border-green-100" : "border-gray-50"}`}>
              {phaseComplete
                ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                : <Circle className="w-4 h-4 text-gray-300" />
              }
              <h4 className="font-semibold text-sm text-gray-700">{phase}</h4>
              <span className="text-xs text-gray-400 ml-auto">
                {items.filter((c) => checkedSet.has(c.id)).length}/{items.length}
              </span>
            </div>
            {/* Phase date estimate */}
            <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-50 print-hidden">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="date"
                  value={phaseDate}
                  onChange={(e) => setPhaseDate(phase, e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#108910] bg-white"
                />
                <span className="text-xs text-gray-400">Fecha objetivo</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  {checkedSet.has(item.id)
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    : <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                  }
                  <span className={`text-sm ${checkedSet.has(item.id) ? "text-gray-500 line-through" : "text-gray-700"}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
            </div>
          )
        })}
      </div>

      {/* Investment calculator */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6 print-avoid-break">
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors print-hidden"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Calculadora de inversión inicial</h3>
          </div>
          <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full">
            ${invLow.toLocaleString()} – ${invHigh.toLocaleString()}
          </span>
        </button>

        {showCalculator && (
          <div className="border-t border-gray-100 p-5">
            <div className="space-y-3 mb-4">
              {investment.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.item}</span>
                  <span className="text-sm font-mono font-semibold text-gray-900">
                    ${item.low.toLocaleString()} – ${item.high.toLocaleString()}
                  </span>
                </div>
              ))}
              {/* Custom items */}
              {customItems.map((item, idx) => (
                <div key={`custom-${idx}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{item.name}</span>
                    <button
                      onClick={() => setCustomItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-[10px] text-red-400 hover:text-red-600"
                      aria-label={`Eliminar rubro ${item.name}`}
                    >
                      eliminar
                    </button>
                  </div>
                  <span className="text-sm font-mono font-semibold text-indigo-600">
                    ${item.low.toLocaleString()} – ${item.high.toLocaleString()}
                  </span>
                </div>
              ))}
              {/* Add custom item form */}
              <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  placeholder="Nombre del rubro"
                  value={newCustomName}
                  onChange={(e) => setNewCustomName(e.target.value)}
                  className="flex-1 min-w-[120px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#108910]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Min $"
                  value={newCustomLow}
                  onChange={(e) => setNewCustomLow(e.target.value)}
                  className="w-20 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#108910]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Max $"
                  value={newCustomHigh}
                  onChange={(e) => setNewCustomHigh(e.target.value)}
                  className="w-20 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#108910]"
                />
                <button
                  onClick={() => {
                    if (!newCustomName || !newCustomLow || !newCustomHigh) return
                    const low = parseFloat(newCustomLow)
                    const high = parseFloat(newCustomHigh)
                    if (low < 0 || high < 0 || high < low) {
                      toast("Verifica los montos (sin negativos y máximo ≥ mínimo)", "error")
                      return
                    }
                    if (customItems.length >= 20) {
                      toast("Máximo 20 rubros personalizados", "error")
                      return
                    }
                    if (customItems.some((i) => i.name.toLowerCase() === newCustomName.trim().toLowerCase())) {
                      toast("Ese rubro ya existe", "error")
                      return
                    }
                    setCustomItems((prev) => [...prev, {
                      name: newCustomName,
                      low,
                      high,
                    }])
                    setNewCustomName(""); setNewCustomLow(""); setNewCustomHigh("")
                    toast("Rubro de inversión agregado", "success")
                  }}
                  className="text-xs font-semibold bg-[#108910] text-white px-3 py-1.5 rounded-lg hover:bg-[#0D720D] transition-colors"
                >
                  Agregar
                </button>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-bold text-gray-900">Total estimado</span>
              <span className="font-bold text-[#108910]">
                ${invLow.toLocaleString()} – ${invHigh.toLocaleString()} MXN
              </span>
            </div>
          </div>
        )}
      </div>

      {/* First order CTA */}
      <div className="bg-gradient-to-r from-indigo-50 to-[#F0FDF4] rounded-2xl border border-indigo-100 p-5 print-hidden">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#108910]/10 rounded-xl flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-[#108910]" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 text-sm">
              Tu primer pedido con Resurte.me
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Cuando estés listo para abrir, tu primer pedido de insumos está a un clic. 
              Nuestro catálogo tiene todo lo que necesitas para {selectedCollection.name.toLowerCase()}, 
              con envío gratis desde $2,500 MXN.
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-[#108910] text-white px-5 py-2.5 rounded-xl hover:bg-[#0D720D] transition-colors"
            >
              <Store className="w-4 h-4" />
              Crear cuenta y empezar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
