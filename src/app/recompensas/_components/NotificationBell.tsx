"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, TrendingUp, Star, Megaphone, Gift, Sparkles } from "lucide-react";
import type { Notification } from "./types";

const iconMap: Record<Notification["type"], { icon: typeof Bell; bg: string; color: string }> = {
  cashback_earned: { icon: TrendingUp, bg: "bg-brand-50", color: "text-brand-500" },
  milestone: { icon: Star, bg: "bg-amber-50", color: "text-amber-700" },
  service_ready: { icon: Megaphone, bg: "bg-sky-50", color: "text-sky-700" },
  service_update: { icon: Sparkles, bg: "bg-violet-50", color: "text-violet-700" },
  new_feature: { icon: Gift, bg: "bg-pink-50", color: "text-pink-700" },
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  // Sin data fake: no existe tabla de notificaciones en Supabase.
  // Arranca vacío y mostrará el estado "No hay notificaciones".
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

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

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
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
                <button
                  onClick={markAllRead}
                  className="text-brand-500 text-xs font-medium hover:underline"
                >
                  Marcar todo leído
                </button>
              </div>

              {/* List */}
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-cream-300">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <Bell className="h-10 w-10 text-cream-300 mx-auto mb-3" />
                    <p className="text-[#6e737b] text-sm">No hay notificaciones</p>
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
