-- ============================================================
-- Resurte.me — Semilla de prospectos Tier 1 (Plan Chihuahua)
--
-- Carga los restaurantes prioritarios del Plan de Prospección
-- Chihuahua en el CRM del vendedor, ya segmentados por tier y zona
-- para que el Agente IA los priorice desde el día 1.
--
-- USO (SQL Editor de Supabase):
--   1. Reemplaza 'CAMBIA-ESTE-EMAIL@example.com' por el email del
--      vendedor (debe existir en auth.users y tener rol 'vendedor').
--   2. Ejecuta el script. Es idempotente: no duplica restaurantes
--      que ya existan para ese vendedor.
--   3. Si YA corriste una versión anterior de este seed, ejecuta
--      además seed_chihuahua_tier1_update.sql para corregir zonas y
--      agregar los datos de contacto verificados.
--
-- Notas:
--   - Los nombres de contacto quedan "Por confirmar": el vendedor
--     los completa en la primera visita.
--   - Zonas y teléfonos verificados con fuentes públicas
--     (ago-2026): sitios oficiales, OpenTable, TripAdvisor,
--     visitachihuahuacapital.com y directorios de plaza.
--   - ARDEO y Yoko están en Cd. Juárez, no en Chihuahua capital:
--     quedan sin zona, marcados VERIFICAR en notas.
--   - whatsapp solo se captura cuando el número publicado es celular
--     (formato 52 + 10 dígitos para los links wa.me); los teléfonos
--     614/656 fijos van solo en `phone`.
--   - Volumen estimado: rango Tier 1 del plan ($8,000–$25,000/sem).
-- ============================================================

DO $$
DECLARE
  v_seller UUID;
  v_city   BIGINT;
BEGIN
  -- 1) Vendedor dueño de los prospectos
  SELECT id INTO v_seller
  FROM auth.users
  WHERE email = 'CAMBIA-ESTE-EMAIL@example.com';

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese email. Ajusta el email del vendedor en el script.';
  END IF;

  -- 2) Ciudad de Chihuahua (si existe en el catálogo)
  SELECT id INTO v_city
  FROM cities
  WHERE name ILIKE 'Chihuahua'
  ORDER BY id
  LIMIT 1;

  -- 3) Inserción idempotente
  INSERT INTO crm_prospects (
    seller_id, name, restaurant_name, city_id,
    tier, zone, weekly_volume_min, weekly_volume_max,
    phone, whatsapp, email, instagram,
    notes, source
  )
  SELECT
    v_seller, x.contact, x.restaurant, v_city,
    x.tier, x.zone, x.vmin, x.vmax,
    x.phone, x.whatsapp, x.email, x.instagram,
    x.notes, 'plan_chihuahua'
  FROM (VALUES
    -- Distrito Uno / Citadela (martes)
    ('Por confirmar', 'Mochomos', 1, 'distrito_uno', 8000, 25000,
     '(614) 425 5276', NULL, NULL, NULL,
     'Tier 1 del plan (steakhouse sonorense). Verificado ago-2026: Vía Lombardia 3001, Plaza D1, Distrito Uno; 2a sucursal en Paseo Villalta (Blvd. V. Carranza 6075). Fuentes: mochomos.mx / OpenTable. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    ('Por confirmar', 'Los Arcos', 1, 'distrito_uno', 8000, 25000,
     '(614) 888 0111', NULL, NULL, '@grupolosarcosmx',
     'Tier 1 del plan. Verificado ago-2026: Vía Citadela 5900 Local 113, Distrito Uno. Mariscos; grupo nacional con 16 sucursales. Fuentes: restaurantlosarcos.com / OpenTable. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: pescados y mariscos.'),
    ('Por confirmar', 'Kampai', 1, 'distrito_uno', 8000, 25000,
     '(614) 443 0404', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Citadela 5710, El Saucito (zona Citadela / D1). Fusión japonesa; grupo con sucursales en MTY y Puebla. Fuente: kampai.mx. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    ('Por confirmar', 'Palominos', 1, 'distrito_uno', 8000, 25000,
     '(662) 212 2700', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Cerrada Vía Lombardia 3000, Distrito Uno. Asadero sonorense con 50 años de trayectoria. ATENCIÓN: el teléfono publicado en OpenTable tiene lada 662 (Sonora) — confirmar número local en la primera visita. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM.'),
    -- Centro (lunes)
    ('Por confirmar', 'Nómada Paradero Gastronómico', 1, 'centro', 8000, 25000,
     '(614) 538 3723', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Guadalupe Victoria 200, 6° piso, Centro (vista al Centro Histórico). Cocina regional de autor con ingredientes locales. Fuentes: visitachihuahuacapital.com / Waze. Pitch zona: catálogo completo a precio de mayoreo en el corazón de la ciudad.'),
    -- Paseo Central (miércoles)
    ('Por confirmar', 'Come Camila', 1, 'paseo_central', 8000, 25000,
     '(614) 430 3067', '526143744994', 'hola@comecamila.com', NULL,
     'Tier 1 del plan. Verificado ago-2026: Periférico de la Juventud, Paseo Central N1. Cocina internacional casual desde 2006. Fuentes: comecamila.com / paseocentral.com.mx. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    ('Por confirmar', 'Barboka', 1, 'paseo_central', 8000, 25000,
     '(614) 541 6379', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Paseo Central N1. Cocina de autor low & slow con influencia mediterránea. Fuentes: paseocentral.com.mx / OpenTable. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    ('Por confirmar', 'Tutto Pepe', 1, 'paseo_central', 8000, 25000,
     '(614) 489 1477', NULL, NULL, NULL,
     'Tier 1 del plan. Verificado ago-2026: Periférico de la Juventud 5915, Paseo Central N1. Cocina italiana; pizaiolo certificado (uno de tres en México). Fuentes: tuttopepe.com.mx / OpenTable. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática.'),
    -- Fuera de Chihuahua capital (verificar antes de visitar)
    ('Por confirmar', 'ARDEO', 1, NULL, 8000, 25000,
     '(656) 741 9714', NULL, NULL, NULL,
     'Tier 1 del plan. VERIFICAR: está en Cd. Juárez (Blvd. Gómez Morín 7855, Plaza La Morin), no en Chihuahua capital. Fuente: eatardeo.com. Decidir si se mantiene para una fase 2 en Juárez.'),
    ('Por confirmar', 'Yoko', 1, NULL, 8000, 25000,
     '(656) 753 3360', NULL, NULL, NULL,
     'Tier 1 del plan. VERIFICAR: está en Cd. Juárez (Blvd. Gómez Morín 7855, Plaza La Morin, misma plaza que ARDEO). Existe listing de UberEats en Chihuahua — posible sucursal por confirmar. Fuentes: eatyoko.com / OpenTable.')
  ) AS x(contact, restaurant, tier, zone, vmin, vmax, phone, whatsapp, email, instagram, notes)
  WHERE NOT EXISTS (
    SELECT 1
    FROM crm_prospects p
    WHERE p.seller_id = v_seller
      AND p.restaurant_name = x.restaurant
  );

  RAISE NOTICE 'Prospectos Tier 1 cargados para el vendedor %', v_seller;
END $$;
