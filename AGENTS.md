<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Plan maestro y agentes de dominio

- [`docs/PLAN-MEJORAS.md`](docs/PLAN-MEJORAS.md) — programa de mejoras por feature
  (10 fases por feature + fases 11, con estado ✅/🔜 y backlog priorizado).
- [`docs/agents/`](docs/agents/README.md) — playbooks de los 6 agentes de dominio
  (catálogo, checkout, recompensas, panel, admin, UX móvil). Antes de modificar una
  superficie, lee el playbook correspondiente: define perímetro, invariantes
  (prerender estático, fuente única de totales, rail inferior, reduced motion) y
  comandos de verificación obligatorios.
