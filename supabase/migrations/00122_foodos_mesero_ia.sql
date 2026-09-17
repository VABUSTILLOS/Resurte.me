-- ============================================================
-- 00122 — FoodOS: Mesero IA (nivel Diamante)
-- ============================================================
-- Fase 2 del roadmap de paridad con FluxSales.
--
-- El Mesero IA atiende WhatsApp: saluda, muestra el menú, arma el pedido,
-- confirma y lo crea por el MISMO camino que el storefront
-- (`POST /api/foodos/orders`), para no duplicar el cálculo de totales,
-- cupones, propina ni horarios.
--
-- Tres tablas:
--   foodos_ai_settings  — configuración por restaurante (1 fila por restaurante)
--   foodos_ai_sessions  — una conversación por cliente/teléfono
--   foodos_ai_messages  — bitácora de la conversación (auditoría + métricas)
--
-- Aditiva e idempotente.
-- ============================================================

-- ============================================================
-- 1. CONFIGURACIÓN POR RESTAURANTE
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_ai_settings (
  restaurant_id        UUID PRIMARY KEY REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Interruptor maestro. Si es false, el webhook NO enruta a la IA y el
  -- mensaje se comporta como antes (inbox + auto-respuesta de catálogo).
  is_enabled           BOOLEAN NOT NULL DEFAULT false,
  -- Tono del copy. Determina la instrucción de sistema del LLM.
  tone                 TEXT NOT NULL DEFAULT 'amable'
                       CHECK (tone IN ('amable', 'formal', 'rapido', 'divertido')),
  -- Saludo inicial. Vacío = se genera con el tono elegido.
  greeting             TEXT,
  -- Si true, el cliente puede pedir "quiero hablar con una persona" y la
  -- sesión se pausa para que un humano conteste en el inbox.
  handoff_enabled      BOOLEAN NOT NULL DEFAULT true,
  -- Tope de platillos distintos por pedido (evita pedidos absurdos o abuso).
  max_items            INTEGER NOT NULL DEFAULT 20 CHECK (max_items > 0),
  -- Tope de respuestas automáticas por conversación y día. Al agotarse, la
  -- sesión pasa a handoff. 0 = sin tope.
  daily_reply_cap      INTEGER NOT NULL DEFAULT 200 CHECK (daily_reply_cap >= 0),
  -- Si true, fuera de horario no responde (el inbox se queda con el mensaje).
  business_hours_only  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. SESIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_ai_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Teléfono normalizado (solo dígitos) del cliente.
  customer_phone TEXT NOT NULL,
  -- Estado de la máquina: ver src/lib/foodos-ai-wa/state-machine.ts
  state          TEXT NOT NULL DEFAULT 'greeting',
  -- Carrito en construcción + datos de entrega. Se serializa como JSON para
  -- no crear 8 columnas que la máquina de estados ya modela.
  draft          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Última pregunta que la IA hizo; permite interpretar respuestas cortas
  -- ("sí", "2", "domicilio") sin volver a preguntar.
  pending_question TEXT,
  -- Pedido creado al confirmar (para medir conversación → pedido).
  order_id       UUID REFERENCES foodos_orders(id) ON DELETE SET NULL,
  -- Handoff humano: si tiene valor, la IA NO responde hasta que se reanude.
  handoff_at     TIMESTAMPTZ,
  -- Contador de respuestas automáticas de hoy (se reinicia por día).
  replies_today  INTEGER NOT NULL DEFAULT 0,
  replies_day    DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::date,
  message_count  INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una sola sesión viva por teléfono y restaurante.
  UNIQUE (restaurant_id, customer_phone)
);

-- ============================================================
-- 3. MENSAJES
-- ============================================================
CREATE TABLE IF NOT EXISTS foodos_ai_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES foodos_ai_sessions(id) ON DELETE CASCADE,
  restaurant_id  UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- 'inbound' = cliente, 'outbound' = IA, 'human' = mesero real desde el inbox.
  direction      TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'human')),
  content        TEXT,
  -- De dónde salió la respuesta: 'llm' o 'template' (degradación). Permite
  -- medir cuánto se apoya el negocio en el modelo real.
  source         TEXT CHECK (source IN ('llm', 'template')),
  tokens_used    INTEGER,
  state_before   TEXT,
  state_after    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_ai_settings ON public.foodos_ai_settings;
CREATE TRIGGER trg_touch_foodos_ai_settings
  BEFORE UPDATE ON public.foodos_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_foodos_ai_sessions ON public.foodos_ai_sessions;
CREATE TRIGGER trg_touch_foodos_ai_sessions
  BEFORE UPDATE ON public.foodos_ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS — el dueño lee y gestiona lo suyo; admin todo
-- ============================================================
ALTER TABLE public.foodos_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own ai settings" ON public.foodos_ai_settings;
CREATE POLICY "Owner manages own ai settings" ON public.foodos_ai_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages ai settings" ON public.foodos_ai_settings;
CREATE POLICY "Admin manages ai settings" ON public.foodos_ai_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Sesiones y mensajes son del restaurante: el dueño puede LEER para atender
-- el handoff desde el inbox. Las ESCRITURAS las hace el webhook con service
-- role (sin políticas de INSERT para authenticated: nadie más escribe ahí).
DROP POLICY IF EXISTS "Owner reads own ai sessions" ON public.foodos_ai_sessions;
CREATE POLICY "Owner reads own ai sessions" ON public.foodos_ai_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

-- El dueño puede reanudar o pausar la IA (handoff_at) desde el panel.
DROP POLICY IF EXISTS "Owner updates own ai sessions" ON public.foodos_ai_sessions;
CREATE POLICY "Owner updates own ai sessions" ON public.foodos_ai_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages ai sessions" ON public.foodos_ai_sessions;
CREATE POLICY "Admin manages ai sessions" ON public.foodos_ai_sessions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Owner reads own ai messages" ON public.foodos_ai_messages;
CREATE POLICY "Owner reads own ai messages" ON public.foodos_ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages ai messages" ON public.foodos_ai_messages;
CREATE POLICY "Admin manages ai messages" ON public.foodos_ai_messages
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- ÍNDICES
-- ============================================================
-- Conversaciones por atender (handoff) y actividad reciente.
CREATE INDEX IF NOT EXISTS idx_foodos_ai_sessions_handoff
  ON public.foodos_ai_sessions(restaurant_id, handoff_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_foodos_ai_sessions_last_message
  ON public.foodos_ai_sessions(restaurant_id, last_message_at DESC);

-- Bitácora por sesión (el inbox lee la conversación en orden).
CREATE INDEX IF NOT EXISTS idx_foodos_ai_messages_session
  ON public.foodos_ai_messages(session_id, created_at);
