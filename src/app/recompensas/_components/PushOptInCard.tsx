"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import {
  isPushConfigured,
  isPushSupported,
  pushPermission,
  urlBase64ToUint8Array,
  vapidPublicKey,
} from "@/lib/push";

/**
 * Alta/baja de avisos push de pedido (W9).
 *
 * Se oculta entera cuando el navegador no puede (iOS Safari en pestaña normal:
 * el push solo existe con la app en la pantalla de inicio) o cuando el
 * despliegue no tiene clave VAPID. Antes que un botón que no puede funcionar,
 * nada.
 *
 * Requiere que el service worker ya esté registrado: `RegisterSW` solo lo
 * registra en producción, así que en dev la tarjeta se oculta en vez de
 * quedarse colgada esperando `navigator.serviceWorker.ready`.
 */

type PushState = "loading" | "hidden" | "off" | "on" | "denied" | "busy" | "error";

export function PushOptInCard() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isPushSupported() || !isPushConfigured()) {
        if (!cancelled) setState("hidden");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          if (!cancelled) setState("hidden");
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) setState("on");
        else if (pushPermission() === "denied") setState("denied");
        else setState("off");
      } catch {
        if (!cancelled) setState("hidden");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setState("busy");
    try {
      const key = vapidPublicKey();
      const applicationServerKey = key ? urlBase64ToUint8Array(key) : null;
      if (!applicationServerKey) {
        setState("hidden");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setState("hidden");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Primero el servidor: si se desuscribe localmente y el DELETE falla,
        // seguiríamos mandando avisos a un endpoint que ya no existe.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }, []);

  if (state === "hidden") return null;

  const busy = state === "loading" || state === "busy";
  const on = state === "on";

  return (
    <div className="px-4 mb-3 md:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-2xl border border-warm-200 bg-white px-4 py-3">
        <BellRing className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <p className="text-warm-800 text-xs font-semibold">Avisos de tu pedido al instante</p>
          <p className="text-warm-600 mt-0.5 text-[11px] leading-relaxed">
            {state === "denied"
              ? "El navegador tiene bloqueados los avisos. Actívalos en los ajustes del sitio para recibirlos."
              : on
                ? "Te avisamos cuando tu pedido se confirma, va en camino y se entrega."
                : "Recibe confirmación, salida y entrega sin abrir la app."}
          </p>
          {state === "error" && (
            <p className="text-red-600 mt-1 text-[11px]">
              No se pudo guardar la preferencia. Intenta de nuevo.
            </p>
          )}
        </div>
        {state !== "denied" && (
          <button
            type="button"
            onClick={on ? disable : enable}
            disabled={busy}
            aria-pressed={on}
            aria-label={on ? "Desactivar avisos de pedido" : "Activar avisos de pedido"}
            className={`flex h-7 w-12 flex-shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-60 ${
              on ? "bg-brand-500 justify-end" : "bg-warm-300 justify-start"
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
              {busy && <Loader2 className="h-3 w-3 animate-spin text-warm-500" />}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
