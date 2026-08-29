-- ============================================================
-- Resurte.me — Expansión de prospectos Tier 2 y Tier 3 (Chihuahua)
--
-- Segunda oleada del Plan de Prospección: restaurantes verificados
-- en fuentes públicas (ago-2026) clasificados por tier y zona según
-- las rutas de la sección 6 del plan.
--
--   Tier 2 (Growth, $3,000–$8,000/sem):  restaurantes establecidos
--     con volumen medio; steakhouses y cocina de autor conocidos.
--   Tier 3 (Long Tail, $500–$3,000/sem): taquerías, cafés y
--     cocinas caseras; alto volumen de cuentas, ticket bajo.
--
-- USO (SQL Editor de Supabase):
--   1. Reemplaza 'CAMBIA-ESTE-EMAIL@example.com' por el email del
--      vendedor (el mismo usado en el seed Tier 1).
--   2. Ejecuta el script. Es idempotente: no duplica restaurantes
--      que ya existan para ese vendedor.
--
-- Notas:
--   - Fuentes: directorios de Distrito Uno y Paseo Central,
--     visitachihuahuacapital.com, mbmarcobeteta.com, Yelp/OpenTable.
--   - Donde no se encontró teléfono público, queda NULL y el
--      vendedor lo captura en la primera visita (o vía Instagram).
--   - WhatsApp solo cuando el número publicado es celular
--      (52 + 10 dígitos, listo para links wa.me).
--   - Esta lista cubre ~20 cuentas; el objetivo de 200 del plan se
--      alcanza iterando con captura en campo y directorios de plaza.
-- ============================================================

DO $$
DECLARE
  v_seller UUID;
  v_city   BIGINT;
BEGIN
  SELECT id INTO v_seller
  FROM auth.users
  WHERE email = 'CAMBIA-ESTE-EMAIL@example.com';

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese email. Ajusta el email del vendedor en el script.';
  END IF;

  SELECT id INTO v_city
  FROM cities
  WHERE name ILIKE 'Chihuahua'
  ORDER BY id
  LIMIT 1;

  INSERT INTO crm_prospects (
    seller_id, name, restaurant_name, city_id,
    tier, zone, weekly_volume_min, weekly_volume_max,
    phone, whatsapp,
    notes, source
  )
  SELECT
    v_seller, x.contact, x.restaurant, v_city,
    x.tier, x.zone, x.vmin, x.vmax,
    x.phone, x.whatsapp,
    x.notes, 'plan_chihuahua_expansion'
  FROM (VALUES
    -- ============ TIER 2 — Distrito Uno / Citadela (martes) ============
    ('Por confirmar', 'La Calesa', 2, 'distrito_uno', 3000, 8000,
     '(614) 443 0438', NULL,
     'Clásico de cortes de la capital. Cerrada Vía Lombardia 3000, Torre Prisma piso 1, Plaza Citadela, Distrito Uno. Fuente: mbmarcobeteta.com. Tel. alterno publicado: (614) 213 4354.'),
    ('Por confirmar', 'La Cocinería', 2, 'distrito_uno', 3000, 8000,
     '(614) 430 3105', NULL,
     'Cocina de autor del chef Óscar Cortázar. Vía Lombardía 5901 int. 104, Distrito Uno. Fuente: mbmarcobeteta.com.'),
    ('Por confirmar', 'Botanero Dos Aguas', 2, 'distrito_uno', 3000, 8000,
     '(614) 425 6060', NULL,
     'Cantina mexicana contemporánea. Vía Lombardía 5700-8, Distrito Uno, El Saucito. Fuentes: mbmarcobeteta.com / OpenTable.'),
    ('Por confirmar', 'Mercado Reforma', 2, 'distrito_uno', 3000, 8000,
     '(614) 425 5864', NULL,
     'Cocina mexicana contemporánea (marca Reforma, #1 en TripAdvisor Chihuahua). Periférico de la Juventud 5700, Distrito Uno. Fuentes: mbmarcobeteta.com / TripAdvisor.'),
    -- ============ TIER 2 — Paseo Central (miércoles) ============
    ('Por confirmar', 'Great American Steakhouse', 2, 'paseo_central', 3000, 8000,
     '(614) 412 2508', '526141564882',
     'Steakhouse texano (cortes madurados en casa). Paseo Central, planta baja. Fuente: paseocentral.com.mx.'),
    ('Por confirmar', 'Shin Toshin', 2, 'paseo_central', 3000, 8000,
     '(614) 430 0970', '526141572949',
     'Cocina japonesa auténtica. Paseo Central N1. Fuente: paseocentral.com.mx. WhatsApp alterno publicado: (614) 127 8133.'),
    -- ============ TIER 2 — Centro (lunes) ============
    ('Por confirmar', 'El Poeta', 2, 'centro', 3000, 8000,
     '(614) 415 6466', NULL,
     'Restaurante del Central Hotel Boutique; cocina regional de temporada junto a la Catedral. Guadalupe Victoria 202, Centro. Fuentes: mbmarcobeteta.com / visitachihuahuacapital.com.'),
    -- ============ TIER 2 — Periférico (jueves) ============
    ('Por confirmar', 'Las Faenas', 2, 'periferico', 3000, 8000,
     NULL, NULL,
     'Steakhouse conocido en la zona del Periférico de la Juventud. Fuente: Yelp. Teléfono por capturar en visita.'),
    ('Por confirmar', 'La Garufa', 2, 'periferico', 3000, 8000,
     NULL, NULL,
     'Cortes argentinos en la zona del Periférico de la Juventud. Fuente: Yelp. Teléfono por capturar en visita.'),
    -- ============ TIER 3 — Paseo Central (miércoles) ============
    ('Por confirmar', 'Taquería Desterrados', 3, 'paseo_central', 500, 3000,
     NULL, NULL,
     'Taquería en Paseo Central N1. Fuente: directorio paseocentral.com.mx. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Reyes Cantina', 3, 'paseo_central', 500, 3000,
     NULL, NULL,
     'Cantina en Paseo Central N2. Fuente: directorio paseocentral.com.mx. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Milano Caffe Bistrot', 3, 'paseo_central', 500, 3000,
     NULL, NULL,
     'Café bistrot en Paseo Central, planta baja. Fuente: directorio paseocentral.com.mx. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Bernardi Café', 3, 'paseo_central', 500, 3000,
     NULL, NULL,
     'Cafetería en Paseo Central N1. Fuente: directorio paseocentral.com.mx. Teléfono por capturar en visita.'),
    -- ============ TIER 3 — Centro (lunes) ============
    ('Por confirmar', 'El Rodeo', 3, 'centro', 500, 3000,
     NULL, NULL,
     'Cortes y cocina del viejo oeste en el corazón del centro. C. Libertad 1705, Zona Centro. Fuente: visitachihuahuacapital.com. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Azul Clarito', 3, 'centro', 500, 3000,
     NULL, NULL,
     'Comida corrida gourmet; menú del día. Av. Paseo Bolívar 718, Zona Centro. Fuente: visitachihuahuacapital.com. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Menudería Las Campanas', 3, 'centro', 500, 3000,
     NULL, NULL,
     'Menudo famoso del centro; abre 5 AM, alto volumen de insumos de res. Calle Ángel Trías 503, Parque Rotario. Fuente: visitachihuahuacapital.com. Teléfono por capturar en visita.'),
    ('Por confirmar', 'El Gallito Mañanero', 3, 'centro', 500, 3000,
     '(614) 411 0613', NULL,
     'Desayunos mexicanos con sazón casera (chilaquiles, machaca). Av. Cuauhtémoc 3009, Zona Centro. Fuente: mbmarcobeteta.com.'),
    ('Por confirmar', 'LasPic Pizzeria', 3, 'centro', 500, 3000,
     NULL, NULL,
     'Pizzas y pastas hechas desde cero en el Centro Histórico (espaldas del Teatro de la Ciudad). Fuente: OpenTable. Teléfono por capturar en visita.'),
    -- ============ TIER 3 — Periférico (jueves) ============
    ('Por confirmar', 'El Comal de María Bonita', 3, 'periferico', 500, 3000,
     NULL, NULL,
     'Cocina casera; horario 7:00–23:00. Periférico de la Juventud 4114. Fuente: reseñas públicas. Teléfono por capturar en visita.'),
    ('Por confirmar', 'Mi Gusto Es', 3, 'periferico', 500, 3000,
     NULL, NULL,
     'Restaurante en la zona del Periférico de la Juventud. Fuente: Yelp. Teléfono por capturar en visita.')
  ) AS x(contact, restaurant, tier, zone, vmin, vmax, phone, whatsapp, notes)
  WHERE NOT EXISTS (
    SELECT 1
    FROM crm_prospects p
    WHERE p.seller_id = v_seller
      AND p.restaurant_name = x.restaurant
  );

  RAISE NOTICE 'Prospectos Tier 2/3 cargados para el vendedor %', v_seller;
END $$;
