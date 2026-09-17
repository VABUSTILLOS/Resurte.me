"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Clock, Loader2, PackageCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  REDEMPTION_STATUS_LABEL,
  formatRedemptionDueDate,
  isOpenRedemption,
  isRedemptionOverdue,
  redemptionAgeDays,
  slaDaysRemaining,
  type RedemptionStatus,
} from "@/lib/redemptions";

/**
 * "Mis solicitudes": el ciclo de vida de los servicios canjeados, junto al
 * dinero que los pagó.
 *
 * Antes de esto el cliente canjeaba créditos y el rastro terminaba ahí: la
 * tabla `redemptions` sólo tenía un `status` que nadie actualizaba y ninguna
 * pantalla lo mostraba. El checkout prometía "te avisaremos en cada paso" sin
 * que existiera el aviso ni la lista de pasos.
 *
 * Los datos se leen con el cliente anónimo: RLS ya limita `redemptions` a
 * `auth.uid() = user_id` y `redemption_events` a las solicitudes propias, así
 * que no hace falta una ruta de servidor para leer lo que es del propio
 * usuario. La única escritura —cancelar— sí pasa por la API, porque el
 * reembolso lo ejecuta `advance_redemption()` con service_role.
 */

interface RedemptionRow {
  id: number;
  service_id: string;
  service_name: string;
  cost_credits: number;
  status: RedemptionStatus;
  created_at: string;
  due_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  cancel_reason: string | null;
  deliverable_url: string | null;
}

interface RedemptionEvent {
  id: number;
  redemption_id: number;
  status: string;
  note: string | null;
  actor: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<RedemptionStatus, string> = {
  requested: "bg-cream-100 text-warm-700 border-cream-300",
  in_progress: "bg-brand-50 text-brand-500 border-brand-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RedemptionsList() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  );
  const [rows, setRows] = useState<RedemptionRow[] | null>(null);
  const [events, setEvents] = useState<Record<number, RedemptionEvent[]>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (!cancelled) setRows([]);
          return;
        }

        const { data: redemptions } = await supabase
          .from("redemptions")
          .select(
            "id, service_id, service_name, cost_credits, status, created_at, due_at, delivered_at, cancelled_at, refunded_at, cancel_reason, deliverable_url"
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (cancelled) return;
        const list = (redemptions as RedemptionRow[] | null) ?? [];
        setRows(list);

        if (list.length > 0) {
          const { data: evs } = await supabase
            .from("redemption_events")
            .select("id, redemption_id, status, note, actor, created_at")
            .in(
              "redemption_id",
              list.map((r) => r.id)
            )
            .order("created_at", { ascending: true });
          if (cancelled) return;
          const grouped: Record<number, RedemptionEvent[]> = {};
          for (const ev of (evs as RedemptionEvent[] | null) ?? []) {
            (grouped[ev.redemption_id] ??= []).push(ev);
          }
          setEvents(grouped);
        }
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const cancel = useCallback(
    async (row: RedemptionRow) => {
      const ok = window.confirm(
        `¿Cancelar "${row.service_name}"? Se te devuelven ${row.cost_credits} créditos.`
      );
      if (!ok) return;

      setBusyId(row.id);
      setError(null);
      try {
        const res = await fetch(`/api/redemptions/${row.id}/cancel`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error ?? "No se pudo cancelar la solicitud");
          return;
        }
        setRows((prev) =>
          prev
            ? prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      status: "cancelled" as RedemptionStatus,
                      cancelled_at: new Date().toISOString(),
                      refunded_at: body.refunded ? new Date().toISOString() : null,
                    }
                  : r
              )
            : prev
        );
      } catch {
        setError("No se pudo cancelar la solicitud");
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  // Nada que mostrar mientras carga la primera vez evita un salto de layout.
  if (rows === null) return null;

  return (
    <div className="mb-4">
      <p className="text-warm-700 text-sm font-bold mb-3">Mis solicitudes</p>

      {error && (
        <div className="mb-2 rounded-xl bg-red-50 border border-red-200 p-3">
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white border border-cream-300 p-6 text-center">
          <PackageCheck className="mx-auto h-6 w-6 text-[#6e737b]" />
          <p className="text-[#6e737b] text-sm mt-2">
            Aún no has canjeado ningún servicio. Entra a la Tienda de Crecimiento para usar tus
            créditos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const overdue = isRedemptionOverdue({ status: row.status, due_at: row.due_at });
            const age = redemptionAgeDays(row.created_at);
            const remaining = slaDaysRemaining(row.due_at);
            const timeline = events[row.id] ?? [];
            const isOpen = isOpenRedemption(row.status);

            return (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-white border border-cream-300 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === row.id ? null : row.id)}
                  aria-expanded={open === row.id}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-100 flex-shrink-0">
                    <PackageCheck className="h-4 w-4 text-warm-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-warm-700 text-sm font-medium truncate">
                      {row.service_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_STYLE[row.status]
                        }`}
                      >
                        {REDEMPTION_STATUS_LABEL[row.status]}
                      </span>
                      <span className="text-[#6e737b] text-[10px]">
                        Solicitado el {formatDay(row.created_at)}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          Fuera del plazo
                        </span>
                      )}
                      {!overdue && isOpen && remaining !== null && remaining >= 0 && (
                        <span className="text-[10px] text-[#6e737b]">
                          Comprometido para el {formatRedemptionDueDate(row.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[#6e737b] text-xs tabular-nums flex-shrink-0">
                    -${Number(row.cost_credits).toLocaleString("es-MX")}
                  </p>
                </button>

                {open === row.id && (
                  <div className="border-t border-cream-300 bg-cream-50 px-3 py-3">
                    {/* Timeline real: cada fila la escribe advance_redemption(). */}
                    {timeline.length > 0 ? (
                      <ol className="space-y-2">
                        {timeline.map((ev) => (
                          <li key={ev.id} className="flex items-start gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-brand-500 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-warm-700 text-xs font-medium">
                                {ev.status}
                                {ev.actor ? (
                                  <span className="text-[#6e737b] font-normal"> · {ev.actor}</span>
                                ) : null}
                              </p>
                              {ev.note && (
                                <p className="text-[#6e737b] text-[11px]">{ev.note}</p>
                              )}
                              <p className="text-[#6e737b] text-[10px]">
                                {formatDay(ev.created_at)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[#6e737b] text-xs">
                        Sin movimientos registrados todavía.
                      </p>
                    )}

                    {row.deliverable_url && (
                      <a
                        href={row.deliverable_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-brand-500 text-xs font-semibold underline"
                      >
                        Ver lo que entregamos
                      </a>
                    )}

                    {row.status === "cancelled" && row.cancel_reason && (
                      <p className="mt-3 text-[#6e737b] text-[11px]">
                        Motivo de la cancelación: {row.cancel_reason}
                        {row.refunded_at ? " · créditos devueltos" : ""}
                      </p>
                    )}

                    {isOpen && (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[#6e737b] text-[10px]">
                          {age !== null ? `Llevas ${age} día${age === 1 ? "" : "s"} esperando.` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => cancel(row)}
                          disabled={busyId === row.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-600 text-xs font-semibold disabled:opacity-50"
                        >
                          {busyId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          Cancelar y recuperar créditos
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
