"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, CheckCircle, Clock, Sparkles } from "lucide-react";
import type { ServiceItem } from "./types";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/money";
import {
  REDEMPTION_BRIEF_LIMITS,
  formatRedemptionDueDate,
  type RedemptionStatus,
} from "@/lib/redemptions";
interface CheckoutFlowScreenProps {
  service: ServiceItem;
  onBack: () => void;
  onComplete: (newBalance?: number, destination?: "wallet" | "store") => void;
  balance?: number;
}

interface RedemptionResult {
  folio: number | null;
  newBalance?: number;
  alreadyRedeemed: boolean;
  status: RedemptionStatus | null;
  dueAt: string | null;
}

interface RedemptionBriefInput {
  restaurant_name: string;
  maps_url: string | null;
  social_handle: string | null;
  notes: string | null;
}

export function CheckoutFlowScreen({ service, onBack, onComplete, balance = 0 }: CheckoutFlowScreenProps) {
  const [step, setStep] = useState(1);
  const [restaurantName, setRestaurantName] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const totalSteps = 3;

  const remainingAfter = balance - service.cost;

  // Cargar el nombre real del restaurante (perfil) para el formulario
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  );

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    async function loadName() {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.user?.id) return;
        const { data: profile } = await sb
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();
        if (profile?.full_name) setRestaurantName(profile.full_name);
      } catch {
        // Keep empty
      }
    }

    loadName();
  }, [supabase]);

  const handleSubmit = async (brief: RedemptionBriefInput) => {
    if (isRedeeming) return;
    setIsRedeeming(true);
    setRedeemError("");

    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: service.id, brief }),
      });

      const data = await response.json();

      if (!response.ok) {
        setRedeemError(data.error || "No se pudo completar el canje");
        setIsRedeeming(false);
        return;
      }

      setStep(3);
      setResult({
        folio: typeof data.redemption?.id === "number" ? data.redemption.id : null,
        newBalance: typeof data.newBalance === "number" ? data.newBalance : undefined,
        alreadyRedeemed: data.already_redeemed === true,
        status: (data.redemption?.status as RedemptionStatus | undefined) ?? null,
        dueAt: typeof data.redemption?.due_at === "string" ? data.redemption.due_at : null,
      });
    } catch {
      setRedeemError("Error de conexión. Intenta de nuevo.");
      setIsRedeeming(false);
    }
  };

  // El saldo se propaga al cerrar el flujo; así la vista de créditos y la
  // tienda muestran el saldo real sin recargar la página.
  const finish = (destination: "wallet" | "store") => onComplete(result?.newBalance, destination);

  return (
    <div className="flex flex-col min-h-screen bg-transparent">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-cream-300">
        <button
          onClick={step === 3 ? onBack : step === 1 ? onBack : () => setStep(step - 1)}
          aria-label="Volver"
          className="rounded-xl bg-white border border-cream-300 p-2 text-[#5c6069] hover:text-warm-700 transition-colors touch-target"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-warm-700 text-lg font-bold">
            {step === 3 ? "¡Listo!" : "Canjear Servicio"}
          </h1>
        </div>
        {/* Step indicator */}
        {step < 3 && (
          <span className="text-[#6e737b] text-sm">
            Paso {step}/{totalSteps}
          </span>
        )}
      </div>

      {/* Progress Stepper */}
      {step < 3 && (
        <div className="flex items-center justify-center gap-1.5 px-4 py-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex items-center">
              <motion.div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i + 1 <= step ? "bg-brand-500 text-white" : "bg-cream-100 text-warm-600"
                }`}
                animate={i + 1 < step ? { scale: [1, 1.2, 1] } : {}}
              >
                {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </motion.div>
              {i < totalSteps - 1 && (
                <div
                  className={`h-0.5 w-6 transition-colors ${
                    i + 1 < step ? "bg-brand-500" : "bg-cream-300"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <Step1Confirm
              key="s1"
              service={service}
              balance={balance}
              remainingAfter={remainingAfter}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Context
              key="s2"
              restaurantName={restaurantName}
              onNext={handleSubmit}
              isRedeeming={isRedeeming}
              redeemError={redeemError}
            />
          )}
          {step === 3 && (
            <Step3Confirmation
              key="s3"
              service={service}
              result={result}
              onGoWallet={() => finish("wallet")}
              onGoStore={() => finish("store")}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step1Confirm({
  service,
  balance,
  remainingAfter,
  onNext,
}: {
  service: ServiceItem;
  balance: number;
  remainingAfter: number;
  onNext: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <p className="text-[#5c6069] text-sm">
        Tu <strong className="text-warm-700">{service.name}</strong> está listo. Solo confírmalo.
      </p>

      {/* Service Summary */}
      <div className="mt-4 rounded-2xl bg-white border border-cream-300 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{service.icon}</span>
          <div>
            <h2 className="text-warm-700 font-bold">{service.name}</h2>
            <p className="text-[#5c6069] text-xs mt-0.5">{service.description.slice(0, 80)}...</p>
          </div>
        </div>

        <div className="rounded-xl bg-brand-50 border border-brand-200 p-3">
          <p className="text-brand-500 text-xs font-semibold uppercase tracking-wider mb-2">
            Entregables incluidos
          </p>
          <ul className="space-y-1">
            {service.deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-warm-700">
                <CheckCircle className="h-3.5 w-3.5 text-brand-500 flex-shrink-0" /> {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Fecha comprometida ANTES de gastar créditos: es el mismo sla_days que
            el trigger set_redemption_due_at() usa para fijar due_at. */}
        {service.slaDays ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-cream-50 border border-cream-300 p-3">
            <Clock className="h-4 w-4 text-warm-700 flex-shrink-0" />
            <p className="text-[#5c6069] text-xs">
              Comprometido en{" "}
              <strong className="text-warm-700">{service.slaDays} días</strong>. Puedes
              cancelar cuando quieras desde tu historial y se te devuelven los créditos.
            </p>
          </div>
        ) : null}
      </div>

      {/* Balance Check */}
      <div className="mt-4 rounded-2xl bg-white border border-cream-300 shadow-sm p-5">
        <div className="flex justify-between items-center">
          <span className="text-[#5c6069] text-sm">Tu saldo actual</span>
          <span className="text-warm-700 font-bold tabular-nums">
            ${formatNumber(balance)} Créditos
          </span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-[#5c6069] text-sm">Costo del servicio</span>
          <span className="text-warm-700 font-bold tabular-nums">
            - ${formatNumber(service.cost)} Créditos
          </span>
        </div>
        <hr className="my-3 border-cream-300" />
        <div className="flex justify-between items-center">
          <span className="text-[#5c6069] text-sm">Te quedaría</span>
          <span className={`font-bold tabular-nums text-lg ${remainingAfter >= 0 ? "text-brand-500" : "text-red-600"}`}>
            ${formatNumber(remainingAfter)} Créditos
          </span>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={remainingAfter < 0}
        className="mt-5 w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white 
          shadow-lg transition-all active:scale-[0.98] 
          hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {remainingAfter < 0 ? "Saldo insuficiente" : "Continuar"}
      </button>
    </motion.div>
  );
}

function Step2Context({
  onNext,
  restaurantName,
  isRedeeming,
  redeemError,
}: {
  restaurantName: string;
  onNext: (brief: RedemptionBriefInput) => void;
  isRedeeming?: boolean;
  redeemError?: string;
}) {
  // Inputs controlados: conservan su valor ante re-renders (framer-motion
  // desmonta/remonta el paso al navegar entre steps).
  const [name, setName] = useState(restaurantName);
  const [mapsLink, setMapsLink] = useState("");
  const [social, setSocial] = useState("");
  const [notes, setNotes] = useState("");

  // El nombre del restaurante es obligatorio en el servidor: ningún servicio
  // del catálogo se puede ejecutar sin saber sobre qué negocio se trabaja.
  // Se valida aquí para no gastar un viaje de red (ni el rate limit) en vano.
  const nameMissing = name.trim().length < 2;

  const submit = () => {
    if (nameMissing) return;
    onNext({
      restaurant_name: name.trim(),
      maps_url: mapsLink.trim() || null,
      social_handle: social.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <p className="text-[#5c6069] text-sm">
        Cuéntanos de tu restaurante para que el servicio <strong className="text-warm-700">realmente funcione</strong>.
      </p>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-4">
          <label
            htmlFor="redeem-restaurant-name"
            className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-2 block"
          >
            Nombre de tu restaurante
          </label>
          <input
            id="redeem-restaurant-name"
            type="text"
            value={name}
            maxLength={REDEMPTION_BRIEF_LIMITS.restaurantName}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de tu restaurante"
            aria-invalid={nameMissing}
            className="w-full rounded-xl bg-white border border-cream-300 px-4 py-3 text-warm-700 text-sm 
              focus:outline-none focus:border-brand-500 placeholder:text-warm-500"
          />
          {nameMissing && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Necesitamos el nombre para poder ejecutar el servicio.
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-4">
          <label
            htmlFor="redeem-maps"
            className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-2 block"
          >
            Link de Google Maps
          </label>
          <input
            id="redeem-maps"
            type="text"
            value={mapsLink}
            maxLength={REDEMPTION_BRIEF_LIMITS.mapsUrl}
            onChange={(e) => setMapsLink(e.target.value)}
            placeholder="https://maps.google.com/..."
            className="w-full rounded-xl bg-white border border-cream-300 px-4 py-3 text-warm-700 text-sm 
              focus:outline-none focus:border-brand-500 placeholder:text-warm-500"
          />
        </div>

        <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-4">
          <label
            htmlFor="redeem-social"
            className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-2 block"
          >
            Instagram / Facebook
          </label>
          <input
            id="redeem-social"
            type="text"
            value={social}
            maxLength={REDEMPTION_BRIEF_LIMITS.social}
            onChange={(e) => setSocial(e.target.value)}
            placeholder="@taqueriaelpariente"
            className="w-full rounded-xl bg-white border border-cream-300 px-4 py-3 text-warm-700 text-sm 
              focus:outline-none focus:border-brand-500 placeholder:text-warm-500"
          />
        </div>

        <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-4">
          <label
            htmlFor="redeem-notes"
            className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-2 block"
          >
            Notas para el equipo
          </label>
          <textarea
            id="redeem-notes"
            value={notes}
            maxLength={REDEMPTION_BRIEF_LIMITS.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Quiero atraer más clientes en horario de comida (2-5pm)..."
            rows={3}
            className="w-full rounded-xl bg-white border border-cream-300 px-4 py-3 text-warm-700 text-sm 
              focus:outline-none focus:border-brand-500 placeholder:text-warm-500 resize-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={isRedeeming || nameMissing}
        className="mt-5 w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white 
          shadow-lg transition-all active:scale-[0.98] 
          hover:bg-brand-600 disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {isRedeeming ? "Canjeando..." : "Solicitar Servicio"}
      </button>

      <p className="mt-3 text-center text-[11px] text-[#6e737b]">
        Estos datos se quedan con tu solicitud: son los que el equipo usa para ejecutarla.
      </p>

      {redeemError && (
        <p className="mt-3 text-center text-sm font-semibold text-red-600">
          {redeemError}
        </p>
      )}
    </motion.div>
  );
}

function Step3Confirmation({
  service,
  result,
  onGoWallet,
  onGoStore,
}: {
  service: ServiceItem;
  result: RedemptionResult | null;
  onGoWallet: () => void;
  onGoStore: () => void;
}) {
  // Etapas REALES de la solicitud: son las tres que implementa
  // advance_redemption() (requested → in_progress → delivered).
  //
  // Antes esta lista era un guion fijo —"Creación de contenido 1-3 días",
  // "Reporte de resultados 30 días"— que no correspondía al SLA del servicio
  // ni a ningún estado de la base, y que además prometía un reporte que no
  // existe. Ahora se deriva del estatus y de la fecha comprometida reales.
  const dueLabel = formatRedemptionDueDate(result?.dueAt);
  const stageIndex =
    result?.status === "delivered" ? 2 : result?.status === "in_progress" ? 1 : 0;
  const stages = [
    { label: "Solicitud recibida", detail: "Hoy", done: stageIndex >= 0 },
    { label: "En proceso", detail: "Pendiente", done: stageIndex >= 1 },
    {
      label: "Entregado",
      detail: dueLabel ? `Comprometido para el ${dueLabel}` : "Fecha por confirmar",
      done: stageIndex >= 2,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center pt-8 text-center"
    >
      {/* Success animation */}
      <motion.div
        className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          <Check className="h-12 w-12 text-emerald-600" strokeWidth={3} />
        </motion.div>
      </motion.div>

      <motion.h2
        role="status"
        aria-live="polite"
        className="text-warm-700 text-2xl font-black"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        ¡Hecho!
      </motion.h2>

      <motion.p
        className="text-[#5c6069] text-sm mt-2 max-w-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Tu <strong className="text-warm-700">{service.name}</strong> está en marcha. Te avisaremos en cada paso del proceso.
      </motion.p>
      {result?.alreadyRedeemed && (
        <motion.p
          className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          Ya habías solicitado este servicio hace unos minutos. No se te cobró dos veces.
        </motion.p>
      )}

      {/* Comprobante del canje */}
      <motion.dl
        className="mt-6 w-full rounded-2xl bg-white border border-cream-300 shadow-sm p-5 text-left"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <p className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-3">
          Comprobante del canje
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#5c6069] text-sm">Folio</dt>
            <dd className="text-warm-700 text-sm font-bold tabular-nums">
              {result?.folio != null ? `#${result.folio}` : "En proceso"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#5c6069] text-sm">Créditos canjeados</dt>
            <dd className="text-red-600 text-sm font-bold tabular-nums">
              −${formatNumber(service.cost)}
            </dd>
          </div>
          {result?.newBalance != null && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#5c6069] text-sm">Saldo restante</dt>
              <dd className="text-brand-500 text-sm font-bold tabular-nums">
                ${formatNumber(result.newBalance)}
              </dd>
            </div>
          )}
        </div>
        <p className="text-[#6e737b] text-[10px] mt-3">
          Lo encontrarás en tu historial de créditos con la fecha exacta del movimiento.
        </p>
      </motion.dl>

      {/* Timeline preview */}
      <motion.div
        className="mt-3 w-full rounded-2xl bg-white border border-cream-300 shadow-sm p-5 text-left"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-3">¿Qué sigue?</p>
        <div className="space-y-3">
          {stages.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  s.done ? "bg-brand-500" : "bg-cream-300"
                }`}
              />
              <span className="text-warm-700 text-sm flex-1">{s.label}</span>
              <span className="text-[#6e737b] text-xs">{s.detail}</span>
            </div>
          ))}
        </div>
        <p className="text-[#6e737b] text-[10px] mt-3">
          Cada cambio de etapa te llega como aviso y queda registrado en tu historial de solicitudes.
        </p>
      </motion.div>

      {/* CTAs explícitos: sin redirección automática sorpresiva */}
      <motion.div
        className="mt-5 w-full space-y-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75 }}
      >
        <button
          type="button"
          onClick={onGoWallet}
          className="w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] hover:bg-brand-600 touch-target"
        >
          Ver mis créditos
        </button>
        <button
          type="button"
          onClick={onGoStore}
          className="w-full rounded-2xl bg-white border border-cream-300 py-3.5 text-sm font-bold text-warm-700 shadow-sm transition-all active:scale-[0.98] hover:bg-cream-50 touch-target"
        >
          Volver a la tienda
        </button>
      </motion.div>
    </motion.div>
  );
}
