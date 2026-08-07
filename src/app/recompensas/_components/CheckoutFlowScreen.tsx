"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, CheckCircle, Sparkles } from "lucide-react";
import type { ServiceItem } from "./types";
import { createClient } from "@/lib/supabase/client";

interface CheckoutFlowScreenProps {
  service: ServiceItem;
  onBack: () => void;
  onComplete: (newBalance?: number) => void;
  balance?: number;
}

export function CheckoutFlowScreen({ service, onBack, onComplete, balance = 0 }: CheckoutFlowScreenProps) {
  const [step, setStep] = useState(1);
  const [restaurantName, setRestaurantName] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const totalSteps = 3;

  const remainingAfter = balance - service.cost;

  // Cargar el nombre real del restaurante (perfil) para el formulario
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  );

  useEffect(() => {
    if (!supabase) return;

    async function loadName() {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session?.user?.id) return;
        const { data: profile } = await supabase!
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

  const handleSubmit = async () => {
    if (isRedeeming) return;
    setIsRedeeming(true);
    setRedeemError("");

    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: service.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setRedeemError(data.error || "No se pudo completar el canje");
        setIsRedeeming(false);
        return;
      }

      setStep(3);
      setTimeout(() => {
        onComplete(data.newBalance);
      }, 2500);
    } catch {
      setRedeemError("Error de conexión. Intenta de nuevo.");
      setIsRedeeming(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <button
          onClick={step === 3 ? onBack : step === 1 ? onBack : () => setStep(step - 1)}
          className="rounded-xl bg-white/5 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-white text-lg font-bold">
            {step === 3 ? "¡Listo!" : "Canjear Servicio"}
          </h1>
        </div>
        {/* Step indicator */}
        {step < 3 && (
          <span className="text-gray-500 text-sm">
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
                  i + 1 <= step ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-600"
                }`}
                animate={i + 1 < step ? { scale: [1, 1.2, 1] } : {}}
              >
                {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </motion.div>
              {i < totalSteps - 1 && (
                <div
                  className={`h-0.5 w-6 transition-colors ${
                    i + 1 < step ? "bg-emerald-600" : "bg-gray-800"
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
      <p className="text-gray-400 text-sm">
        Tu <strong className="text-white">{service.name}</strong> está listo. Solo confírmalo.
      </p>

      {/* Service Summary */}
      <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{service.icon}</span>
          <div>
            <h2 className="text-white font-bold">{service.name}</h2>
            <p className="text-gray-400 text-xs mt-0.5">{service.description.slice(0, 80)}...</p>
          </div>
        </div>

        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/15 p-3">
          <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Entregables incluidos
          </p>
          <ul className="space-y-1">
            {service.deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-white">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" /> {d}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Balance Check */}
      <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Tu saldo actual</span>
          <span className="text-white font-bold tabular-nums">
            ${balance.toLocaleString("es-MX")} Créditos
          </span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-gray-400 text-sm">Costo del servicio</span>
          <span className="text-white font-bold tabular-nums">
            - ${service.cost.toLocaleString("es-MX")} Créditos
          </span>
        </div>
        <hr className="my-3 border-gray-800" />
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Te quedaría</span>
          <span className={`font-bold tabular-nums text-lg ${remainingAfter >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            ${remainingAfter.toLocaleString("es-MX")} Créditos
          </span>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white 
          shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98] 
          hover:bg-emerald-500"
      >
        Continuar
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
  onNext: () => void;
  isRedeeming?: boolean;
  redeemError?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <p className="text-gray-400 text-sm">
        Cuéntanos de tu restaurante para que el servicio <strong className="text-white">realmente funcione</strong>.
      </p>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
            Nombre de tu restaurante
          </label>
          <input
            type="text"
            defaultValue={restaurantName}
            placeholder="Nombre de tu restaurante"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm 
              focus:outline-none focus:border-emerald-500/50 placeholder:text-gray-600"
          />
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
            Link de Google Maps
          </label>
          <input
            type="text"
            placeholder="https://maps.google.com/..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm 
              focus:outline-none focus:border-emerald-500/50 placeholder:text-gray-600"
          />
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
            Instagram / Facebook
          </label>
          <input
            type="text"
            placeholder="@taqueriaelpariente"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm 
              focus:outline-none focus:border-emerald-500/50 placeholder:text-gray-600"
          />
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
            Notas para el equipo
          </label>
          <textarea
            placeholder="Ej. Quiero atraer más clientes en horario de comida (2-5pm)..."
            rows={3}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm 
              focus:outline-none focus:border-emerald-500/50 placeholder:text-gray-600 resize-none"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={isRedeeming}
        className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white 
          shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98] 
          hover:bg-emerald-500 disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {isRedeeming ? "Canjeando..." : "Solicitar Servicio"}
      </button>

      {redeemError && (
        <p className="mt-3 text-center text-sm font-semibold text-red-400">
          {redeemError}
        </p>
      )}
    </motion.div>
  );
}

function Step3Confirmation({ service }: { service: ServiceItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center pt-8 text-center"
    >
      {/* Success animation */}
      <motion.div
        className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/20 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          <Check className="h-12 w-12 text-emerald-400" strokeWidth={3} />
        </motion.div>
      </motion.div>

      <motion.h2
        className="text-white text-2xl font-black"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        ¡Hecho!
      </motion.h2>

      <motion.p
        className="text-gray-400 text-sm mt-2 max-w-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Tu <strong className="text-white">{service.name}</strong> está en marcha. Te avisaremos en cada paso del proceso.
      </motion.p>

      {/* Timeline preview */}
      <motion.div
        className="mt-8 w-full rounded-2xl bg-white/5 border border-white/10 p-5 text-left"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">¿Qué sigue?</p>
        <div className="space-y-3">
          {[
            { step: "Revisión de datos", status: "completed", time: "Hoy" },
            { step: "Creación de contenido", status: "in-progress", time: "1-3 días" },
            { step: "Lanzamiento", status: "pending", time: "3-5 días" },
            { step: "Reporte de resultados", status: "pending", time: "30 días" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  s.status === "completed"
                    ? "bg-emerald-500"
                    : s.status === "in-progress"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-gray-700"
                }`}
              />
              <span className="text-white text-sm flex-1">{s.step}</span>
              <span className="text-gray-500 text-xs">{s.time}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
