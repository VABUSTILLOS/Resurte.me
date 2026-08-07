"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Upload,
  CheckCircle,
  TrendingUp,
  FileText,
  Scan,
  Sparkles,
  X,
  RefreshCcw,
} from "lucide-react";
import type { InvoiceScanState } from "./types";

interface InvoiceScannerScreenProps {
  onClose: () => void;
  balance: number;
}

export function InvoiceScannerScreen({ onClose, balance }: InvoiceScannerScreenProps) {
  const [scanState, setScanState] = useState<InvoiceScanState>({
    status: "idle",
    progress: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateScan = useCallback(() => {
    setScanState({ status: "scanning", progress: 0 });

    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setScanState({ status: "extracting", progress: 100 });

        // Simulate extraction completion
        setTimeout(() => {
          const mockData = {
            supplier: ["Distribuidora El Sol", "Carnes Selectas del Norte", "Frutas y Verduras del Valle", "Lácteos La Pradera"][Math.floor(Math.random() * 4)],
            amount: Math.round(Math.random() * 25000 + 5000),
            date: new Date().toLocaleDateString("es-MX"),
            folio: `FAC-${String(Math.floor(Math.random() * 9000) + 1000)}`,
          };
          setScanState({
            status: "success",
            progress: 100,
            extracted: mockData,
          });
        }, 1500);
      } else {
        setScanState({ status: "scanning", progress: Math.round(progress) });
      }
    }, 200);
  }, []);

  const reset = () => {
    setScanState({ status: "idle", progress: 0 });
  };

  const cashbackRate = 0.05;
  const estimatedCashback = scanState.extracted
    ? Math.round(scanState.extracted.amount * cashbackRate)
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
        <button
          onClick={onClose}
          className="rounded-xl bg-white/5 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-white text-lg font-bold">Escanear Factura</h1>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {scanState.status === "idle" && (
            <IdleState
              key="idle"
              dragOver={dragOver}
              setDragOver={setDragOver}
              fileInputRef={fileInputRef}
              onScan={simulateScan}
            />
          )}

          {scanState.status === "scanning" && (
            <ScanningState key="scanning" progress={scanState.progress} />
          )}

          {scanState.status === "extracting" && (
            <ExtractingState key="extracting" />
          )}

          {scanState.status === "success" && scanState.extracted && (
            <SuccessState
              key="success"
              supplier={scanState.extracted.supplier}
              amount={scanState.extracted.amount}
              date={scanState.extracted.date}
              folio={scanState.extracted.folio}
              cashback={estimatedCashback}
              newBalance={balance + estimatedCashback}
              onClose={onClose}
              onScanAnother={reset}
            />
          )}

          {scanState.status === "error" && (
            <ErrorState key="error" onRetry={reset} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IdleState({
  dragOver,
  setDragOver,
  fileInputRef,
  onScan,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onScan: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center"
    >
      {/* Info Card */}
      <div className="w-full rounded-2xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border border-emerald-500/20 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="rounded-full bg-amber-500/15 border border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
            Vista previa · Demo
          </span>
          <Sparkles className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">
              Cada factura suma a tu crecimiento
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Por cada $1,000 en insumos comprobados, acumulas $50 Créditos en tu
              Cartera de Crecimiento. Sin límite.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white/5 border border-white/5 px-3 py-2">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            ⓘ Esta pantalla es una demostración: los montos y recompensas mostrados
            son simulados y <span className="text-amber-400/80">no se acreditan créditos reales</span>.
            La carga de facturas por OCR estará disponible próximamente.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { value: "5%", label: "Recompensas" },
            { value: "24h", label: "Validación" },
            { value: "Sin tope", label: "Acumulación" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-white/5 border border-white/5 p-3 text-center"
            >
              <p className="text-emerald-400 text-lg font-bold">{item.value}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upload Zone */}
      <motion.div
        animate={{
          borderColor: dragOver
            ? "rgba(16, 185, 129, 0.6)"
            : "rgba(255, 255, 255, 0.1)",
          scale: dragOver ? 1.02 : 1,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onScan();
        }}
        className="w-full rounded-3xl border-2 border-dashed bg-white/5 p-10 
          flex flex-col items-center justify-center cursor-pointer
          transition-colors hover:border-emerald-500/30"
        onClick={() => fileInputRef.current?.click()}
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 mb-4"
        >
          <Upload className="h-10 w-10 text-emerald-400" />
        </motion.div>
        <p className="text-white text-base font-semibold">
          Sube tu factura o ticket
        </p>
        <p className="text-gray-500 text-sm mt-1 text-center">
          Arrastra aquí o toca para buscar en tus archivos
        </p>
        <p className="text-gray-600 text-xs mt-3">PDF, JPG, PNG — máx 10MB</p>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onScan} />
      </motion.div>

      {/* Camera Button */}
      <button
        onClick={onScan}
        className="mt-4 w-full rounded-2xl bg-white/5 border border-white/10 py-4 
          flex items-center justify-center gap-2 text-white font-medium
          hover:bg-white/10 transition-colors active:scale-[0.98]"
      >
        <Camera className="h-5 w-5 text-emerald-400" />
        Tomar foto de la factura
      </button>

      {/* Recent scans placeholder */}
      <div className="mt-6 w-full">
        <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-3">
          Escaneos recientes
        </p>
        <div className="space-y-2">
          {[
            { name: "Pedido #1024 — Dist. El Sol", amount: 15000, date: "Hoy" },
            { name: "Pedido #1020 — Carnes Selectas", amount: 12400, date: "Ayer" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
                <FileText className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm">{item.name}</p>
                <p className="text-gray-500 text-xs">{item.date}</p>
              </div>
              <span className="text-emerald-400 text-sm font-bold tabular-nums">
                +${Math.round(item.amount * 0.05).toLocaleString("es-MX")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ScanningState({ progress }: { progress: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center pt-8"
    >
      {/* Animated scanner ring */}
      <div className="relative mb-8">
        <motion.div
          className="h-32 w-32 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center"
          animate={{ boxShadow: ["0 0 0px rgba(16,185,129,0)", "0 0 40px rgba(16,185,129,0.3)", "0 0 0px rgba(16,185,129,0)"] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Scan className="h-12 w-12 text-emerald-400" />
        </motion.div>
        {/* Scanning line */}
        <motion.div
          className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
          animate={{ top: ["10%", "90%", "10%"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <h2 className="text-white text-lg font-bold">Analizando factura...</h2>
      <p className="text-gray-400 text-sm mt-1">Extrayendo datos relevantes</p>

      {/* Progress bar */}
      <div className="mt-6 w-full max-w-xs">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-gray-500">Progreso</span>
          <span className="text-emerald-400 font-bold tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="mt-6 w-full space-y-2">
        {[
          { label: "Detección de documento", done: progress > 20 },
          { label: "Reconocimiento de proveedor", done: progress > 50 },
          { label: "Extracción de montos", done: progress > 75 },
          { label: "Validación de datos", done: progress > 95 },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3 px-1">
            <div className={`h-2 w-2 rounded-full transition-colors ${step.done ? "bg-emerald-400" : "bg-gray-700"}`} />
            <span className={`text-sm transition-colors ${step.done ? "text-white" : "text-gray-600"}`}>
              {step.label}
            </span>
            {step.done && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ExtractingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center pt-8"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 mb-6"
      >
        <Sparkles className="h-10 w-10 text-emerald-400" />
      </motion.div>
      <h2 className="text-white text-lg font-bold">Procesando datos</h2>
      <p className="text-gray-400 text-sm mt-1">Calculando tus recompensas...</p>

      {/* Pulse dots */}
      <div className="flex gap-2 mt-4">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-emerald-400"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function SuccessState({
  supplier,
  amount,
  date,
  folio,
  cashback,
  newBalance,
  onClose,
  onScanAnother,
}: {
  supplier: string;
  amount: number;
  date: string;
  folio: string;
  cashback: number;
  newBalance: number;
  onClose: () => void;
  onScanAnother: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center"
    >
      {/* Success icon */}
      <motion.div
        className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/20 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          <CheckCircle className="h-12 w-12 text-emerald-400" strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      <h2 className="text-white text-2xl font-black">¡Factura registrada!</h2>
      <p className="text-gray-400 text-sm mt-1">
        Recompensas simuladas (demo — no acreditadas a tu saldo)
      </p>

      <div className="mt-4 w-full rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
        <p className="text-[10px] text-amber-400/80 leading-relaxed">
          ⓘ Esta es una vista previa. Los créditos mostrados abajo son simulados y
          no han sido depositados en tu Cartera de Crecimiento.
        </p>
      </div>

      {/* Invoice details */}
      <div className="mt-6 w-full rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="space-y-3">
          <DetailRow label="Proveedor" value={supplier} />
          <DetailRow label="Folio" value={folio} />
          <DetailRow label="Fecha" value={date} />
          <DetailRow
            label="Monto factura"
            value={`$${amount.toLocaleString("es-MX")} Créditos`}
          />
          <hr className="border-white/10" />
          <DetailRow
            label="Recompensas generadas"
            value={`+$${cashback.toLocaleString("es-MX")} Créditos`}
            highlight
          />
          <DetailRow
            label="Nuevo saldo"
            value={`$${newBalance.toLocaleString("es-MX")} Créditos`}
            highlight
          />
        </div>
      </div>

      {/* Impact preview */}
      <div className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/15 p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <p className="text-emerald-400 text-xs font-medium">
            Con estas recompensas estás más cerca de tu próxima campaña publicitaria
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 w-full space-y-3">
        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white 
            shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98] hover:bg-emerald-500"
        >
          Volver al inicio
        </button>
        <button
          onClick={onScanAnother}
          className="w-full rounded-2xl bg-white/5 border border-white/10 py-4 
            flex items-center justify-center gap-2 text-white font-medium
            hover:bg-white/10 transition-colors active:scale-[0.98]"
        >
          <RefreshCcw className="h-4 w-4" />
          Escanear otra factura
        </button>
      </div>
    </motion.div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center pt-12"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 mb-4">
        <X className="h-10 w-10 text-red-400" />
      </div>
      <h2 className="text-white text-lg font-bold">No se pudo leer la factura</h2>
      <p className="text-gray-400 text-sm mt-1 text-center max-w-xs">
        Asegúrate de que la imagen sea clara y que el folio fiscal sea visible.
      </p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-2xl bg-white/5 border border-white/10 px-8 py-3 text-white font-medium
          hover:bg-white/10 transition-colors"
      >
        Intentar de nuevo
      </button>
    </motion.div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm">{label}</span>
      <span
        className={`text-sm font-bold tabular-nums ${
          highlight ? "text-emerald-400 text-lg" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
