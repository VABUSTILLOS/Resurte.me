"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { BottomTabBar } from "./_components/BottomTabBar";
import { DashboardScreen } from "./_components/DashboardScreen";
import { StoreScreen } from "./_components/StoreScreen";
import { ROICalculatorScreen } from "./_components/ROICalculatorScreen";
import { CheckoutFlowScreen } from "./_components/CheckoutFlowScreen";
import { ConfettiOverlay } from "./_components/ConfettiOverlay";
import { InvoiceScannerScreen } from "./_components/InvoiceScannerScreen";
import { OnboardingScreen } from "./_components/OnboardingScreen";
import type { Tab, ServiceItem } from "./_components/types";

export default function CashbackPage() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const balance = 12450;

  // Show onboarding on first visit (simulated)
  useEffect(() => {
    const onboarded = localStorage.getItem("cashback-onboarded");
    if (!onboarded) {
      setShowOnboarding(true);
    }
  }, []);

  const handleServiceSelect = useCallback((service: ServiceItem) => {
    setSelectedService(service);
    setShowCheckout(true);
  }, []);

  const handleOpenCalculator = useCallback((service?: ServiceItem) => {
    if (service) setSelectedService(service);
    setShowCalculator(true);
  }, []);

  const handleCheckoutComplete = useCallback(() => {
    setShowCheckout(false);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem("cashback-onboarded", "true");
  }, []);

  const isFullScreen = showCalculator || showCheckout || showScanner || showOnboarding;
  const showShell = !isFullScreen;

  return (
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
            <OnboardingScreen key="onboarding" onComplete={handleOnboardingComplete} />
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
            />
          ) : (
            <div key="main" className="flex-1 overflow-y-auto pb-24 md:pb-0">
              {activeTab === "home" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  onViewOrders={() => setShowScanner(true)}
                />
              )}
              {activeTab === "store" && (
                <StoreScreen
                  onServiceSelect={handleServiceSelect}
                  onOpenCalculator={handleOpenCalculator}
                />
              )}
              {activeTab === "wallet" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  walletView
                />
              )}
              {activeTab === "profile" && (
                <DashboardScreen
                  onOpenCalculator={handleOpenCalculator}
                  onServiceSelect={handleServiceSelect}
                  profileView
                />
              )}
            </div>
          )}
        </AnimatePresence>

        {/* Confetti */}
        {showConfetti && <ConfettiOverlay />}
      </div>
    </div>
  );
}
