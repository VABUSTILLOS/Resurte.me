"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Upload,
  CheckCircle,
  TrendingUp,
  FileText,
  FileImage,
  Scan,
  Sparkles,
  X,
  RefreshCcw,
} from "lucide-react";
import type { InvoiceScanState } from "./types";
import { CASHBACK_RATE } from "./types";
import { formatNumber } from "@/lib/money";

interface InvoiceScannerScreenProps {
  onClose: () => void;
  balance: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isAcceptedFile(file: File): { ok: boolean; isImage: boolean; isPdf: boolean } {
  const isImage = file.type.startsWith("image/");
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return { ok: isImage || isPdf, isImage, isPdf };
}

export function InvoiceScannerScreen({ onClose, balance }: InvoiceScannerScreenProps) {
  const [scanState, setScanState] = useState<InvoiceScanState>({
    status: "idle",
    progress: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Liberar el object URL cuando cambie el archivo o se desmonte el componente
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, []);

  const handleFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    const { ok, isImage } = isAcceptedFile(file);
    if (!ok) {
      setFileError("Formato no compatible. Sube una imagen (JPG, PNG) o un PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("El archivo supera los 10 MB. Elige una factura más ligera.");
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    setPreviewUrl(isImage ? URL.createObjectURL(file) : null);
  }, []);

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
            supplier: ["Distribuidora El Sol", "Carnes Selectas del Norte", "Frutas y Verduras del Valle", "Lácteos La Pradera"][Math.floor(Math.random() * 4)]!,
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

  const startScan = () => {
    if (!selectedFile) {
      setFileError("Primero selecciona un archivo o toma una foto de tu factura.");
      return;
    }
    simulateScan();
  };

  const reset = () => {
    setScanState({ status: "idle", progress: 0 });
    clearSelectedFile();
  };

  const cashbackRate = CASHBACK_RATE;
  const estimatedCashback = scanState.extracted
    ? Math.round(scanState.extracted.amount * cashbackRate)
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-cream-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-cream-300">
        <button
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="rounded-xl bg-cream-100 p-2 text-[#5c6069] hover:text-warm-700 transition-colors touch-target"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-warm-700 text-lg font-bold">Escanear Factura</h1>
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
              cameraInputRef={cameraInputRef}
              selectedFile={selectedFile}
              previewUrl={previewUrl}
              fileError={fileError}
              onFileSelected={handleFile}
              onRemoveFile={clearSelectedFile}
              onScan={startScan}
            />
          )}

          {scanState.status === "scanning" && (
            <ScanningState
              key="scanning"
              progress={scanState.progress}
              previewUrl={previewUrl}
              fileName={selectedFile?.name ?? null}
            />
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
  cameraInputRef,
  selectedFile,
  previewUrl,
  fileError,
  onFileSelected,
  onRemoveFile,
  onScan,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  previewUrl: string | null;
  fileError: string | null;
  onFileSelected: (file: File | undefined | null) => void;
  onRemoveFile: () => void;
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
      <div className="w-full rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-semibold text-amber-800 uppercase tracking-wider">
            Vista previa · Demo
          </span>
          <Sparkles className="h-4 w-4 text-brand-500" />
        </div>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 border border-brand-200 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <p className="text-warm-700 text-sm font-semibold">
              Cada factura suma a tu crecimiento
            </p>
            <p className="text-[#5c6069] text-xs mt-1">
              Por cada $1,000 en insumos comprobados, acumulas $50 Créditos en tu
              Cartera de Crecimiento. Sin límite.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-[10px] text-amber-800 leading-relaxed">
            ⓘ Esta pantalla es una demostración: los montos y recompensas mostrados
            son simulados y <span className="text-amber-700 font-semibold">no se acreditan créditos reales</span>.
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
              className="rounded-xl bg-white border border-cream-300 p-3 text-center shadow-sm"
            >
              <p className="text-brand-500 text-lg font-bold">{item.value}</p>
              <p className="text-[#6e737b] text-[10px] mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upload Zone */}
      <motion.div
        animate={{
          borderColor: dragOver
            ? "rgba(14, 122, 14, 0.6)"
            : "#e0dbd2",
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
          onFileSelected(e.dataTransfer.files?.[0]);
        }}
        className="w-full rounded-3xl border-2 border-dashed bg-white p-10 
          flex flex-col items-center justify-center cursor-pointer
          transition-colors hover:border-brand-500/40"
        onClick={() => fileInputRef.current?.click()}
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 border border-brand-200 mb-4"
        >
          <Upload className="h-10 w-10 text-brand-500" />
        </motion.div>
        <p className="text-warm-700 text-base font-semibold">
          Sube tu factura o ticket
        </p>
        <p className="text-[#5c6069] text-sm mt-1 text-center">
          Arrastra aquí o toca para buscar en tus archivos
        </p>
        <p className="text-[#6e737b] text-xs mt-3">PDF, JPG, PNG — máx 10MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            onFileSelected(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </motion.div>

      {/* Camera Button */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        className="mt-4 w-full rounded-2xl bg-white border border-cream-300 py-4 
          flex items-center justify-center gap-2 text-warm-700 font-medium shadow-sm
          hover:bg-cream-100 transition-colors active:scale-[0.98]"
      >
        <Camera className="h-5 w-5 text-brand-500" />
        Tomar foto de la factura
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* File error */}
      {fileError && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 w-full rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          {fileError}
        </motion.p>
      )}

      {/* Selected file preview */}
      {selectedFile && (
        <FilePreviewCard
          file={selectedFile}
          previewUrl={previewUrl}
          onRemove={onRemoveFile}
          onChangeFile={() => fileInputRef.current?.click()}
        />
      )}

      {/* Scan CTA */}
      <button
        onClick={onScan}
        disabled={!selectedFile}
        className={`mt-4 w-full rounded-2xl py-4 text-base font-bold transition-all active:scale-[0.98]
          flex items-center justify-center gap-2 ${
          selectedFile
            ? "bg-brand-500 text-white shadow-lg hover:bg-brand-600"
            : "bg-cream-100 text-[#6e737b] cursor-not-allowed"
        }`}
      >
        <Scan className="h-5 w-5" />
        Escanear factura
      </button>
      {!selectedFile && !fileError && (
        <p className="mt-2 text-[#6e737b] text-xs text-center">
          Selecciona un archivo o toma una foto para comenzar (demo)
        </p>
      )}

      {/* Recent scans placeholder */}
      <div className="mt-6 w-full">
        <p className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-3">
          Escaneos recientes
        </p>
        <div className="space-y-2">
          {[
            { name: "Pedido #1024 — Dist. El Sol", amount: 15000, date: "Hoy" },
            { name: "Pedido #1020 — Carnes Selectas", amount: 12400, date: "Ayer" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl bg-white border border-cream-300 p-3 shadow-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 border border-brand-200">
                <FileText className="h-4 w-4 text-brand-500" />
              </div>
              <div className="flex-1">
                <p className="text-warm-700 text-sm">{item.name}</p>
                <p className="text-[#6e737b] text-xs">{item.date}</p>
              </div>
              <span className="text-brand-500 text-sm font-bold tabular-nums">
                +${formatNumber(Math.round(item.amount * 0.05))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function FilePreviewCard({
  file,
  previewUrl,
  onRemove,
  onChangeFile,
}: {
  file: File;
  previewUrl: string | null;
  onRemove: () => void;
  onChangeFile: () => void;
}) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 w-full rounded-2xl bg-white border border-cream-300 p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        {previewUrl && !isPdf ? (
          <Image
            src={previewUrl}
            alt={`Vista previa de ${file.name}`}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 rounded-xl object-cover border border-cream-300 flex-shrink-0"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 border border-brand-200 flex-shrink-0">
            {isPdf ? (
              <FileText className="h-7 w-7 text-brand-500" />
            ) : (
              <FileImage className="h-7 w-7 text-brand-500" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-warm-700 text-sm font-semibold truncate">{file.name}</p>
          <p className="text-[#6e737b] text-xs mt-0.5">
            {isPdf ? "PDF" : "Imagen"} · {formatFileSize(file.size)}
          </p>
          <button
            onClick={onChangeFile}
            className="mt-1 text-brand-500 text-xs font-medium hover:underline"
          >
            Elegir otro archivo
          </button>
        </div>
        <button
          onClick={onRemove}
          aria-label="Quitar archivo seleccionado"
          className="rounded-xl bg-cream-100 p-2 text-[#5c6069] hover:text-warm-700 transition-colors touch-target flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function ScanningState({
  progress,
  previewUrl,
  fileName,
}: {
  progress: number;
  previewUrl?: string | null;
  fileName?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center pt-8"
    >
      {/* Animated scanner ring */}
      <div className="relative mb-8">
        <motion.div
          className="h-32 w-32 rounded-2xl border-2 border-brand-200 bg-brand-50 flex items-center justify-center overflow-hidden"
          animate={{ boxShadow: ["0 0 0px rgba(14,122,14,0)", "0 0 40px rgba(14,122,14,0.25)", "0 0 0px rgba(14,122,14,0)"] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Factura en análisis"
              width={128}
              height={128}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <Scan className="h-12 w-12 text-brand-500" />
          )}
        </motion.div>
        {/* Scanning line */}
        <motion.div
          className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent"
          animate={{ top: ["10%", "90%", "10%"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <h2 className="text-warm-700 text-lg font-bold">Analizando factura...</h2>
      <p className="text-[#5c6069] text-sm mt-1">Extrayendo datos relevantes</p>
      {fileName && (
        <p className="text-[#6e737b] text-xs mt-1 truncate max-w-xs">{fileName}</p>
      )}

      {/* Progress bar */}
      <div className="mt-6 w-full max-w-xs">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-[#6e737b]">Progreso</span>
          <span className="text-brand-500 font-bold tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-cream-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-brand-500"
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
            <div className={`h-2 w-2 rounded-full transition-colors ${step.done ? "bg-brand-500" : "bg-cream-300"}`} />
            <span className={`text-sm transition-colors ${step.done ? "text-warm-700" : "text-[#6e737b]"}`}>
              {step.label}
            </span>
            {step.done && <CheckCircle className="h-3.5 w-3.5 text-brand-500 ml-auto" />}
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
        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 border border-brand-200 mb-6"
      >
        <Sparkles className="h-10 w-10 text-brand-500" />
      </motion.div>
      <h2 className="text-warm-700 text-lg font-bold">Procesando datos</h2>
      <p className="text-[#5c6069] text-sm mt-1">Calculando tus recompensas...</p>

      {/* Pulse dots */}
      <div className="flex gap-2 mt-4">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-brand-500"
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
        className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 border border-brand-200 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          <CheckCircle className="h-12 w-12 text-brand-500" strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      <h2 className="text-warm-700 text-2xl font-black">¡Factura registrada!</h2>
      <p className="text-[#5c6069] text-sm mt-1">
        Recompensas simuladas (demo — no acreditadas a tu saldo)
      </p>

      <div className="mt-4 w-full rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
        <p className="text-[10px] text-amber-800 leading-relaxed">
          ⓘ Esta es una vista previa. Los créditos mostrados abajo son simulados y
          no han sido depositados en tu Cartera de Crecimiento.
        </p>
      </div>

      {/* Invoice details */}
      <div className="mt-6 w-full rounded-2xl bg-white border border-cream-300 p-5 shadow-sm">
        <div className="space-y-3">
          <DetailRow label="Proveedor" value={supplier} />
          <DetailRow label="Folio" value={folio} />
          <DetailRow label="Fecha" value={date} />
          <DetailRow
            label="Monto factura"
            value={`$${formatNumber(amount)} Créditos`}
          />
          <hr className="border-cream-300" />
          <DetailRow
            label="Recompensas generadas"
            value={`+$${formatNumber(cashback)} Créditos`}
            highlight
          />
          <DetailRow
            label="Nuevo saldo"
            value={`$${formatNumber(newBalance)} Créditos`}
            highlight
          />
        </div>
      </div>

      {/* Impact preview */}
      <div className="mt-4 w-full rounded-2xl bg-gradient-to-r from-brand-50 to-white border border-brand-200 p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-500" />
          <p className="text-brand-500 text-xs font-medium">
            Con estas recompensas estás más cerca de tu próxima campaña publicitaria
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 w-full space-y-3">
        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white 
            shadow-lg transition-all active:scale-[0.98] hover:bg-brand-600"
        >
          Volver al inicio
        </button>
        <button
          onClick={onScanAnother}
          className="w-full rounded-2xl bg-white border border-cream-300 py-4 
            flex items-center justify-center gap-2 text-warm-700 font-medium shadow-sm
            hover:bg-cream-100 transition-colors active:scale-[0.98]"
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
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 border border-red-200 mb-4">
        <X className="h-10 w-10 text-red-700" />
      </div>
      <h2 className="text-warm-700 text-lg font-bold">No se pudo leer la factura</h2>
      <p className="text-[#5c6069] text-sm mt-1 text-center max-w-xs">
        Asegúrate de que la imagen sea clara y que el folio fiscal sea visible.
      </p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-2xl bg-white border border-cream-300 px-8 py-3 text-warm-700 font-medium shadow-sm
          hover:bg-cream-100 transition-colors"
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
      <span className="text-[#5c6069] text-sm">{label}</span>
      <span
        className={`text-sm font-bold tabular-nums ${
          highlight ? "text-brand-500 text-lg" : "text-warm-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
