-- ============================================================
-- 00184 — CRM: cierre del trato, motivo de pérdida y valor estimado
--
-- Ronda 16 del panel /admin/leads. Hasta ahora el CRM sabía mover un prospecto
-- entre seis estados (`00052`) pero no sabía *cerrar* un trato: `perdido` era un
-- estado sin causa y `cliente_activo` un estado sin fecha. Tres columnas
-- resuelven las tres preguntas que un CRM funcional tiene que contestar:
--
-- 1. `estimated_value NUMERIC(12,2)` — cuánto vale el trato *antes* de ganarlo.
--    El pipeline no puede priorizar por valor si el valor no existe en la fila.
--    Es un valor **estimado** y por eso vive aparte del dinero real: el ingreso
--    de un prospecto ya convertido se deriva de `orders` vía `crm_prospects.user_id`
--    (`getProspectClientOrders`), y nunca se suma aquí. Una columna en `NULL` es
--    "no estimado", no `0`.
--
-- 2. `loss_reason TEXT` — por qué se perdió. Sin motivo, un trato perdido no
--    deja aprendizaje: no se puede saber si el problema es precio, zona o
--    producto. El `CHECK` es doble a propósito: vocabulario cerrado, y **solo
--    sobre un trato realmente perdido**.
--
-- 3. `closed_at TIMESTAMPTZ` — cuándo se cerró. Permite medir el ciclo de venta
--    (de `created_at` a `closed_at`) sin inferirlo de `updated_at`, que cualquier
--    edición de notas pisa.
--
-- Los dos `CHECK` de coherencia son la parte que importa: hacen **imposible**
-- guardar un motivo de pérdida sobre un trato abierto, o una fecha de cierre
-- sobre un trato que no está cerrado. Eso convierte la limpieza de esos campos
-- en una obligación del código — `crmStatusPatch()` de `src/lib/crm-core.ts` — y
-- no en una convención que se olvida. Si una ruta de escritura mueve `status`
-- sin limpiar, la base rechaza el `UPDATE` en vez de aceptar una fila que miente.
--
-- Índices: uno parcial para el pipeline abierto (la vista que más se pide y la
-- única que crece con el uso) y otro parcial por valor no nulo (ordenar por
-- valor estimado no debe recorrer la tabla entera ni indexar los `NULL`, que
-- serán la mayoría al principio).
--
-- Idempotente: todo con `IF NOT EXISTS` o `DROP … IF EXISTS`, para poder
-- reejecutarse tras un `db reset` parcial.
-- ============================================================

-- 1. Columnas --------------------------------------------------------------
ALTER TABLE public.crm_prospects
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS loss_reason     TEXT,
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ;

-- 2. Coherencia ------------------------------------------------------------
-- El vocabulario es el mismo que `CRM_LOSS_REASONS` de `src/lib/crm-core.ts`;
-- `crm-core.contract.test.ts` compara ambos y falla si divergen.
ALTER TABLE public.crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_loss_reason_check;
ALTER TABLE public.crm_prospects ADD CONSTRAINT crm_prospects_loss_reason_check
  CHECK (
    loss_reason IS NULL
    OR loss_reason IN (
      'precio',
      'competencia',
      'sin_presupuesto',
      'no_contesta',
      'cerro_negocio',
      'fuera_de_zona',
      'otro'
    )
  );

ALTER TABLE public.crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_loss_reason_requires_lost_check;
ALTER TABLE public.crm_prospects ADD CONSTRAINT crm_prospects_loss_reason_requires_lost_check
  CHECK (loss_reason IS NULL OR status = 'perdido');

ALTER TABLE public.crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_closed_at_requires_closed_check;
ALTER TABLE public.crm_prospects ADD CONSTRAINT crm_prospects_closed_at_requires_closed_check
  CHECK (closed_at IS NULL OR status IN ('cliente_activo', 'perdido'));

ALTER TABLE public.crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_estimated_value_check;
ALTER TABLE public.crm_prospects ADD CONSTRAINT crm_prospects_estimated_value_check
  CHECK (estimated_value IS NULL OR estimated_value >= 0);

-- 3. Índices ---------------------------------------------------------------
-- Parcial sobre el pipeline abierto: los tratos cerrados se acumulan para
-- siempre y son justo los que no se consultan en el tablero. La lista de
-- estados cerrados está literal aquí a propósito; cambiarla exige una migración
-- nueva, que es exactamente el aviso que se quiere (el índice y `isCrmClosed()`
-- tienen que decir lo mismo).
CREATE INDEX IF NOT EXISTS idx_crm_prospects_open_pipeline
  ON public.crm_prospects (status, next_follow_up_at)
  WHERE status NOT IN ('cliente_activo', 'perdido');

CREATE INDEX IF NOT EXISTS idx_crm_prospects_estimated_value
  ON public.crm_prospects (estimated_value)
  WHERE estimated_value IS NOT NULL;

-- 4. Documentación ---------------------------------------------------------
COMMENT ON COLUMN public.crm_prospects.estimated_value IS
  'Valor estimado del trato en MXN. NULL = no estimado (nunca 0). El ingreso real de un prospecto convertido se deriva de orders.';

COMMENT ON COLUMN public.crm_prospects.loss_reason IS
  'Motivo de pérdida. Solo puede estar presente si status = ''perdido'' (CHECK). Vocabulario cerrado; ver CRM_LOSS_REASONS.';

COMMENT ON COLUMN public.crm_prospects.closed_at IS
  'Momento del cierre del trato. Solo puede estar presente si status IN (''cliente_activo'', ''perdido'') (CHECK).';
