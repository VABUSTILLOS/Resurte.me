-- ============================================================
-- 00128: Sitio IA — páginas de contenido y perfil público del restaurante
--
-- FluxSales vende "sitio web con IA + SEO local". FoodOS ya tiene el
-- micrositio de pedidos (`/r/[slug]`); lo que falta es **contenido que Google
-- pueda indexar** y un perfil público que alimente los datos estructurados.
--
-- Decisiones:
--   1. El contenido generado nace en `draft`. Nada llega a Google sin que el
--      dueño lo apruebe: un párrafo inventado por un modelo sobre un
--      restaurante real es un problema de reputación, no un bug de render.
--   2. `source` guarda de dónde salió el texto (`llm` o `template`). Sin
--      credenciales de IA el producto funciona igual — con plantillas — y el
--      dueño ve exactamente lo que va a publicar.
--   3. `faq` es JSONB y no una tabla: son preguntas de una página, se leen
--      siempre junto a ella y nunca se consultan sueltas.
--   4. El perfil público (`tagline`, `about`, `seo_keywords`,
--      `google_business_url`) vive en `foodos_restaurants` porque es
--      exactamente eso: atributos del restaurante, no de una página.
--
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. PERFIL PÚBLICO DEL RESTAURANTE
-- ============================================================
ALTER TABLE public.foodos_restaurants
  ADD COLUMN IF NOT EXISTS tagline              TEXT,
  ADD COLUMN IF NOT EXISTS about                TEXT,
  ADD COLUMN IF NOT EXISTS seo_keywords         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS google_business_url  TEXT;

COMMENT ON COLUMN public.foodos_restaurants.tagline IS
  'Una línea que resume el restaurante. Alimenta el manifest PWA y la meta descripción.';
COMMENT ON COLUMN public.foodos_restaurants.about IS
  'Descripción larga aprobada por el dueño. Es la fuente de la página "Sobre nosotros".';
COMMENT ON COLUMN public.foodos_restaurants.seo_keywords IS
  'Términos que el dueño quiere posicionar (ej. {"tacos","centro","guadalajara"}).';
COMMENT ON COLUMN public.foodos_restaurants.google_business_url IS
  'Enlace a la ficha de Google Business del restaurante, si la tiene.';

-- ============================================================
-- 2. PÁGINAS DEL SITIO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_seo_pages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES public.foodos_restaurants(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT,
  body           TEXT NOT NULL DEFAULT '',
  faq            JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         TEXT NOT NULL DEFAULT 'draft',
  source         TEXT NOT NULL DEFAULT 'template',
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foodos_seo_pages_kind_check
    CHECK (kind IN ('about', 'faq', 'menu', 'dish', 'city')),
  CONSTRAINT foodos_seo_pages_status_check
    CHECK (status IN ('draft', 'published')),
  CONSTRAINT foodos_seo_pages_source_check
    CHECK (source IN ('llm', 'template')),
  -- Una página por tipo y slug: reintentar la generación actualiza, no duplica.
  CONSTRAINT foodos_seo_pages_unique UNIQUE (restaurant_id, kind, slug)
);

DROP TRIGGER IF EXISTS trg_touch_foodos_seo_pages ON public.foodos_seo_pages;
CREATE TRIGGER trg_touch_foodos_seo_pages
  BEFORE UPDATE ON public.foodos_seo_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 3. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_seo_pages_rest
  ON public.foodos_seo_pages(restaurant_id, kind);

-- El micrositio público solo lee lo publicado; el índice parcial evita que un
-- montón de borradores engorde la consulta más caliente.
CREATE INDEX IF NOT EXISTS idx_foodos_seo_pages_published
  ON public.foodos_seo_pages(restaurant_id)
  WHERE status = 'published';

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.foodos_seo_pages ENABLE ROW LEVEL SECURITY;

-- El sitio es público: cualquiera (incluido el visitante anónimo del
-- micrositio) puede leer las páginas **publicadas**. Los borradores solo los
-- ve el dueño.
DROP POLICY IF EXISTS "Public reads published seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Public reads published seo pages" ON public.foodos_seo_pages
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Owner reads own seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Owner reads own seo pages" ON public.foodos_seo_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner writes own seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Owner writes own seo pages" ON public.foodos_seo_pages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner updates own seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Owner updates own seo pages" ON public.foodos_seo_pages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner deletes own seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Owner deletes own seo pages" ON public.foodos_seo_pages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages seo pages" ON public.foodos_seo_pages;
CREATE POLICY "Admin manages seo pages" ON public.foodos_seo_pages
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
