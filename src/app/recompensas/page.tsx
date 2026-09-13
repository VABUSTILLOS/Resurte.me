"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { getWalletBalance } from "@/lib/wallet-actions";
import { haptic } from "@/lib/haptics";
import type { Tab, ServiceItem } from "./_components/types";

const TAB_TITLES: Record<Tab, string> = {
  home: "Inicio",
  wallet: "Cartera",
  store: "Tienda",
  referidos: "Referidos",
  profile: "Perfil",
};

/** Distancia de jalón (px, tras amortiguar) que dispara el refresh. */
const PULL_REFRESH_THRESHOLD = 70;

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

  // Pull-to-refresh (patrón app nativa): jalar hacia abajo desde el tope del
  // scroll refresca el saldo real del monedero.
  const mainRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef<number | null>(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onPullStart = (e: React.TouchEvent) => {
    if (mainRef.current && mainRef.current.scrollTop <= 0) {
      pullStartY.current = e.touches[0]?.clientY ?? null;
    }
  };
  const onPullMove = (e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    const currentY = e.touches[0]?.clientY;
    if (currentY === undefined) return;
    const dy = currentY - pullStartY.current;
    // Resistencia 0.5x como iOS/Android nativos; tope visual de 90px.
    if (dy > 0 && mainRef.current && mainRef.current.scrollTop <= 0) {
      setPullY(Math.min(dy * 0.5, 90));
    }
  };
  const onPullEnd = async () => {
    if (pullY > PULL_REFRESH_THRESHOLD && isAuthenticated && !refreshing) {
      setRefreshing(true);
      haptic(12);
      try {
        const wallet = await getWalletBalance();
        if (wallet) setBalance(Number(wallet.balance_credits));
      } finally {
        setRefreshing(false);
      }
    }
    setPullY(0);
    pullStartY.current = null;
  };

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

        // Only show onboarding if user hasn't completed it before
        const onboarded = localStorage.getItem("cashback-onboarded");
        if (!onboarded) setShowOnboarding(true);
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
              balance={balance}
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
            <div
              key="main"
              ref={mainRef}
              onTouchStart={onPullStart}
              onTouchMove={onPullMove}
              onTouchEnd={onPullEnd}
              className="flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
            >
              {/* Indicador de pull-to-refresh */}
              {(pullY > 0 || refreshing) && (
                <div
                  className="flex justify-center overflow-hidden transition-[height] duration-150"
                  style={{ height: refreshing ? 40 : Math.min(pullY * 0.6, 40) }}
                  aria-hidden="true"
                >
                  <div
                    className={`h-6 w-6 my-2 rounded-full border-2 border-brand-500 border-t-transparent ${refreshing ? "animate-spin" : ""}`}
                    style={!refreshing ? { transform: `rotate(${pullY * 3}deg)` } : undefined}
                  />
                </div>
              )}
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
