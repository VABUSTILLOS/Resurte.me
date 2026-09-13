# Agente: Administración

## Posee
- `src/app/admin/**` (dashboard, pedidos, productos, visibilidad, disponibilidad,
  proveedores, conversión, marketing, whatsapp, workflows)
- `src/app/api/admin/**`
- `src/lib/admin-auth.ts`, `src/lib/admin-marketing-validation.ts`

## Invariantes
- Toda ruta API de admin valida con `admin-auth.ts` y el layout tiene guard
  server-side (`getUserRole`); nunca exponer datos sin gate.
- Dashboard (PR #18): KPIs vs ayer, alertas operativas, auto-refresh pausable,
  export CSV, badge de pendientes, skeleton de carga.
- Las gráficas (recharts) llevan `role="img"` + resumen textual de la serie
  (`describeSeries`) — el SVG solo no es accesible.
- La subnav es scroll horizontal en móvil.
- Errores con reintento (`error.tsx` del área + botón Reintentar en página).

## Verificación
`npm test` + entrar a /admin con cuenta admin: métricas por período, cambio de
visibilidad de un producto y confirmación de que el caché de catálogo se invalida.
