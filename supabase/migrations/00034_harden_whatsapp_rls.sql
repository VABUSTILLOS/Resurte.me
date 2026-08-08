-- ============================================================
-- 00034_harden_whatsapp_rls.sql
--
-- Endurece las políticas RLS de las tablas de WhatsApp.
-- Antes: FOR ALL USING (true) — la anon key (pública vía
-- NEXT_PUBLIC_SUPABASE_ANON_KEY) podía leer/escribir
-- whatsapp_messages, whatsapp_templates y whatsapp_automations
-- directamente vía PostgREST.
--
-- Ahora: solo service_role (el backend) gestiona estas tablas.
-- ============================================================

-- WhatsApp automations
DROP POLICY IF EXISTS "Automations managed by service role" ON public.whatsapp_automations;
CREATE POLICY "Automations managed by service role" ON public.whatsapp_automations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- WhatsApp templates
DROP POLICY IF EXISTS "Templates managed by service role" ON public.whatsapp_templates;
CREATE POLICY "Templates managed by service role" ON public.whatsapp_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- WhatsApp messages
DROP POLICY IF EXISTS "Messages managed by service role" ON public.whatsapp_messages;
CREATE POLICY "Messages managed by service role" ON public.whatsapp_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
