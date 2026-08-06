"use client";

import { Home, Wallet, Store, User, Users } from "lucide-react";
import { motion } from "framer-motion";
import type { Tab } from "./types";

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "wallet", label: "Cartera", icon: Wallet },
  { id: "store", label: "Tienda", icon: Store },
  { id: "referidos", label: "Referidos", icon: Users },
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
    <>
      {/* Mobile: fixed bottom bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 md:hidden">
        <div className="mx-3 mb-[calc(0.75rem+env(safe-area-inset-bottom))] rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-xl px-2 py-2 shadow-2xl shadow-black/40">
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
                      layoutId="tab-indicator-mobile"
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

      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:flex md:flex-col md:h-full md:justify-start md:pt-8 md:gap-1 md:px-3">
        <div className="hidden lg:block mb-8 px-3">
          <span className="text-lg font-bold text-emerald-400 tracking-tight">Resurte</span>
          <span className="text-lg font-bold text-white tracking-tight">.me</span>
        </div>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all group ${
                isActive
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : "hover:bg-white/5 border border-transparent"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator-desktop"
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-emerald-400"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon
                className={`h-5 w-5 transition-colors shrink-0 ${
                  isActive ? "text-emerald-400" : "text-gray-500 group-hover:text-gray-300"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`hidden lg:block text-sm font-medium transition-colors ${
                  isActive ? "text-emerald-400" : "text-gray-500 group-hover:text-gray-300"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
