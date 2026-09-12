"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BottomTabBar } from "./_components/BottomTabBar";
import { DashboardScreen } from "./_components/DashboardScreen";
import { StoreScreen } from "./_components/StoreScreen";
import { ROICalculatorScreen } from "./_components/ROICalculatorScreen";
import { CheckoutFlowScreen } from "./_components/CheckoutFlowScreen";
import { ConfettiOverlay } from "./_components/ConfettiOverlay";
import { InvoiceScannerScreen } from "./_components/InvoiceScannerScreen";
import { OnboardingScreen } from "./_components/OnboardingScreen";
import { getWalletBalance, getRewardsOnboarded, markRewardsOnboarded } from "@/lib/wallet-actions";
import type { Tab, ServiceItem } from "./_components/types";

const TAB_TITLES: Record<Tab, string> = {
  home: "Inicio",
  wallet: "Cartera",
  store: "Tienda",
  referidos: "Referidos",
  profile: "Perfil",
};

export default function CashbackPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "home";
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()));

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [balance, setBalance] = useState(0);

  // Cambio de tab: además del estado local, sincroniza ?tab= en la URL
  // (replaceState) para que un reload o compartir el link conserve la
  // sección — la app solo leía el param en el primer render. Además sube el
  // scroll al inicio (patrón de app: cada sección empieza desde arriba).
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const url =
      tab === "home"
        ? window.location.pathname
        : `${window.location.pathname}?tab=${tab}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  // Título del documento por sección: con varias pestañas abiertas (o en el
  // historial del navegador) el usuario distingue en qué parte de
  // Recompensas estaba.
  useEffect(() => {
    const prev = document.title;
    document.title = `${TAB_TITLES[activeTab]} · Recompensas — Resurte.me`;
    return () => {
      document.title = prev;
    };
  }, [activeTab]);

  // Check auth state on mount
  useEffect(() => {
    if (!supabase) {
      // Supabase no configurado (dev/preview sin secrets): degradar con gracia
      // mostrando el onboarding como a un visitante no autenticado.
      const t = setTimeout(() => {
        setIsAuthenticated(false);
        const onboarded = localStorage.getItem("cashback-onboarded");
        if (!onboarded) setShowOnboarding(true);
      }, 0);
      return () => clearTimeout(t);
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authed = !!session;
      setIsAuthenticated(authed);
      if (authed) {
        // Fetch real wallet balance via server action
        getWalletBalance().then((wallet) => {
          if (wallet) setBalance(Number(wallet.balance_credits))
        })

        // Onboarding: localStorage o, con sesión, la marca persistente del
        // perfil (sobrevive entre dispositivos). Si el servidor dice que ya
        // se completó, se sella localmente y no se vuelve a mostrar.
        const onboarded = localStorage.getItem("cashback-onboarded");
        if (!onboarded) {
          getRewardsOnboarded().then((serverOnboarded) => {
            if (serverOnboarded) {
              localStorage.setItem("cashback-onboarded", "true");
            } else if (serverOnboarded === false) {
              setShowOnboarding(true);
            } else {
              // Sin dato del servidor (sin migración/offline): fallback local
              setShowOnboarding(true);
            }
          });
        }
      } else {
        // Visitantes: onboarding solo en la primera visita; pueden
        // "Explorar sin cuenta" y volver a verlo desde Perfil.
        const onboarded = localStorage.getItem("cashback-onboarded");
        if (!onboarded) setShowOnboarding(true);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const authed = !!session;
      setIsAuthenticated(authed);
      if (authed) {
        const onboarded = localStorage.getItem("cashback-onboarded");
        if (!onboarded) setShowOnboarding(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Saldo fresco al volver a la pestaña: si el usuario canjeó en otro
  // dispositivo o el cashback de un pedido cayó mientras la app estaba en
  // background, al regresar (visibilitychange) se refetchea el balance real.
  useEffect(() => {
    if (!isAuthenticated) return
    const refresh = () => {
      if (document.visibilityState === "visible") {
        getWalletBalance().then((wallet) => {
          if (wallet) setBalance(Number(wallet.balance_credits))
        })
      }
    }
    document.addEventListener("visibilitychange", refresh)
    return () => document.removeEventListener("visibilitychange", refresh)
  }, [isAuthenticated]);

  const handleServiceSelect = useCallback((service: ServiceItem) => {
    setSelectedService(service);
    setShowCheckout(true);
  }, []);

  const handleOpenCalculator = useCallback((service?: ServiceItem) => {
    if (service) setSelectedService(service);
    setShowCalculator(true);
  }, []);

  const handleNavigateStore = useCallback(() => {
    handleTabChange("store");
  }, [handleTabChange]);

  const handleViewOrders = useCallback(() => {
    handleTabChange("wallet");
  }, [handleTabChange]);

  const handleCheckoutComplete = useCallback((newBalance?: number) => {
    setShowCheckout(false);
    if (typeof newBalance === "number") setBalance(newBalance);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem("cashback-onboarded", "true");
    // Persistencia server-side (no-op para visitantes).
    void markRewardsOnboarded();
  }, []);

  // Show nothing while checking auth state
  if (isAuthenticated === null) {
    return (
      <div className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const isFullScreen = showCalculator || showCheckout || showScanner || showOnboarding;
  const showShell = !isFullScreen;

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col sm:max-w-2xl md:max-w-6xl md:flex-row xl:max-w-7xl">
      {/* Sidebar Navigation (Tablet/Desktop) */}
      {showShell && (
        <div className="hidden md:flex md:w-20 lg:w-64 md:flex-col md:border-r md:border-cream-300 md:bg-white/60 md:shrink-0">
          <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Full Screen Views */}
        <AnimatePresence mode="wait">
          {showOnboarding ? (
            <OnboardingScreen key="onboarding" onComplete={handleOnboardingComplete} isAuthenticated={!!isAuthenticated} />
          ) : showScanner ? (
            <InvoiceScannerScreen
              key="scanner"
              onClose={() => setShowScanner(false)}
            />
          ) : showCalculator ? (
            <ROICalculatorScreen
              key="calculator"
              preselectedService={selectedService}
              onClose={() => setShowCalculator(false)}
            />
          ) : showCheckout && selectedService ? (
            <CheckoutFlowScreen
              key="checkout"
              service={selectedService}
              onBack={() => setShowCheckout(false)}
              onComplete={handleCheckoutComplete}
              balance={balance}
            />
          ) : (
            <div key="main" className="flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
              {activeTab === "home" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  onNavigateStore={handleNavigateStore}
                  onViewOrders={handleViewOrders}
                  onScanInvoice={() => setShowScanner(true)}
                  balance={balance}
                />
              )}
              {activeTab === "store" && (
                <StoreScreen
                  onServiceSelect={handleServiceSelect}
                  onOpenCalculator={handleOpenCalculator}
                  balance={balance}
                />
              )}
              {activeTab === "wallet" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  walletView
                  balance={balance}
                />
              )}
              {activeTab === "profile" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  onShowOnboarding={() => setShowOnboarding(true)}
                  profileView
                />
              )}
              {activeTab === "referidos" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  referralView
                />
              )}
            </div>
          )}
        </AnimatePresence>

        {/* Confetti */}
        {showConfetti && <ConfettiOverlay />}
      </div>

      {/* Tab bar móvil: también usa handleTabChange para sincronizar la URL */}
      {showShell && (
        <div className="md:hidden">
          <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      )}
    </div>
    </MotionConfig>
  );
}
