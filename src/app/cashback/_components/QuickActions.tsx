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
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
    label: "Mis\nPedidos",
    onClick: () => {},
    accent: "from-blue-600 to-blue-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
    ),
    label: "Tienda de\nCrecimiento",
    onClick: () => {},
    accent: "from-amber-600 to-amber-500",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    label: "Invitar\nAmigo",
    onClick: () => {},
    accent: "from-purple-600 to-purple-500",
  },
];

interface QuickActionsProps {
  onViewOrders?: () => void;
  onBrowseStore?: () => void;
  onInviteFriend?: () => void;
}

export function QuickActions({
  onViewOrders,
  onBrowseStore,
  onInviteFriend,
}: QuickActionsProps) {
  const handlers = [onViewOrders, onBrowseStore, onInviteFriend];

  return (
    <div className="mx-4 mt-5 grid grid-cols-3 gap-2.5 md:mx-0 md:gap-3 lg:gap-4">
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
