-- ============================================================
-- FASE 12 — HISTORIAL DE AJUSTES DE STOCK
-- Bitácora de cambios manuales de products.stock_status desde el
-- panel admin (quién, cuándo, de qué a qué, nota opcional).
-- ============================================================

CREATE TABLE stock_adjustments (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_status stock_status NOT NULL,
  new_status      stock_status NOT NULL,
  note            TEXT,
  adjusted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_adjustments_product ON stock_adjustments(product_id, created_at DESC);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Solo administradores leen/escriben la bitácora (mismo patrón que otras
-- tablas admin: el chequeo fino lo hace requireAdmin en el server action;
-- aquí se exige rol admin/master_admin vía profiles).
CREATE POLICY "Admins can read stock adjustments" ON stock_adjustments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert stock adjustments" ON stock_adjustments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
