"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface QuickAction {
  icon: ReactNode;
  label: string;
  id: "orders" | "store" | "invite";
  accent: string;
}

const quickActions: QuickAction[] = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
    label: "Mis\nPedidos",
    id: "orders",
    accent: "from-blue-600 to-blue-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
    ),
    label: "Tienda de\nCrecimiento",
    id: "store",
    accent: "from-amber-600 to-amber-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    label: "Invitar\nAmigo",
    id: "invite",
    accent: "from-purple-600 to-purple-500",
  },
];

interface QuickActionsProps {
  onViewOrders?: () => void;
  onBrowseStore?: () => void;
}

const INVITE_MESSAGE =
  "🚀 Te invito a Resurte.me — la plataforma donde tus compras de insumos para restaurante generan Créditos que puedes canjear por marketing digital, fotografía profesional, menús interactivos y más. ¡Crecer juntos sabe mejor! Únete aquí: https://resurte.me/invite";

export function QuickActions({ onViewOrders, onBrowseStore }: QuickActionsProps) {
  const handleInvite = async () => {
    const shareData = {
      title: "Resurte.me — Recompensas para tu restaurante",
      text: INVITE_MESSAGE,
    };

    // Try Web Share API first (supports WhatsApp on mobile)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or failed — fall through to manual options
      }
    }

    // Desktop / fallback: show WhatsApp + copy options
    const encoded = encodeURIComponent(INVITE_MESSAGE);
    const waUrl = `https://wa.me/?text=${encoded}`;
    const messengerUrl = `https://www.facebook.com/dialog/send?link=https://resurte.me/invite&app_id=0&redirect_uri=https://resurte.me`;

    const dialog = document.createElement("div");
    dialog.className =
      "fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4";
    dialog.innerHTML = `
      <div class="w-full max-w-sm rounded-2xl bg-gray-900 border border-white/10 p-5 mb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p class="text-white text-sm font-bold mb-4">Compartir con otro restaurantero</p>
        <div class="space-y-2">
          <a href="${waUrl}" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-xl bg-green-600/20 border border-green-500/30 p-3 text-white text-sm font-medium hover:bg-green-600/30 transition-colors">
            <span class="text-xl">💬</span> Compartir por WhatsApp
          </a>
          <a href="${messengerUrl}" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-xl bg-blue-600/20 border border-blue-500/30 p-3 text-white text-sm font-medium hover:bg-blue-600/30 transition-colors">
            <span class="text-xl">💬</span> Compartir por Messenger
          </a>
          <button id="invite-copy-link" class="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3 text-white text-sm font-medium hover:bg-white/10 transition-colors">
            <span class="text-xl">🔗</span> Copiar enlace de invitación
          </button>
        </div>
        <button id="invite-close" class="mt-4 w-full text-gray-500 text-sm py-2 hover:text-gray-400 transition-colors touch-target">Cancelar</button>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector("#invite-close")?.addEventListener("click", () => dialog.remove());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.remove();
    });
    dialog.querySelector("#invite-copy-link")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(INVITE_MESSAGE);
      dialog.remove();
      // Brief toast
      const toast = document.createElement("div");
      toast.className =
        "fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-emerald-600 px-5 py-2.5 text-white text-sm font-bold shadow-lg";
      toast.textContent = "✅ Enlace copiado";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    });
  };

  const handlers: Record<string, (() => void) | undefined> = {
    orders: onViewOrders,
    store: onBrowseStore,
    invite: handleInvite,
  };

  return (
    <div className="mx-4 mt-4 grid grid-cols-3 gap-2 md:mx-0 md:gap-3 lg:gap-4">
      {quickActions.map((action) => (
        <motion.button
          key={action.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 * quickActions.indexOf(action) + 0.3, duration: 0.4 }}
          onClick={handlers[action.id]}
        className={`flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-b ${action.accent} 
          bg-opacity-15 p-3 backdrop-blur-sm transition-all active:scale-95 
            border border-white/10 hover:border-white/20`}
        >
          <div className="text-white">{action.icon}</div>
          <span className="text-[10px] font-medium text-white text-center leading-tight whitespace-pre-line">
            {action.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
