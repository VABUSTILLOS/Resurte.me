"use client";

import { Home, Wallet, Store, User } from "lucide-react";
import { motion } from "framer-motion";
import type { Tab } from "./types";

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "wallet", label: "Cartera", icon: Wallet },
  { id: "store", label: "Tienda", icon: Store },
  { id: "profile", label: "Perfil", icon: User },
];

export function BottomTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
      <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-xl px-2 py-2 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-around">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex flex-col items-center gap-1 px-3 py-1.5"
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-xl bg-emerald-500/20 border border-emerald-500/30"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <tab.icon
                  className={`relative z-10 h-5 w-5 transition-colors ${
                    isActive ? "text-emerald-400" : "text-gray-500"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={`relative z-10 text-[10px] font-medium transition-colors ${
                    isActive ? "text-emerald-400" : "text-gray-500"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
