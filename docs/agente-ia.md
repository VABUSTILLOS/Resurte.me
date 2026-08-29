# Agente de Ventas IA — Resurte.me Chihuahua

Sistema de prospección asistida por IA integrado en **Comercialización** (`/comercializacion/agente`).
Basado en el *Plan Completo de Prospección Chihuahua* (agosto 2026).

## Qué hace

| Módulo | Descripción |
|---|---|
| **Cola del día** | Prioriza hasta 25 prospectos: seguimientos vencidos → zona del día (ruta semanal) → tier (1 primero) → nuevos sin tocar. Sugiere el siguiente toque según la secuencia del plan: visita → WhatsApp → llamada. |
| **Generación de mensajes** | Redacta el WhatsApp según el momento del prospecto (primer contacto, seguimiento, cierre con urgencia, reorden, reactivación, upsell) con LLM compatible con OpenAI; sin API key usa las plantillas del plan. |
| **Aprobación humana** | Todo mensaje pasa por borrador → el vendedor edita/aprueba → se abre `wa.me` con el texto prellenado. El envío siempre lo hace una persona. |
| **Tablero de KPIs** | Embudo, actividad diaria/semanal vs. mínimos (8 visitas, 15 WA, 5 llamadas, 3 demos), metas del mes de operación (M1: 20/12/$100k · M2: 60/40/$350k · M3: 120/85/$700k), conversión por tier y por zona. |

## Puesta en marcha

1. **Migración**: ejecutar `supabase/migrations/00059_agente_ia.sql` en el SQL Editor de Supabase (idempotente).
2. **IA (opcional)**: definir `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`/`AGENT_MODEL`) o usar OmniRoute (`OMNIROUTE_BASE_URL`/`OMNIROUTE_API_KEY`). Sin esto, el agente funciona con plantillas.
   - **DeepSeek** (más barato, buen español): `OPENAI_BASE_URL=https://api.deepseek.com/v1`, `AGENT_MODEL=deepseek-chat` y tu `OPENAI_API_KEY` de platform.deepseek.com.
3. **Segmentar prospectos**: asignar `tier` (1/2/3) y `zone` (`centro`, `distrito_uno`, `paseo_central`, `periferico`) en `crm_prospects` para activar la priorización y los análisis por segmento.

## Rutas de la semana (del plan)

| Día | Zona | Meta visitas | Pitch |
|---|---|---|---|
| Lunes | Centro Histórico | 8 | "Deja de salir a la central bajo el sol. Te llevamos el surtido a tu puerta." |
| Martes | Distrito Uno / Zona Tec | 6 | "Abasto premium sin salir de tu cocina: pides a las 9 AM y llega a las 4 PM." |
| Miércoles | Paseo Central / Plaza del Sol | 8 | "Precios de central de abastos con entrega en menos de 24 horas y factura automática." |
| Jueves | Periférico / Residencial | 10 | "Pida antes de las 10 AM y le llega el mismo día. Sin salir de su negocio." |
| Viernes | Seguimiento | — | WhatsApp masivo, llamadas, demos virtuales y revisión de métricas. |

## Archivos

- `src/lib/agente/plan.ts` — constantes del plan (zonas, tiers, metas, oferta de lanzamiento)
- `src/lib/agente/llm.ts` — cliente OpenAI-compatible (OmniRoute/OpenAI)
- `src/lib/agente/templates.ts` — prompt maestro + plantillas de respaldo
- `src/lib/agente/actions.ts` — server actions (cola, mensajes, toques, metas, KPIs)
- `src/app/comercializacion/agente/page.tsx` + `src/components/comercializacion/agente-page.tsx` — UI
- `supabase/migrations/00059_agente_ia.sql` — esquema
