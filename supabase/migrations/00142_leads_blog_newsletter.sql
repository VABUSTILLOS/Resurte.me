-- ============================================================
-- 00142_leads_blog_newsletter.sql
--
-- El formulario de suscripción del blog descartaba el correo: mostraba
-- "¡Listo!" tras un setTimeout de 800 ms y no guardaba nada. La lista de
-- suscriptores no existía en ninguna parte.
--
-- Se reutiliza `leads` (ya tiene email validado por CHECK, índice por
-- (source, created_at) e inserción con service role) en vez de crear una
-- tabla paralela, para que la suscripción aparezca en el mismo panel de
-- leads que el resto de capturas y se pueda exportar.
--
-- Aditivo: solo amplía el CHECK de `source`. Los leads existentes no cambian.
-- ============================================================

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check CHECK (
    source IN ('checkout_drawer', 'exit_intent', 'restaurantes_landing', 'blog_newsletter')
  );

COMMENT ON TABLE public.leads IS
  'Leads capturados en el checkout drawer (email onBlur y exit-intent), en la landing B2B /restaurantes y en la suscripción del blog. No afecta el flujo de órdenes.';
