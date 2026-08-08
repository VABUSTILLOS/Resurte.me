"use client"

import { Clock, ArrowLeft, ArrowRight } from "lucide-react"
import { DELIVERY_TIMES, getNextDays, type ScheduleForm } from "./checkout-shared"

interface ScheduleStepProps {
  schedule: ScheduleForm
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}

export function ScheduleStep({
  schedule,
  onDateChange,
  onTimeChange,
  onBack,
  onContinue,
}: ScheduleStepProps) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        <Clock className="w-5 h-5 inline mr-2 text-brand-600" />
        ¿Cuándo entregamos?
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Elige la fecha y horario de entrega. Entrega estimada: 30–60 min.
      </p>

      {/* Date selection */}
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Fecha</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {getNextDays().map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => onDateChange(day.value)}
            aria-pressed={schedule.date === day.value}
            className={`p-3 rounded-xl text-sm font-medium text-left transition-colors ${
              schedule.date === day.value
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      {/* Time selection */}
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Horario</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
        {DELIVERY_TIMES.map((time) => (
          <button
            key={time}
            type="button"
            onClick={() => onTimeChange(time)}
            aria-pressed={schedule.time === time}
            className={`p-3 rounded-xl text-sm font-medium text-left transition-colors ${
              schedule.time === time
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {time}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Atrás
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
        >
          Continuar
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
