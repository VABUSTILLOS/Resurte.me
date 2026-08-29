-- ============================================================
-- Resurte.me — Actualización de prospectos Tier 1 (datos verificados)
--
-- Para quienes YA ejecutaron seed_chihuahua_prospects.sql antes de
-- la verificación de datos (ago-2026). Corrige las zonas según la
-- ubicación real de cada restaurante y agrega teléfonos, WhatsApp,
-- email e Instagram confirmados en fuentes públicas.
--
-- Cambios clave respecto al seed original:
--   - Mochomos, Los Arcos y Palominos -> distrito_uno
--   - Nómada -> centro
--   - Come Camila y Barboka -> paseo_central
--   - ARDEO y Yoko -> sin zona: están en Cd. Juárez (VERIFICAR)
--
-- USO (SQL Editor de Supabase):
--   1. Reemplaza 'CAMBIA-ESTE-EMAIL@example.com' por el email del
--      vendedor (el mismo usado en el seed original).
--   2. Ejecuta el script. Es idempotente: se puede correr N veces
--      sin efectos secundarios (solo UPDATE de los mismos valores).
--   3. NO toca prospectos cuyo contacto ya hayas personalizado:
--      solo actualiza los que siguen con name = 'Por confirmar'.
-- ============================================================

DO $$
DECLARE
  v_seller UUID;
BEGIN
  SELECT id INTO v_seller
  FROM auth.users
  WHERE email = 'CAMBIA-ESTE-EMAIL@example.com';

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese email. Ajusta el email del vendedor en el script.';
  END IF;

  UPDATE crm_prospects p SET
    zone      = u.zone,
    phone     = u.phone,
    whatsapp  = u.whatsapp,
    email     = u.email,
    instagram = u.instagram,
    notes     = u.notes
  FROM (VALUES
    ('Mochomos', 'distrito_uno', '(614) 425 5276', NULL::TEXT, NULL::TEXT, NULL::TEXT,
     'Tier 1 del plan (steakhouse sonorense). Verificado ago-2026: Vía Lombardia 3001, Plaza D1, Distrito Uno; 2a sucursal en Paseo Villalta (Blvd. V. Carranza 6075). Fuentes: mochomos.mx / OpenTable. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    ('Los Arcos', 'distrito_uno', '(614) 888 0111', NULL, NULL, '@grupolosarcosmx',
     'Tier 1 del plan. Verificado ago-2026: Vía Citadela 5900 Local 113, Distrito Uno. Mariscos; grupo nacional con 16 sucursales. Fuentes: restaurantlosarcos.com / OpenTable. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: pescados y mariscos.'),
    ('Kampai', 'distrito_uno', '(614) 443 0404', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Citadela 5710, El Saucito (zona Citadela / D1). Fusión japonesa; grupo con sucursales en MTY y Puebla. Fuente: kampai.mx. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    ('Palominos', 'distrito_uno', '(662) 212 2700', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Cerrada Vía Lombardia 3000, Distrito Uno. Asadero sonorense con 50 años de trayectoria. ATENCIÓN: el teléfono publicado en OpenTable tiene lada 662 (Sonora) — confirmar número local en la primera visita. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    ('Nómada Paradero Gastronómico', 'centro', '(614) 538 3723', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Guadalupe Victoria 200, 6° piso, Centro (vista al Centro Histórico). Cocina regional de autor con ingredientes locales. Fuentes: visitachihuahuacapital.com / Waze. Pitch zona: catálogo completo a precio de mayoreo en el corazón de la ciudad.'),
    ('Come Camila', 'paseo_central', '(614) 430 3067', '526143744994', 'hola@comecamila.com', NULL,
     'Tier 1 del plan. Verificado ago-2026: Periférico de la Juventud, Paseo Central N1. Cocina internacional casual desde 2006. Fuentes: comecamila.com / paseocentral.com.mx. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    ('Barboka', 'paseo_central', '(614) 541 6379', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Paseo Central N1. Cocina de autor low & slow con influencia mediterránea. Fuentes: paseocentral.com.mx / OpenTable. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    ('Tutto Pepe', 'paseo_central', '(614) 489 1477', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Periférico de la Juventud 5915, Paseo Central N1. Cocina italiana; pizaiolo certificado (uno de tres en México). Fuentes: tuttopepe.com.mx / OpenTable. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    ('ARDEO', NULL, '(656) 741 9714', NULL, NULL, NULL,
     'Tier 1 del plan. VERIFICAR: está en Cd. Juárez (Blvd. Gómez Morín 7855, Plaza La Morin), no en Chihuahua capital. Fuente: eatardeo.com. Decidir si se mantiene para una fase 2 en Juárez.'),
    ('Yoko', NULL, '(656) 753 3360', NULL, NULL, NULL,
     'Tier 1 del plan. VERIFICAR: está en Cd. Juárez (Blvd. Gómez Morín 7855, Plaza La Morin, misma plaza que ARDEO). Existe listing de UberEats en Chihuahua — posible sucursal por confirmar. Fuentes: eatyoko.com / OpenTable.')
  ) AS u(restaurant, zone, phone, whatsapp, email, instagram, notes)
  WHERE p.seller_id = v_seller
    AND p.restaurant_name = u.restaurant
    AND p.name = 'Por confirmar';

  RAISE NOTICE 'Prospectos Tier 1 actualizados con datos verificados para el vendedor %', v_seller;
END $$;
