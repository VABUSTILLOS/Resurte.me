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
--
-- Notas:
--   - Los nombres de contacto quedan "Por confirmar": el vendedor
--     los completa en la primera visita.
--   - Las zonas siguen la sección 6 del plan. Mochomos no aparece
--     en ninguna ruta del documento; se deja sin zona para asignarla
--     manualmente.
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
    notes, source
  )
  SELECT
    v_seller, x.contact, x.restaurant, v_city,
    x.tier, x.zone, x.vmin, x.vmax, x.notes, 'plan_chihuahua'
  FROM (VALUES
    -- Distrito Uno / Zona Tec (martes)
    ('Por confirmar', 'Nómada Paradero Gastronómico', 1, 'distrito_uno', 8000, 25000,
     'Tier 1 del plan. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: rib eye, arrachera, queso menonita.'),
    ('Por confirmar', 'Come Camila', 1, 'distrito_uno', 8000, 25000,
     'Tier 1 del plan. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: rib eye, arrachera, queso menonita.'),
    ('Por confirmar', 'ARDEO', 1, 'distrito_uno', 8000, 25000,
     'Tier 1 del plan. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: rib eye, arrachera, queso menonita.'),
    ('Por confirmar', 'Kampai', 1, 'distrito_uno', 8000, 25000,
     'Tier 1 del plan. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: rib eye, arrachera, queso menonita.'),
    ('Por confirmar', 'Barboka', 1, 'distrito_uno', 8000, 25000,
     'Tier 1 del plan. Pitch zona: abasto premium sin salir de tu cocina; pides 9 AM, llega 4 PM. Productos clave: rib eye, arrachera, queso menonita.'),
    -- Paseo Central / Plaza del Sol (miércoles)
    ('Por confirmar', 'Los Arcos', 1, 'paseo_central', 8000, 25000,
     'Tier 1 del plan. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática. Productos clave: pollo, carne molida, tortillas, aceite.'),
    ('Por confirmar', 'Palominos', 1, 'paseo_central', 8000, 25000,
     'Tier 1 del plan. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática. Productos clave: pollo, carne molida, tortillas, aceite.'),
    ('Por confirmar', 'Tutto Pepe', 1, 'paseo_central', 8000, 25000,
     'Tier 1 del plan. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática. Productos clave: pollo, carne molida, tortillas, aceite.'),
    ('Por confirmar', 'Yoko', 1, 'paseo_central', 8000, 25000,
     'Tier 1 del plan. Pitch zona: precios de central de abastos con entrega en menos de 24 horas y factura automática. Productos clave: pollo, carne molida, tortillas, aceite.'),
    -- Sin zona en el plan (asignar manualmente tras la primera visita)
    ('Por confirmar', 'Mochomos', 1, NULL, 8000, 25000,
     'Tier 1 del plan (steakhouse). El plan no lo asigna a ninguna ruta; confirmar ubicación y asignar zona tras la primera visita.')
  ) AS x(contact, restaurant, tier, zone, vmin, vmax, notes)
  WHERE NOT EXISTS (
    SELECT 1
    FROM crm_prospects p
    WHERE p.seller_id = v_seller
      AND p.restaurant_name = x.restaurant
  );

  RAISE NOTICE 'Prospectos Tier 1 cargados para el vendedor %', v_seller;
END $$;
