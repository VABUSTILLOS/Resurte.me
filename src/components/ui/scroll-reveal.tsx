"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * ScrollReveal — Erewhon-style scroll-triggered animation wrapper.
 *
 * Uses IntersectionObserver to add 'reveal-visible' when the element
 * enters the viewport. Supports 4 animation modes.
 *
 * Props:
 * - direction: "up" (default), "left", "right", "scale"
 * - delay: CSS transition-delay in seconds (stagger effect)
 * - threshold: how much of the element must be visible (0-1)
 * - className: additional CSS classes
 * - children: content to animate in
 */

interface ScrollRevealProps {
  children: ReactNode
  direction?: "up" | "left" | "right" | "scale"
  delay?: number
  threshold?: number
  className?: string
}

const hiddenMap: Record<string, string> = {
  up: "reveal-hidden",
  left: "reveal-hidden-left",
  right: "reveal-hidden-right",
  scale: "reveal-hidden-scale",
}

const visibleMap: Record<string, string> = {
  up: "reveal-visible",
  left: "reveal-visible-left",
  right: "reveal-visible-right",
  scale: "reveal-visible-scale",
}

export function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  threshold = 0.15,
  className = "",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Apply delay as inline style for stagger effect
    if (delay > 0) {
      el.style.transitionDelay = `${delay}s`
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(visibleMap[direction])
          el.classList.remove(hiddenMap[direction])
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin: "0px 0px -20px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [direction, delay, threshold])

  return (
    <div ref={ref} className={`${hiddenMap[direction]} ${className}`}>
      {children}
    </div>
  )
}
