-- ============================================================
-- 00072: reward_services — catálogo canjeable administrable
--
-- La Tienda de Crecimiento (/recompensas) tenía los 12 servicios
-- hardcodeados en services-data.ts. Ahora viven en
-- `reward_services` (administrables desde /admin/recompensas);
-- services-data.ts queda como fallback si la tabla está vacía o
-- la migración no se ha aplicado.
--
-- Semilla: los 12 servicios actuales con su costo y tier.
-- ============================================================

CREATE TABLE public.reward_services (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tier              TEXT NOT NULL DEFAULT 'verde',
  cost              DECIMAL(10,2) NOT NULL CHECK (cost > 0),
  category          TEXT NOT NULL DEFAULT 'presencia',
  description       TEXT,
  deliverables      JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_impact  TEXT,
  testimonial       TEXT,
  icon              TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_services ENABLE ROW LEVEL SECURITY;

-- Catálogo público de lectura (solo activos); escritura solo service_role.
CREATE POLICY reward_services_select_active ON public.reward_services
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

COMMENT ON TABLE public.reward_services IS
  'Catálogo de servicios canjeables por Créditos Resurte (administrable desde /admin/recompensas).';

INSERT INTO public.reward_services (id, name, tier, cost, category, icon, display_order) VALUES
  ('resenas-google', 'Gestión de Reseñas Google', 'verde', 2200, 'presencia', '⭐', 1),
  ('google-maps', 'Optimización Google Maps', 'verde', 2800, 'presencia', '🗺️', 2),
  ('foto-profesional', 'Fotografía Profesional', 'verde', 3500, 'presencia', '📸', 3),
  ('redes-sociales', 'Gestión de Redes Sociales', 'verde', 4500, 'presencia', '📱', 4),
  ('meta-ads', 'Campaña Meta Ads Local', 'plata', 16000, 'trafico', '📣', 5),
  ('google-ads', 'Google Ads Local', 'plata', 14000, 'trafico', '🔍', 6),
  ('tiktok', 'TikTok para Restaurantes', 'plata', 12000, 'trafico', '🎵', 7),
  ('whatsapp-marketing', 'Campañas WhatsApp + Email', 'oro', 20000, 'trafico', '💬', 8),
  ('menu-digital', 'Menú Digital Interactivo', 'oro', 25000, 'infraestructura', '🍽️', 9),
  ('ecommerce', 'Tienda Online + Pedidos', 'oro', 45000, 'infraestructura', '🛒', 10),
  ('consultoria-rentabilidad', 'Consultoría de Rentabilidad', 'diamante', 55000, 'infraestructura', '📊', 11),
  ('web-completa', 'Desarrollo Web Completo', 'diamante', 60000, 'infraestructura', '💻', 12)
ON CONFLICT (id) DO NOTHING;
