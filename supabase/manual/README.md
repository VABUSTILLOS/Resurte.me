# supabase/manual — scripts ad-hoc (histórico)

Aquí vivían scripts de aplicación manual vía SQL Editor del dashboard de
Supabase. **Todos fueron eliminados al quedar completamente cubiertos por
migraciones versionadas:**

| Script eliminado | Migración(es) versionada(s) que lo cubren |
|---|---|
| `apply_00031_00032.sql` | `00031_order_address_fixes.sql` + `00032_whatsapp_messages_store_default.sql` |
| `apply_00033.sql` | `00033_guest_address_tokens.sql` |
| `apply_00052_roles.sql` | `00052_comercializacion.sql` (el paso de asignar roles por email es una operación de datos, documentada en los comentarios de la propia migración y en `docs/OPS.md` §8.2) |
| `apply_00053_panel_dishes.sql` | `00053_panel_dishes.sql` |

Las migraciones 00031, 00033 y 00053 se endurecieron con guardas idempotentes
(`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) para igualar la convención del repo.
La reconciliación residual del drift de producción vive en
`00071_reconcile_prod_drift.sql`.

**Regla vigente:** ya no se crean scripts aquí. Los cambios de esquema se
hacen con `npx supabase migration new <nombre>` y se aplican con
`npx supabase db push` (ver `docs/OPS.md`).
