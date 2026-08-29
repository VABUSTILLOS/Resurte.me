"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, TrendingUp, Star, Megaphone, Gift, Sparkles, BellOff } from "lucide-react";
import type { Notification, Tier } from "./types";
import { getWalletHistory, getMonthlyCashbackProgress } from "@/lib/wallet-actions";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { deriveNotifications, type WalletMovement } from "./notifications-data";

const READ_IDS_KEY = "rewards-notifications-read";

const iconMap: Record<Notification["type"], { icon: typeof Bell; bg: string; color: string }> = {
  cashback_earned: { icon: TrendingUp, bg: "bg-brand-50", color: "text-brand-500" },
  milestone: { icon: Star, bg: "bg-amber-50", color: "text-amber-700" },
  service_ready: { icon: Megaphone, bg: "bg-sky-50", color: "text-sky-700" },
  service_update: { icon: Sparkles, bg: "bg-violet-50", color: "text-violet-700" },
  new_feature: { icon: Gift, bg: "bg-pink-50", color: "text-pink-700" },
};

function loadReadIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage lleno o no disponible: el estado en memoria sigue funcionando.
  }
}

interface TierProgress {
  tier: Tier;
  weekCount: number;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<WalletMovement[]>([]);
  // null = usuario no autenticado (la server action devolvió null) → estado vacío.
  const [progress, setProgress] = useState<TierProgress | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEscapeKey(() => setIsOpen(false), isOpen);

  useEffect(() => {
    let cancelled = false;

    async function fetchNotifications() {
      try {
        const [history, monthly] = await Promise.all([
          getWalletHistory(0, 5),
          getMonthlyCashbackProgress(),
        ]);
        if (cancelled) return;
        // Estado "leído" persistido (se lee aquí, de forma asíncrona, para no
        // bloquear el primer render ni desincronizar la hidratación).
        setReadIds(loadReadIds());
        setMovements(history.transactions);
        setProgress(
          monthly
            ? {
                tier: monthly.currentTier.toLowerCase() as Tier,
                weekCount: monthly.weeksWithPurchases,
              }
            : null
        );
      } catch {
        if (!cancelled) {
          setMovements([]);
          setProgress(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  const notifications = useMemo<Notification[]>(() => {
    if (loading || !progress) return [];
    return deriveNotifications({
      movements,
      tier: progress.tier,
      weekCount: progress.weekCount,
    }).map((n) => ({ ...n, read: readIds.has(n.id) }));
  }, [loading, progress, movements, readIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    const next = new Set(readIds);
    for (const n of notifications) next.add(n.id);
    persistReadIds(next);
    setReadIds(next);
  };

  const markRead = (id: string) => {
    if (readIds.has(id)) return;
    const next = new Set(readIds);
    next.add(id);
    persistReadIds(next);
    setReadIds(next);
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notificaciones"
        className="relative rounded-xl bg-white border border-cream-300 shadow-sm p-2.5 text-[#5c6069] 
          hover:text-warm-700 transition-colors touch-target"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center 
              rounded-full bg-brand-500 text-[10px] font-bold text-white shadow-lg shadow-brand-500/30"
          >
            {unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-4 top-[calc(5rem+var(--header-inset-top))] z-50 mx-auto max-w-md lg:absolute lg:inset-auto 
                lg:right-0 lg:top-full lg:mt-2 lg:w-96 rounded-2xl bg-white border border-cream-300 
                shadow-lg overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-cream-300">
                <h3 className="text-warm-700 text-sm font-bold">
                  Notificaciones
                  {unreadCount > 0 && (
                    <span className="ml-2 text-brand-500 text-xs font-medium">
                      {unreadCount} nuevas
                    </span>
                  )}
                </h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-brand-500 text-xs font-medium hover:underline"
                  >
                    Marcar todo leído
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-cream-300">
                {loading ? (
                  // Skeleton de carga (mismo patrón visual que LoyaltyTierCard).
                  <div className="p-4 space-y-3 animate-pulse" aria-label="Cargando notificaciones">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-xl bg-cream-100 flex-shrink-0" />
                        <div className="flex-1 space-y-2 py-0.5">
                          <div className="h-3.5 w-3/4 rounded bg-cream-100" />
                          <div className="h-3 w-full rounded bg-cream-100" />
                          <div className="h-2.5 w-1/3 rounded bg-cream-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <BellOff className="h-10 w-10 text-cream-300 mx-auto mb-3" />
                    <p className="text-warm-700 text-sm font-semibold">Estás al día</p>
                    <p className="text-[#6e737b] text-xs mt-1">
                      No tienes notificaciones nuevas.
                    </p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const IconComp = iconMap[notif.type].icon;
                    return (
                      <motion.button
                        key={notif.id}
                        onClick={() => markRead(notif.id)}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                          hover:bg-cream-100 ${!notif.read ? "bg-brand-50" : ""}`}
                      >
                        {/* Icon */}
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconMap[notif.type].bg} flex-shrink-0 mt-0.5`}
                        >
                          <IconComp className={`h-4 w-4 ${iconMap[notif.type].color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-warm-700 text-sm font-semibold truncate">
                              {notif.title}
                            </p>
                            {!notif.read && (
                              <span className="h-2 w-2 rounded-full bg-brand-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-[#5c6069] text-xs mt-0.5 line-clamp-2">
                            {notif.body}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[#6e737b] text-[10px]">{notif.timestamp}</span>
                            {notif.actionLabel && (
                              <span className="text-brand-500 text-[10px] font-medium">
                                {notif.actionLabel} →
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
