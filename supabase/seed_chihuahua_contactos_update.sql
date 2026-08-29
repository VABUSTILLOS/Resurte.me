-- ============================================================
-- Resurte.me — Intel de decisión en prospectos (Chihuahua)
--
-- Agrega a las notas de los prospectos ya cargados la información
-- pública sobre quién decide las compras en cada grupo/restaurante
-- (investigación ago-2026). El dato más relevante: Grupo Los Arcos
-- opera su propia distribuidora (MCA Mariscos Congelados Los
-- Arcos), por lo que el pitch ahí debe enfocarse en categorías que
-- MCA no cubre.
--
-- USO (SQL Editor de Supabase):
--   1. Reemplaza 'CAMBIA-ESTE-EMAIL@example.com' por el email del
--      vendedor.
--   2. Ejecuta el script. Es idempotente: solo agrega el bloque
--      "Intel de decisión" si aún no existe en las notas, y
--      conserva cualquier edición previa del vendedor.
--
-- Fuentes: Milenio, bieninformado.mx, debate.com.mx, OpenTable,
-- kampai.mx, Grupo Kampai (X), TripAdvisor, tuttopepe.com.mx,
-- lacalesasteakhouse.com.
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

  UPDATE crm_prospects p
  SET notes = p.notes || E'\n\nIntel de decisión (ago-2026): ' || u.intel
  FROM (VALUES
    ('Mochomos',
     'Grupo fundado por Alfonso Lira ("El Chigüili") con el chef Iván Ruiz (Milenio). Confirmar si las compras de la sucursal Chihuahua las decide el gerente local o el corporativo en Hermosillo. Preguntar por el gerente de compras en la primera visita.'),
    ('Los Arcos',
     'Grupo Los Arcos (fund. 1977, hermanos Angulo; cofundador Víctor Angulo Valdez). IMPORTANTE: el grupo opera su propia distribuidora, MCA Mariscos Congelados Los Arcos — es competidor directo en pescados y mariscos. El pitch aquí debe ser categorías que MCA no cubre: frutas y verduras, lácteos, quesos, abarrotes y desechables.'),
    ('Palominos',
     'Grupo Palominos: fundado por Don César Pavlovich Sugich (1973); director general Juan Carlos Puebla (bieninformado.mx). No es franquicia: cada sucursal la opera un socio local — preguntar por el socio/gerente de Chihuahua. Su proveedor insignia de cortes es Rancho El 17: entrar por categorías complementarias (verdura, lácteos, desechables), no por carne.'),
    ('Kampai',
     'Grupo Kampai con base en San Pedro, NL (marcas: OVA, MIRAI, KAMPAI, SR TANAKA, KITCHOAN, RONIN). Compras probablemente mixtas gerente local + corporativo: confirmar en la primera visita quién autoriza nuevos proveedores.'),
    ('Nómada Paradero Gastronómico',
     'Según reseñas de clientes (TripAdvisor), la chef se apoda Alejandra y la gerente Ale/Andrea — confirmar nombres completos y quién hace los pedidos en la primera visita. Restaurante independiente: la decisión es local y rápida.'),
    ('Tutto Pepe',
     'El chef es Raymundo Avena (según redes del restaurante). Restaurante local independiente: el chef/dueño decide; pida hablar directamente con él fuera de horario de servicio (15:00–17:00).'),
    ('Mercado Reforma',
     'Chef ejecutivo: Miguel Sierra Sánchez (OpenTable). Confirmar si las compras las centraliza el chef o un administrador.'),
    ('La Calesa',
     'Restaurante familiar en operación desde 1965 (60 aniversario en 2025). La decisión es de la familia dueña: preguntar por el encargado de compras o el gerente general.'),
    ('Come Camila',
     'Restaurante local desde 2006 con correo de contacto publico hola@comecamila.com y WhatsApp publicado (614) 374 4994. Pedir en recepción el contacto de quien hace los pedidos semanales.'),
    ('ARDEO',
     'Opera en Cd. Juárez (Plaza La Morin, junto a Yoko — probablemente el mismo grupo restaurantero). Confirmar el grupo y si tiene sucursal o planes en Chihuahua capital antes de agendar visita.'),
    ('Yoko',
     'Opera en Cd. Juárez (Plaza La Morin, misma plaza que ARDEO — probablemente el mismo grupo). Existe listing de UberEats en Chihuahua: confirmar si hay sucursal local antes de agendar visita.')
  ) AS u(restaurant, intel)
  WHERE p.seller_id = v_seller
    AND p.restaurant_name = u.restaurant
    AND p.notes NOT LIKE '%Intel de decisión%';

  RAISE NOTICE 'Intel de decisión agregada a las notas de los prospectos del vendedor %', v_seller;
END $$;
