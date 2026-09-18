"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react"
import {
  LEAD_CHANNELS,
  LEAD_PAINS,
  qualifyLead,
  type LeadChannel,
  type LeadPain,
} from "@/lib/lead-qualification"

/**
 * Calificador de leads de la landing B2B.
 *
 * El diagnóstico se calcula en vivo con `qualifyLead` (puro y testeado) para
 * que el restaurantero vea qué necesita ANTES de dejar su correo. Solo se
 * envía a `/api/leads` lo que él escribió: el diagnóstico lo vuelve a derivar
 * el servidor, así que el navegador no puede inflar su propio puntaje.
 *
 * El nivel que se muestra es el mínimo que desbloquearía lo que el lead pide.
 * No es una promesa comercial: el nivel se gana comprando, y el equipo decide
 * si concede un ajuste manual.
 */

const CHANNEL_LABELS: Record<LeadChannel, string> = {
  mostrador: "Mostrador",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  apps_delivery: "Apps de delivery",
  redes: "Redes sociales",
  propio: "Mi propia web o app",
}

const PAIN_LABELS: Record<LeadPain, string> = {
  comisiones: "Las comisiones se comen el margen",
  pedidos_perdidos: "Se me pierden pedidos en horas pico",
  reparto: "El reparto me cuesta caro o falla",
  marketing: "No logro que me vuelvan a comprar",
  operacion: "La operación se me desordena",
  ninguno: "Nada en particular, quiero ver opciones",
}

const FEATURE_LABELS: Record<string, string> = {
  marketing_ia: "Marketing IA",
  flotilla: "Flotilla de reparto",
  mesero_ia: "Mesero IA por WhatsApp",
  wallet_passes: "Tarjeta de lealtad",
  app_marca: "App y sitio de tu marca",
  sitio_ia: "Sitio con SEO local",
  pos_mostrador: "Punto de venta en mostrador",
  catering: "Catering por volumen",
}

export function LeadQualifier() {
  const [weeklyOrders, setWeeklyOrders] = useState(80)
  const [averageTicket, setAverageTicket] = useState(200)
  const [channels, setChannels] = useState<LeadChannel[]>(["apps_delivery"])
  const [biggestPain, setBiggestPain] = useState<LeadPain>("comisiones")

  const [email, setEmail] = useState("")
  const [restaurantName, setRestaurantName] = useState("")
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const diagnosis = useMemo(
    () =>
      qualifyLead({ weeklyOrders, averageTicket, channels, biggestPain }),
    [weeklyOrders, averageTicket, channels, biggestPain]
  )

  function toggleChannel(channel: LeadChannel) {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    setError(null)

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone: phone || undefined,
          source: "restaurantes_landing",
          restaurant_name: restaurantName || undefined,
          // Se mandan las respuestas crudas, nunca el puntaje: el servidor
          // vuelve a derivar el diagnóstico con `qualifyLead`.
          answers: { weeklyOrders, averageTicket, channels, biggestPain },
        }),
      })
      if (!response.ok) {
        setStatus("error")
        setError("No pudimos guardar tus datos. Intenta de nuevo.")
        return
      }
      setStatus("sent")
    } catch {
      setStatus("error")
      setError("No pudimos guardar tus datos. Revisa tu conexión.")
    }
  }

  return (
    <div className="rounded-[20px] border border-[#E4E1DA] bg-white p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0E7A0E]">
          <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#242529]">
            Dinos cómo opera tu restaurante hoy
          </h3>
          <p className="text-xs text-[#5C6068]">
            Cinco preguntas. El diagnóstico se calcula aquí mismo.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Preguntas */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="lead-weekly-orders"
                className="block text-sm font-semibold text-[#242529]"
              >
                Pedidos por semana
              </label>
              <input
                id="lead-weekly-orders"
                type="number"
                inputMode="numeric"
                min={0}
                max={20000}
                step={5}
                value={weeklyOrders}
                onChange={(event) => setWeeklyOrders(Number(event.target.value) || 0)}
                className="touch-target mt-2 w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
              />
            </div>
            <div>
              <label
                htmlFor="lead-average-ticket"
                className="block text-sm font-semibold text-[#242529]"
              >
                Ticket promedio (MXN)
              </label>
              <input
                id="lead-average-ticket"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                step={10}
                value={averageTicket}
                onChange={(event) => setAverageTicket(Number(event.target.value) || 0)}
                className="touch-target mt-2 w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
              />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-[#242529]">
              ¿Por dónde te llegan los pedidos?
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {LEAD_CHANNELS.map((channel) => {
                const active = channels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    aria-pressed={active}
                    className={
                      active
                        ? "touch-target rounded-full border border-[#0E7A0E] bg-[#0E7A0E] px-4 text-sm font-semibold text-white"
                        : "touch-target rounded-full border border-[#E4E1DA] bg-white px-4 text-sm font-medium text-[#5C6068] hover:border-[#0E7A0E]/40"
                    }
                  >
                    {CHANNEL_LABELS[channel]}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-[#242529]">
              ¿Qué es lo que más te duele?
            </legend>
            <div className="mt-2 space-y-2">
              {LEAD_PAINS.map((pain) => (
                <label
                  key={pain}
                  className={
                    biggestPain === pain
                      ? "flex cursor-pointer items-center gap-3 rounded-xl border border-[#0E7A0E] bg-[#F0F7F0] px-3 py-2 text-sm font-medium text-[#242529]"
                      : "flex cursor-pointer items-center gap-3 rounded-xl border border-[#E4E1DA] bg-white px-3 py-2 text-sm text-[#5C6068] hover:border-[#0E7A0E]/40"
                  }
                >
                  <input
                    type="radio"
                    name="lead-pain"
                    value={pain}
                    checked={biggestPain === pain}
                    onChange={() => setBiggestPain(pain)}
                    className="h-4 w-4 accent-[#0E7A0E]"
                  />
                  {PAIN_LABELS[pain]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Diagnóstico */}
        <div className="space-y-4 lg:border-l lg:border-[#E4E1DA] lg:pl-8">
          <div aria-live="polite" className="rounded-xl bg-[#F7F5F0] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5C6068]">
              Diagnóstico
            </p>
            <p className="mt-1 text-2xl font-bold text-[#242529]">
              Segmento {diagnosis.segment}{" "}
              <span className="text-base font-medium text-[#5C6068]">
                ({diagnosis.score}/100)
              </span>
            </p>
            <p className="mt-1 text-xs text-[#5C6068]">
              Un diagnóstico alto solo significa que FoodOS te puede mover la
              aguja. No es una calificación de tu restaurante.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5C6068]">
              Lo que te serviría
            </p>
            <ul className="mt-2 space-y-2">
              {diagnosis.recommendedFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[#242529]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0E7A0E]" aria-hidden="true" />
                  {FEATURE_LABELS[feature] ?? feature}
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-xl border border-[#0E7A0E]/20 bg-[#F0F7F0] p-3 text-xs text-[#242529]">
            Todo esto se abre con el nivel{" "}
            <strong className="font-semibold">{diagnosis.recommendedTier}</strong>. Los
            niveles no se pagan: se ganan comprando en Resurte.me — una compra
            semanal por arriba de $2,500 ya califica la semana.
          </p>

          {status === "sent" ? (
            <div className="rounded-xl border border-[#0E7A0E]/25 bg-[#F0F7F0] p-4" role="status">
              <p className="text-sm font-semibold text-[#0E7A0E]">Listo, te contactamos.</p>
              <p className="mt-1 text-xs text-[#5C6068]">
                Te escribimos con el plan concreto para tu restaurante. Sin
                llamadas de venta insistentes.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label
                  htmlFor="lead-email"
                  className="block text-sm font-semibold text-[#242529]"
                >
                  Tu correo
                </label>
                <input
                  id="lead-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="dueno@turestaurante.com"
                  className="touch-target mt-2 w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] placeholder:text-gray-500 focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="lead-restaurant"
                    className="block text-sm font-semibold text-[#242529]"
                  >
                    Restaurante
                  </label>
                  <input
                    id="lead-restaurant"
                    type="text"
                    autoComplete="organization"
                    value={restaurantName}
                    onChange={(event) => setRestaurantName(event.target.value)}
                    className="touch-target mt-2 w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lead-phone"
                    className="block text-sm font-semibold text-[#242529]"
                  >
                    WhatsApp
                  </label>
                  <input
                    id="lead-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="touch-target mt-2 w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-5 text-base font-semibold text-white transition-colors hover:bg-[#0B620B] disabled:opacity-60 motion-reduce:transition-none"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Enviando
                  </>
                ) : (
                  <>
                    Recibir el plan
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>

              {error && (
                <p role="alert" className="text-xs text-[#B42318]">
                  {error}
                </p>
              )}

              <p className="text-xs text-[#8A8F98]">
                Usamos tus datos para contactarte sobre FoodOS. Nada de listas de
                correo ni terceros.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
