"use client";

import { motion } from "framer-motion";
import { GrowthWalletBanner } from "./GrowthWalletBanner";
import { QuickActions } from "./QuickActions";
import { ActivityFeed } from "./ActivityFeed";
import { NotificationBell } from "./NotificationBell";
import { ImpactStories } from "./ImpactStories";
import type { ServiceItem } from "./types";

interface DashboardScreenProps {
  onOpenCalculator: (service?: ServiceItem) => void;
  onServiceSelect: (service: ServiceItem) => void;
  onScanInvoice?: () => void;
  walletView?: boolean;
  profileView?: boolean;
}

export function DashboardScreen({
  onOpenCalculator,
  onServiceSelect,
  onScanInvoice,
  walletView,
  profileView,
}: DashboardScreenProps) {
  if (walletView) {
    return <WalletView />;
  }
  if (profileView) {
    return <ProfileView />;
  }

  return (
    <div className="pt-2 pb-6">
      {/* Top Header with Notifications */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <p className="text-gray-400 text-xs">Buenos días</p>
          <p className="text-white text-lg font-bold">Taquería El Pariente 🌅</p>
        </div>
        <NotificationBell />
      </div>

      <GrowthWalletBanner
        balance={12450}
        nextUnlock={{
          name: "Campaña Meta Ads — Nivel Intermedio",
          cost: 16000,
          progressPercent: 72,
        }}
      />

      <QuickActions
        onScanInvoice={onScanInvoice}
        onBrowseStore={() => onServiceSelect}
      />

      <ActivityFeed />

      {/* Impact Teaser */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="mx-4 mt-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 
          border border-emerald-500/15 p-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">
              Con tu consumo actual, en 3 meses desbloqueas tu Campaña Meta Ads
            </p>
            <button
              onClick={() => onOpenCalculator()}
              className="mt-1.5 text-emerald-400 text-xs font-medium hover:underline"
            >
              Calcular proyección exacta →
            </button>
          </div>
        </div>
      </motion.div>

      {/* Impact Stories Carousel */}
      <ImpactStories />
    </div>
  );
}

function WalletView() {
  const monthlySpend = 32000;
  const cashbackRate = 0.05;
  const monthlyCashback = monthlySpend * cashbackRate;

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-white text-xl font-bold mb-5">Mi Cartera</h1>

      {/* Balance Card */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wider">Saldo Total</p>
        <p className="text-white text-4xl font-black tabular-nums mt-1">
          $12,450 <span className="text-xl text-gray-400">MXN</span>
        </p>

        {/* Monthly Breakdown */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/15 p-3">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider">Cashback este mes</p>
            <p className="text-emerald-400 text-lg font-bold tabular-nums mt-0.5">
              +${monthlyCashback.toLocaleString("es-MX")}
            </p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/15 p-3">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider">Pendiente validar</p>
            <p className="text-amber-400 text-lg font-bold tabular-nums mt-0.5">$1,020</p>
          </div>
        </div>
      </div>

      {/* Progress bar - monthly spending to cashback */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
        <p className="text-white text-sm font-semibold mb-3">Tus compras vs. tu cashback</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Compras del mes</span>
              <span className="text-white font-medium">${monthlySpend.toLocaleString("es-MX")}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-emerald-600"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Cashback generado</span>
              <span className="text-emerald-400 font-medium">${monthlyCashback.toLocaleString("es-MX")}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${cashbackRate * 100}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Growth Timeline Chart placeholder */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <p className="text-white text-sm font-semibold mb-4">Historial de Crecimiento</p>
        <div className="flex items-end gap-2 h-32">
          {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul"].map((month, i) => {
            const heights = [15, 25, 20, 35, 45, 55, 72];
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1.5">
                <motion.div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400"
                  initial={{ height: 0 }}
                  animate={{ height: heights[i] }}
                  transition={{ delay: 0.1 * i + 0.6, duration: 0.5 }}
                />
                <span className="text-[10px] text-gray-500">{month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProfileView() {
  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-white text-xl font-bold mb-5">Mi Perfil</h1>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl font-bold">
            TP
          </div>
          <div>
            <p className="text-white font-bold text-lg">Taquería El Pariente</p>
            <p className="text-gray-400 text-sm">Cocina Mexicana · CDMX</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <ProfileRow label="Proveedores vinculados" value="3" />
        <ProfileRow label="Servicios canjeados" value="2" />
        <ProfileRow label="Meses en el programa" value="8" />
        <ProfileRow label="Total cashback acumulado" value="$34,200 MXN" />
      </div>

      <div className="mt-6 rounded-2xl bg-gradient-to-br from-purple-600/20 to-purple-800/20 border border-purple-500/15 p-4">
        <p className="text-white text-sm font-semibold">🎁 Invita a otro restaurantero</p>
        <p className="text-gray-400 text-xs mt-1">
          Gana $500 MXN extra en tu cartera por cada amigo que se una y registre su primera factura.
        </p>
        <button className="mt-3 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-transform">
          Compartir invitación
        </button>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/5 p-4">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}
