"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  size: number;
  delay: number;
}

const colors = [
  "#10B981", // emerald
  "#14B8A6", // teal
  "#06B6D4", // cyan
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#EC4899", // pink
];

export function ConfettiOverlay() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const newParticles: Particle[] = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      size: 6 + Math.random() * 10,
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);

    const timer = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-sm"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size * 0.6,
                backgroundColor: p.color,
                rotate: p.rotation,
              }}
              initial={{ y: "-10%", opacity: 1, rotate: p.rotation }}
              animate={{
                y: "110vh",
                opacity: [1, 1, 0],
                rotate: p.rotation + 720,
                x: [0, (Math.random() - 0.5) * 100],
              }}
              transition={{
                duration: 2.5 + Math.random() * 2,
                delay: p.delay,
                ease: "easeIn",
              }}
            />
          ))}

          {/* Center message */}
          <motion.div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: 1 }}
              className="text-5xl mb-2"
            >
              🎉
            </motion.div>
            <p className="text-white text-xl font-black drop-shadow-lg">
              ¡Servicio Solicitado!
            </p>
            <p className="text-emerald-300 text-sm mt-1 drop-shadow-lg">
              Tu restaurante está creciendo
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
