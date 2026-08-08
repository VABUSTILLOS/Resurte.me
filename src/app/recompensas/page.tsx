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
import { getWalletBalance } from "@/lib/wallet-actions";
import type { Tab, ServiceItem } from "./_components/types";

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

  // Check auth state on mount
  useEffect(() => {
    if (!supabase) return
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
        // Always show onboarding for unauthenticated users
        setShowOnboarding(true);
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

  const handleServiceSelect = useCallback((service: ServiceItem) => {
    setSelectedService(service);
    setShowCheckout(true);
  }, []);

  const handleOpenCalculator = useCallback((service?: ServiceItem) => {
    if (service) setSelectedService(service);
    setShowCalculator(true);
  }, []);

  const handleNavigateStore = useCallback(() => {
    setActiveTab("store");
  }, []);

  const handleViewOrders = useCallback(() => {
    setActiveTab("wallet");
  }, []);

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
      <div className="relative mx-auto flex min-h-screen max-w-md items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const isFullScreen = showCalculator || showCheckout || showScanner || showOnboarding;
  const showShell = !isFullScreen;

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-gray-950 md:max-w-none md:flex-row">
      {/* Sidebar Navigation (Tablet/Desktop) */}
      {showShell && (
        <div className="hidden md:flex md:w-20 lg:w-64 md:flex-col md:border-r md:border-white/5 md:bg-gray-900/50 md:shrink-0">
          <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
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
            <div key="main" className="flex-1 overflow-y-auto pb-20 md:pb-0">
              {activeTab === "home" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  onNavigateStore={handleNavigateStore}
                  onViewOrders={handleViewOrders}
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
    </div>
    </MotionConfig>
  );
}
