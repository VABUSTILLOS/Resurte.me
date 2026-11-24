-- ============================================================
-- Descuentos automáticos sin código (Ola 2: paridad con
-- Take App). Reglas que el motor de src/lib/coupon-rules.ts
-- evalúa EN EL SERVIDOR al cotizar y al crear el pedido:
--
-- - bundle: si el carrito contiene todos los productos del
--   paquete (con sus cantidades), aplica un descuento
--   porcentual o de monto fijo.
--   config = { "items": [{"product_id": 1, "qty": 2}, ...],
--              "discount_type": "percentage" | "fixed_amount",
--              "discount_value": 10 }
-- - buy_x_get_y: por cada X unidades del producto A, Y
--   unidades del producto B (o del mismo A) con descuento
--   (100 = gratis).
--   config = { "buy_product_id": 1, "buy_qty": 3,
--              "get_product_id": 2, "get_qty": 1,
--              "discount_pct": 100 }
--
-- Tabla separada de `coupons` a propósito: el camino de dinero
-- de los cupones con código queda intacto.
--
-- Sin políticas: solo service role (CRUD admin + motor).
-- El código degrada si esta migración aún no se aplica (42P01).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS automatic_discount_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  rule_type  TEXT NOT NULL CHECK (rule_type IN ('bundle', 'buy_x_get_y')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automatic_discount_rules_active
  ON automatic_discount_rules (is_active)
  WHERE is_active;

ALTER TABLE automatic_discount_rules ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role.
