---
title: Corregir config dev: allowedDevOrigins + headers de preview
status: done
priority: urgent
type: bug
tags: [config, nextjs16, eslint, preview]
created_by: agent
created_at: 2026-08-20T23:30:00Z
position: 1
---
## Notes
El preview en el iframe de Softgen (3000-*-softgen.dev) mostraba "rechazó la conexión":
- Next.js 16 bloquea orígenes de desarrollo no listados en allowedDevOrigins.
- El header X-Frame-Options: DENY se aplicaba sin guarda de entorno, bloqueando el iframe.
- ESLint fallaba por estructura circular causada por FlatCompat.extends con configs legados.

## Checklist
- [x] Agregar allowedDevOrigins con 3000-07e71408-162f-4d55-afcf-13420ba7fef0.softgen.dev, *.softgen.dev y resurte.me
- [x] Envolver headers de seguridad en process.env.NODE_ENV === "production"
- [x] Reescribir eslint.config.mjs con configs flat nativas (sin FlatCompat)
- [x] Validar con npm run lint (0 errores) y npx tsc --noEmit (exit 0)

## Acceptance
- El preview carga sin "rechazó la conexión" en el iframe de Softgen.
- Bug Finder no muestra errores de lint ni de TypeScript.