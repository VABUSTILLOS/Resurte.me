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
import { createClient } from "@/lib/supabase/client";

interface InvoiceScannerScreenProps {
  onClose: () => void;
}

/** Envío registrado en invoice_submissions (migración 00071). */
interface InvoiceSubmission {
  id: number;
  total_amount: number | null;
  status: "pending" | "approved" | "rejected";
  credits_granted: number | null;
  created_at: string;
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

export function InvoiceScannerScreen({ onClose }: InvoiceScannerScreenProps) {
  const [scanState, setScanState] = useState<InvoiceScanState>({
    status: "idle",
    progress: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Monto capturado por el usuario (opcional): orienta la revisión admin y
  // la estimación de créditos. La acreditación real ocurre al aprobar.
  const [totalInput, setTotalInput] = useState("");
  const [submissions, setSubmissions] = useState<InvoiceSubmission[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Mis envíos anteriores (revisión real, no demo).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/recompensas/facturas", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { submissions?: InvoiceSubmission[] } | null) => {
        if (!cancelled && data?.submissions) setSubmissions(data.submissions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scanState.status]);

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

  /**
   * Flujo real: sube el archivo a Storage (bucket `facturas`, carpeta del
   * usuario con RLS) y registra el envío para revisión admin. Los créditos
   * se acreditan al APROBAR (grant_wallet_credit) — nada se simula.
   */
  const submitInvoice = useCallback(async () => {
    if (!selectedFile) {
      setFileError("Primero selecciona un archivo o toma una foto de tu factura.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setScanState({
        status: "error",
        progress: 0,
        errorMessage: "El servicio no está disponible en este momento.",
      });
      return;
    }

    try {
      setScanState({ status: "scanning", progress: 25 });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setScanState({
          status: "error",
          progress: 0,
          errorMessage: "Inicia sesión para subir tu factura y acumular créditos.",
        });
        return;
      }

      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      const path = `${session.user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("facturas")
        .upload(path, selectedFile, { contentType: selectedFile.type || undefined });
      if (uploadError) {
        setScanState({
          status: "error",
          progress: 0,
          errorMessage: "No se pudo subir el archivo. Inténtalo de nuevo.",
        });
        return;
      }

      setScanState({ status: "extracting", progress: 80 });

      const parsedTotal = Number(totalInput.replace(/[^0-9.]/g, ""));
      const res = await fetch("/api/recompensas/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: path,
          total_amount: Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setScanState({
          status: "error",
          progress: 0,
          errorMessage:
            (data as { error?: string } | null)?.error ??
            "No se pudo registrar la factura. Inténtalo de nuevo.",
        });
        return;
      }
      const data = (await res.json()) as { submission?: { id: number } };

      setScanState({
        status: "success",
        progress: 100,
        extracted: {
          fileName: selectedFile.name,
          amount: Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null,
          submittedId: data.submission?.id ?? null,
        },
      });
    } catch {
      setScanState({
        status: "error",
        progress: 0,
        errorMessage: "Error de conexión. Revisa tu red e inténtalo de nuevo.",
      });
    }
  }, [selectedFile, totalInput]);

  const reset = () => {
    setScanState({ status: "idle", progress: 0 });
    clearSelectedFile();
    setTotalInput("");
  };

  const cashbackRate = CASHBACK_RATE;
  // Estimación orientativa: se acredita solo tras la revisión admin.
  const estimatedCashback =
    scanState.extracted?.amount != null
      ? Math.round(scanState.extracted.amount * cashbackRate)
      : null;

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
              totalInput={totalInput}
              onTotalChange={setTotalInput}
              submissions={submissions}
              onFileSelected={handleFile}
              onRemoveFile={clearSelectedFile}
              onScan={submitInvoice}
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
              fileName={scanState.extracted.fileName}
              amount={scanState.extracted.amount}
              estimatedCredits={estimatedCashback}
              onClose={onClose}
              onScanAnother={reset}
            />
          )}

          {scanState.status === "error" && (
            <ErrorState
              key="error"
              message={scanState.errorMessage}
              onRetry={reset}
            />
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
  totalInput,
  onTotalChange,
  submissions,
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
  totalInput: string;
  onTotalChange: (v: string) => void;
  submissions: InvoiceSubmission[];
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
          <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-1 text-[10px] font-semibold text-brand-700 uppercase tracking-wider">
            Revisión en ~24h
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
              Sube la foto o PDF de tu factura de insumos. Nuestro equipo la
              valida y acredita el 5% en Créditos a tu Cartera de Crecimiento.
            </p>
          </div>
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

      {/* Monto de la factura (opcional): orienta la revisión y estima créditos */}
      {selectedFile && (
        <div className="mt-4 w-full">
          <label htmlFor="invoice-total" className="text-warm-700 text-xs font-semibold">
            Total de la factura (opcional)
          </label>
          <div className="mt-1.5 flex items-center rounded-2xl bg-white border border-cream-300 px-4 py-3 shadow-sm focus-within:border-brand-500/50">
            <span className="text-[#6e737b] text-sm mr-1">$</span>
            <input
              id="invoice-total"
              inputMode="decimal"
              value={totalInput}
              onChange={(e) => onTotalChange(e.target.value)}
              placeholder="0.00 MXN"
              className="flex-1 bg-transparent text-sm text-warm-700 focus:outline-none"
            />
          </div>
        </div>
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
        Enviar factura a revisión
      </button>
      {!selectedFile && !fileError && (
        <p className="mt-2 text-[#6e737b] text-xs text-center">
          Selecciona un archivo o toma una foto para comenzar
        </p>
      )}

      {/* Mis envíos reales */}
      {submissions.length > 0 && (
        <div className="mt-6 w-full">
          <p className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-3">
            Mis envíos
          </p>
          <div className="space-y-2">
            {submissions.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-white border border-cream-300 p-3 shadow-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 border border-brand-200">
                  <FileText className="h-4 w-4 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-warm-700 text-sm">
                    {item.total_amount != null
                      ? `Factura de $${formatNumber(item.total_amount)}`
                      : "Factura enviada"}
                  </p>
                  <p className="text-[#6e737b] text-xs">
                    {new Date(item.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                    {item.status === "pending" && " · En revisión"}
                    {item.status === "rejected" && " · Rechazada"}
                  </p>
                </div>
                {item.status === "approved" && item.credits_granted != null ? (
                  <span className="text-brand-500 text-sm font-bold tabular-nums">
                    +${formatNumber(item.credits_granted)}
                  </span>
                ) : item.status === "pending" ? (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    En revisión
                  </span>
                ) : (
                  <span className="text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    Rechazada
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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

      <h2 className="text-warm-700 text-lg font-bold">Subiendo factura...</h2>
      <p className="text-[#5c6069] text-sm mt-1">Enviando de forma segura</p>
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
          { label: "Subida del archivo", done: progress > 20 },
          { label: "Verificación de seguridad", done: progress > 50 },
          { label: "Registro del envío", done: progress > 75 },
          { label: "Confirmación", done: progress > 95 },
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
      <h2 className="text-warm-700 text-lg font-bold">Registrando envío</h2>
      <p className="text-[#5c6069] text-sm mt-1">Guardando tu factura para revisión...</p>

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
