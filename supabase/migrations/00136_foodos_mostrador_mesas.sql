-- ============================================================
-- 00136: Mostrador y mesas — el punto de venta nativo de FoodOS
--
-- Contexto (paridad con Maspedidos, ver `docs/foodos-paridad-maspedidos.md`):
--
-- Hasta hoy FoodOS solo tenía el lado digital del restaurante: menú,
-- pedidos por web/QR/WhatsApp, KDS y tablero. Faltaba lo que ocurre
-- DENTRO del local: vender en mostrador, llevar cuentas por mesa,
-- imprimir tickets con folio y cuadrar la caja al final del turno.
--
-- Este archivo crea esas piezas y NO toca los pedidos existentes más
-- que para colgarles la referencia que les faltaba (folio, turno de
-- caja, cuenta de mesa y desglose de pago combinado).
--
-- Nota sobre `foodos_orders.channel`: la columna nunca tuvo CHECK, así
-- que no hay migración de datos. Se documentan aquí los valores
-- válidos: web | qr | whatsapp | mostrador | marketplace.
-- ============================================================

-- ============================================================
-- 1. TURNOS DE CAJA (corte y arqueo)
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_pos_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES foodos_branches(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_float NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opened_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at     TIMESTAMPTZ,
  -- Arqueo: lo que el sistema esperaba contra lo que el cajero contó.
  declared_cash NUMERIC(10,2) CHECK (declared_cash >= 0),
  expected_cash NUMERIC(10,2),
  difference    NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_pos_shifts_rest
  ON foodos_pos_shifts(restaurant_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_pos_shifts_branch
  ON foodos_pos_shifts(branch_id, status);

-- Un solo turno abierto por sucursal. COALESCE porque branch_id puede ser NULL
-- y en Postgres los NULL no chocan entre sí en un índice único.
CREATE UNIQUE INDEX IF NOT EXISTS uq_foodos_pos_shifts_open
  ON foodos_pos_shifts (restaurant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';

-- ============================================================
-- 2. MOVIMIENTOS DE EFECTIVO DEL TURNO
-- ============================================================
-- Entradas (fondo extra, cobros ajenos) y salidas (gastos, retiros).
CREATE TABLE IF NOT EXISTS foodos_pos_shift_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id   UUID NOT NULL REFERENCES foodos_pos_shifts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('in','out')),
  amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason     TEXT,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_pos_movements_shift
  ON foodos_pos_shift_movements(shift_id, created_at);

-- ============================================================
-- 3. ZONAS DEL SALÓN
-- ============================================================
-- Cada zona es un lienzo con su tamaño; las mesas guardan su posición
-- dentro de él. `width`/`height` son unidades relativas, no píxeles.
CREATE TABLE IF NOT EXISTS foodos_table_zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES foodos_branches(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 1000 CHECK (width > 0),
  height        INTEGER NOT NULL DEFAULT 700 CHECK (height > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_table_zones_rest
  ON foodos_table_zones(restaurant_id, branch_id, sort_order);

-- ============================================================
-- 4. MESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_tables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES foodos_branches(id) ON DELETE CASCADE,
  zone_id       UUID REFERENCES foodos_table_zones(id) ON DELETE SET NULL,
  label         TEXT NOT NULL,
  seats         INTEGER NOT NULL DEFAULT 4 CHECK (seats > 0),
  shape         TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('square','round','rect')),
  pos_x         NUMERIC(8,2) NOT NULL DEFAULT 0,
  pos_y         NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_tables_rest
  ON foodos_tables(restaurant_id, branch_id, label);
CREATE INDEX IF NOT EXISTS idx_foodos_tables_zone
  ON foodos_tables(zone_id);

-- ============================================================
-- 5. CUENTAS ABIERTAS POR MESA
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_table_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES foodos_branches(id) ON DELETE SET NULL,
  table_id        UUID NOT NULL REFERENCES foodos_tables(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','void')),
  guests          INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),
  opened_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at       TIMESTAMPTZ,
  -- Pedido con el que se cobró la cuenta (null mientras sigue abierta).
  closed_order_id UUID REFERENCES foodos_orders(id) ON DELETE SET NULL,
  note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_foodos_table_tickets_rest
  ON foodos_table_tickets(restaurant_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_table_tickets_table
  ON foodos_table_tickets(table_id, status);

-- Una mesa no puede tener dos cuentas abiertas a la vez. El índice parcial
-- deja convivir todas las cuentas cerradas que haga falta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_foodos_table_tickets_open
  ON foodos_table_tickets(table_id) WHERE status = 'open';

-- ============================================================
-- 6. FOLIOS (numeración consecutiva, sin huecos)
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_order_folios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES foodos_branches(id) ON DELETE SET NULL,
  folio_date    DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Mexico_City')::date),
  last_number   INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_foodos_order_folios_scope
  ON foodos_order_folios (
    restaurant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    folio_date
  );

-- ============================================================
-- 7. PEDIDOS: columnas que faltaban
-- ============================================================
ALTER TABLE foodos_orders ADD COLUMN IF NOT EXISTS folio             TEXT;
ALTER TABLE foodos_orders ADD COLUMN IF NOT EXISTS cashier_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE foodos_orders ADD COLUMN IF NOT EXISTS pos_shift_id      UUID REFERENCES foodos_pos_shifts(id) ON DELETE SET NULL;
ALTER TABLE foodos_orders ADD COLUMN IF NOT EXISTS table_ticket_id   UUID REFERENCES foodos_table_tickets(id) ON DELETE SET NULL;
-- Pago combinado: [{"method":"cash","amount":100},{"method":"card","amount":50}]
-- (`method` usa el mismo vocabulario que `payment_method`: cash | card | transfer | branch | whatsapp)
ALTER TABLE foodos_orders ADD COLUMN IF NOT EXISTS payment_breakdown JSONB;

CREATE INDEX IF NOT EXISTS idx_foodos_orders_channel
  ON foodos_orders(restaurant_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_orders_shift
  ON foodos_orders(pos_shift_id);
CREATE INDEX IF NOT EXISTS idx_foodos_orders_ticket
  ON foodos_orders(table_ticket_id);

-- El folio es único por restaurante (el prefijo de fecha ya lo hace legible,
-- pero la unicidad la garantiza el índice).
CREATE UNIQUE INDEX IF NOT EXISTS uq_foodos_orders_folio
  ON foodos_orders(restaurant_id, folio) WHERE folio IS NOT NULL;

-- ============================================================
-- 8. ASIGNACIÓN ATÓMICA DE FOLIO
-- ============================================================
-- Devuelve el siguiente folio del día, tipo "260214-0007". El upsert es
-- atómico, así que dos cajas cobrando al mismo tiempo nunca reciben el
-- mismo número ni dejan huecos.
CREATE OR REPLACE FUNCTION foodos_next_folio(
  p_restaurant_id UUID,
  p_branch_id     UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date   DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_number INTEGER;
BEGIN
  INSERT INTO foodos_order_folios (restaurant_id, branch_id, folio_date, last_number)
  VALUES (p_restaurant_id, p_branch_id, v_date, 1)
  ON CONFLICT (
    restaurant_id,
    (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    folio_date
  )
  DO UPDATE SET last_number = foodos_order_folios.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_number;

  RETURN to_char(v_date, 'YYMMDD') || '-' || lpad(v_number::text, 4, '0');
END;
$$;

-- ============================================================
-- 9. RLS: DUEÑO DEL RESTAURANTE
-- ============================================================
-- Todas estas tablas son privadas: nada nuevo se expone a la clave anónima.
-- El KDS y el mapa de mesas leen con service_role desde el servidor.

ALTER TABLE foodos_pos_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages pos shifts" ON foodos_pos_shifts;
CREATE POLICY "Owner manages pos shifts" ON foodos_pos_shifts
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

-- Movimientos: no tienen restaurant_id propio, cuelgan del turno.
ALTER TABLE foodos_pos_shift_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages pos movements" ON foodos_pos_shift_movements;
CREATE POLICY "Owner manages pos movements" ON foodos_pos_shift_movements
  FOR ALL USING (EXISTS (
    SELECT 1 FROM foodos_pos_shifts s
    JOIN foodos_restaurants r ON r.id = s.restaurant_id
    WHERE s.id = shift_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM foodos_pos_shifts s
    JOIN foodos_restaurants r ON r.id = s.restaurant_id
    WHERE s.id = shift_id AND r.user_id = auth.uid()
  ));

ALTER TABLE foodos_table_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages table zones" ON foodos_table_zones;
CREATE POLICY "Owner manages table zones" ON foodos_table_zones
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages tables" ON foodos_tables;
CREATE POLICY "Owner manages tables" ON foodos_tables
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_table_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages table tickets" ON foodos_table_tickets;
CREATE POLICY "Owner manages table tickets" ON foodos_table_tickets
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_order_folios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages folios" ON foodos_order_folios;
CREATE POLICY "Owner manages folios" ON foodos_order_folios
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));
