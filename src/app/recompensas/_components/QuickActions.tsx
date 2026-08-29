"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface QuickAction {
  icon: ReactNode;
  label: string;
  id: "orders" | "store" | "invite" | "scanner";
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
    accent: "text-blue-600",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
    ),
    label: "Tienda de\nCrecimiento",
    id: "store",
    accent: "text-amber-600",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    label: "Invitar\nAmigo",
    id: "invite",
    accent: "text-purple-600",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
      </svg>
    ),
    label: "Escanear\nFactura",
    id: "scanner",
    accent: "text-brand-500",
  },
];

interface QuickActionsProps {
  onViewOrders?: () => void;
  onBrowseStore?: () => void;
  onScanInvoice?: () => void;
}

const INVITE_MESSAGE =
  "🚀 Te invito a Resurte.me — la plataforma donde tus compras de insumos para restaurante generan Créditos que puedes canjear por marketing digital, fotografía profesional, menús interactivos y más. ¡Crecer juntos sabe mejor! Únete aquí: https://resurte.me/invite";

export function QuickActions({ onViewOrders, onBrowseStore, onScanInvoice }: QuickActionsProps) {
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
      <div class="w-full max-w-sm rounded-2xl bg-white border border-cream-300 shadow-lg p-5 mb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p class="text-warm-700 text-sm font-bold mb-4">Compartir con otro restaurantero</p>
        <div class="space-y-2">
          <a href="${waUrl}" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-200 p-3 text-brand-600 text-sm font-medium hover:bg-brand-100 transition-colors">
            <span class="text-xl">💬</span> Compartir por WhatsApp
          </a>
          <a href="${messengerUrl}" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 p-3 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
            <span class="text-xl">💬</span> Compartir por Messenger
          </a>
          <button id="invite-copy-link" class="w-full flex items-center gap-3 rounded-xl bg-cream-100 border border-cream-300 p-3 text-warm-700 text-sm font-medium hover:bg-cream-200 transition-colors">
            <span class="text-xl">🔗</span> Copiar enlace de invitación
          </button>
        </div>
        <button id="invite-close" class="mt-4 w-full text-[#5c6069] text-sm py-2 hover:text-warm-700 transition-colors touch-target">Cancelar</button>
      </div>
    `;
    document.body.appendChild(dialog);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    const closeDialog = () => {
      dialog.remove();
      document.removeEventListener("keydown", onKeyDown);
    };
    dialog.querySelector("#invite-close")?.addEventListener("click", closeDialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeDialog();
    });
    document.addEventListener("keydown", onKeyDown);
    dialog.querySelector("#invite-copy-link")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(INVITE_MESSAGE);
      closeDialog();
      // Brief toast
      const toast = document.createElement("div");
      toast.className =
        "fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-brand-500 px-5 py-2.5 text-white text-sm font-bold shadow-lg";
      toast.textContent = "✅ Enlace copiado";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    });
  };

  const handlers: Record<string, (() => void) | undefined> = {
    orders: onViewOrders,
    store: onBrowseStore,
    invite: handleInvite,
    scanner: onScanInvoice,
  };

  return (
    <div className="mx-4 mt-4 grid grid-cols-4 gap-2 md:mx-0 md:gap-3 lg:gap-4">
      {quickActions.map((action) => (
        <motion.button
          key={action.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 * quickActions.indexOf(action) + 0.3, duration: 0.4 }}
          onClick={handlers[action.id]}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-white
          p-3 shadow-sm transition-all active:scale-95
            border border-cream-300 hover:bg-cream-100"
        >
          <div className={action.accent}>{action.icon}</div>
          <span className="text-[10px] font-medium text-warm-700 text-center leading-tight whitespace-pre-line">
            {action.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
