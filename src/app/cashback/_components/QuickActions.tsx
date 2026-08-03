"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface QuickAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  accent: string;
}

const quickActions: QuickAction[] = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
      </svg>
    ),
    label: "Escanear\nFactura",
    onClick: () => {},
    accent: "from-blue-600 to-blue-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
    ),
    label: "Explorar\nTienda",
    onClick: () => {},
    accent: "from-amber-600 to-amber-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
      </svg>
    ),
    label: "Invitar\nProveedor",
    onClick: () => {},
    accent: "from-purple-600 to-purple-500",
  },
];

interface QuickActionsProps {
  onScanInvoice?: () => void;
  onBrowseStore?: () => void;
  onInviteSupplier?: () => void;
}

export function QuickActions({
  onScanInvoice,
  onBrowseStore,
  onInviteSupplier,
}: QuickActionsProps) {
  const handlers = [onScanInvoice, onBrowseStore, onInviteSupplier];

  return (
    <div className="mx-4 mt-5 grid grid-cols-3 gap-2.5">
      {quickActions.map((action, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 * i + 0.3, duration: 0.4 }}
          onClick={handlers[i]}
          className={`flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b ${action.accent} 
            bg-opacity-15 p-3.5 backdrop-blur-sm transition-all active:scale-95 
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
