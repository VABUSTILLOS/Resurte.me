"use client"

import { cva } from "class-variance-authority"

const inputStyles = cva(
  "w-full px-2.5 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20 focus:border-[#0E7A0E]",
  {
    variants: {
      disabled: {
        true: "opacity-50 cursor-not-allowed bg-gray-50",
        false: "bg-white",
      },
    },
    defaultVariants: { disabled: false },
  }
)

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className = "",
  ariaLabel,
  disabled,
}: NumberInputProps) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === "") {
            onChange(0)
            return
          }
          const n = Number(raw)
          if (Number.isNaN(n)) return
          let next = n
          if (min !== undefined) next = Math.max(min, next)
          if (max !== undefined) next = Math.min(max, next)
          onChange(next)
        }}
        className={inputStyles({ disabled })}
      />
      {unit && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  )
}
