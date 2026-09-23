-- ============================================================
-- 00197 — competitor_prices: precio de referencia de la competencia (tope)
--
-- QUE HACE
-- --------
--  1. Crea la tabla PRIVADA donde vive el precio que se usa como TOPE de
--     venta (regla de negocio: nuestro precio nunca debe superar el de la
--     competencia).
--  2. La siembra con el snapshot capturado el 22-sep-2026 para los 74
--     productos que ya existen. `00200` siembra los 61 articulos nuevos.
--
-- POR QUE EL SNAPSHOT VA EN LA MIGRACION
-- --------------------------------------
-- Mismo criterio que `00196` con la lista de FRUGASA: el dato viene de
-- FUERA (una API publica), y una migracion no puede llamarla. Guardarlo
-- aqui hace que empujar el esquema deje la tienda con los precios ya
-- topados, sin depender de que alguien corra el script con la llave de
-- servicio. El script `scripts/alsuper-prices-sync.mjs` REFRESCA el
-- snapshot; no es requisito para que el tope exista.
--
-- POR QUE ES PRIVADA Y POR QUE NO SE NOMBRA AL RIVAL EN PUBLICO
-- -------------------------------------------------------------
-- `00020_remove_rival_supermarket_refs.sql` quito de `products` (nombre,
-- descripcion y tags) toda mencion a supermercados rivales. Esa regla
-- sigue vigente: aqui el nombre del rival SI aparece, porque es una
-- tabla operativa interna, y por eso mismo `anon` y `authenticated` no
-- pueden leerla. La tienda publica nunca muestra de donde sale el tope.
--
-- POR QUE SE GUARDA `unit_price` (PRECIO POR KILO)
-- ------------------------------------------------
-- El rival vende en presentaciones distintas a las nuestras (una pieza,
-- 170 g, 1 kg). Comparar nuestro kilo contra su pieza es justo lo que
-- `src/lib/unit-price.ts` prohibe. `unit_price` es el precio normalizado
-- a kilo, calculado UNA vez; asi la migracion de precios no interpreta
-- texto. Es NULL cuando la presentacion no es un peso (pieza, manojo):
-- sin base comparable NO hay tope, y el precio queda solo con el margen.
--
-- `price` es el precio con la OFERTA vigente del rival, que es el que ve
-- su cliente; `regular_price` se guarda solo para auditar la diferencia.
--
-- LA IDENTIDAD DE UNA FILA ES LA PAREJA, NO EL RIVAL SOLO
-- ------------------------------------------------------
-- Varios articulos nuestros comparten el mismo comparable: `ciruelo-rojo` y
-- `ciruelo-negro` son dos renglones distintos en la lista de FRUGASA (R0066
-- con dos opciones) pero el rival vende una sola "Ciruela de temporada";
-- `arandano-fresco` (R0129) y `blue-berry` (R0145) apuntan los dos al mismo
-- "Arandano Alsuper". Con una `UNIQUE` sobre el producto del rival, sembrar
-- el tope de los dos revienta con `21000 ON CONFLICT DO UPDATE command
-- cannot affect row a second time`, y quedarse con uno dejaria al otro SIN
-- tope.
--
-- Por eso la restriccion es `(product_id, supplier_slug, branch_id,
-- external_id)`. `product_id` es NULLABLE a proposito: la tabla admite
-- guardar el catalogo del rival antes de decidir a que producto nuestro
-- corresponde, y con NULL las filas no colisionan entre si.
--
-- NOTA HISTORICA: en produccion esta migracion se aplico primero con una
-- `UNIQUE` sobre el producto del rival y fue `00199` la que la reemplazo.
-- Aqui ya nace correcta para que la migracion sea re-ejecutable; `00199`
-- sigue siendo valida (en produccion hace el cambio, en una base nueva es
-- una no-op) y no se toca.
--
-- Idempotente: `ON CONFLICT` sobre la pareja (nuestro producto, rival).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.competitor_prices (
  id             BIGSERIAL PRIMARY KEY,
  product_id     BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_slug  TEXT NOT NULL,
  branch_id      INTEGER NOT NULL,
  external_id    TEXT NOT NULL,
  external_name  TEXT NOT NULL,
  format         TEXT,
  price          NUMERIC(12,2) NOT NULL,
  regular_price  NUMERIC(12,2),
  unit_price     NUMERIC(12,2),
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La identidad es la PAREJA (nuestro producto, producto del rival), no el
  -- producto del rival solo: varios articulos nuestros comparten un mismo
  -- comparable (ciruelo rojo y negro -> "Ciruela de temporada"; arandano y
  -- blue berry -> "Arandano Alsuper"). Ver `00199`.
  CONSTRAINT competitor_prices_producto_rival_key
    UNIQUE (product_id, supplier_slug, branch_id, external_id)
);

COMMENT ON CONSTRAINT competitor_prices_producto_rival_key ON public.competitor_prices IS
  'Un producto del rival puede topar el precio de varios productos nuestros. '
  'La identidad es la pareja (nuestro producto, producto del rival).';

COMMENT ON TABLE public.competitor_prices IS
  'Precio de referencia de la competencia, usado como tope de venta. PRIVADA: '
  'revela de que rival nos estamos cuidando (ver 00020).';
COMMENT ON COLUMN public.competitor_prices.unit_price IS
  'Precio normalizado a kilo. NULL cuando la presentacion no es un peso (pieza, '
  'manojo): sin base comparable no hay tope.';
COMMENT ON COLUMN public.competitor_prices.price IS
  'Precio con la oferta vigente del rival: es el que ve su cliente.';

CREATE INDEX IF NOT EXISTS idx_competitor_prices_product
  ON public.competitor_prices (product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competitor_prices_supplier
  ON public.competitor_prices (supplier_slug, captured_at DESC);

ALTER TABLE public.competitor_prices ENABLE ROW LEVEL SECURITY;
-- Sin politicas: ni `anon` ni `authenticated` leen esta tabla. El unico
-- canal es `service_role` (el script de sincronizacion y el SQL de 00198).

REVOKE ALL ON public.competitor_prices FROM anon, authenticated;
GRANT ALL ON public.competitor_prices TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.competitor_prices_id_seq TO service_role;

-- Guarda en positivo: si alguien "limpia" privilegios de mas, esto falla.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.competitor_prices', 'SELECT') THEN
    RAISE EXCEPTION '00197: anon no debe poder leer competitor_prices';
  END IF;
  IF has_table_privilege('authenticated', 'public.competitor_prices', 'SELECT') THEN
    RAISE EXCEPTION '00197: authenticated no debe poder leer competitor_prices';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.competitor_prices', 'SELECT') THEN
    RAISE EXCEPTION '00197: service_role necesita leer competitor_prices';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- Snapshot del 22-sep-2026, sucursal 6 (Alsuper Plus Leones,
-- Chihuahua Capital). Solo los 74 productos que ya existen: los 61 de
-- `00200` se siembran alla, despues de crearlos.
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_filas int;
BEGIN
  CREATE TEMP TABLE _alsuper_seed (
    slug            text PRIMARY KEY,
    external_id     text NOT NULL,
    external_name   text NOT NULL,
    format          text,
    price           numeric(12,2) NOT NULL,
    regular_price   numeric(12,2),
    unit_price      numeric(12,2),
    captured_at     timestamptz NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _alsuper_seed
    (slug, external_id, external_name, format, price, regular_price, unit_price, captured_at)
  VALUES
    ('aguacate-hass', '4', 'Aguacate Hass  Kg', '1 KG', 69.90, 89.90, 69.90, '2026-09-22'),
    ('betabel', '68', 'Betabel  Kg', 'KG', 29.90, 42.90, 29.90, '2026-09-22'),
    ('cebolla-blanca', '924', 'Cebolla Blanca Premium Alsuper Por Kg', 'KG', 49.90, 99.90, 49.90, '2026-09-22'),
    ('cebolla-morada', '151', 'Cebolla Morada  Kg', 'KG', 59.90, 79.90, 59.90, '2026-09-22'),
    ('champinon', '1209', 'Champiñón Blanco Monte Blanco 450 g', '450 GR', 69.90, 69.90, 155.33, '2026-09-22'),
    ('guayaba', '58', 'Guayaba  Kg', 'KG', 36.90, 64.90, 36.90, '2026-09-22'),
    ('chile-jalapeno', '24', 'Chile Jalapeño  Kg', 'KG', 36.90, 64.90, 36.90, '2026-09-22'),
    ('mandarina', '48', 'Mandarina  Por Kg', '1 KG', 69.90, 99.90, 69.90, '2026-09-22'),
    ('manzana-roja', '13', 'Manzana red delicious  por kg', '1 KG', 49.90, 89.90, 49.90, '2026-09-22'),
    ('pimiento-morron', '62', 'Pimiento Morrón Verde  Kg', '1 KG', 54.90, 79.90, 54.90, '2026-09-22'),
    ('naranja-valencia', '7', 'Naranja Valencia  Kg', '1 KG', 39.90, 69.90, 39.90, '2026-09-22'),
    ('nopal', '239', 'Nopal en Penca Limpio  Kg', '1 KG', 44.90, 74.90, 44.90, '2026-09-22'),
    ('papa-blanca', '922', 'Papa Blanca Primera Alsuper Kg', 'KG', 56.90, 99.90, 56.90, '2026-09-22'),
    ('pepino', '12', 'Pepino   Kg', '1 KG', 19.90, 39.90, 19.90, '2026-09-22'),
    ('pera', '40', 'Pera de Anjou  Kg', '1 KG', 49.90, 89.90, 49.90, '2026-09-22'),
    ('platano-macho', '136', 'Plátano macho  Kg', 'KG', 39.90, 59.90, 39.90, '2026-09-22'),
    ('sandia', '21', 'Sandía  Kg', 'KG', 19.90, 38.90, 19.90, '2026-09-22'),
    ('jitomate-bola', '2', 'Tomate bola  Kg', '1 KG', 26.90, 64.90, 26.90, '2026-09-22'),
    ('jitomate-saladet', '98', 'Tomate Saladet  Kg', '1 KG', 29.90, 64.90, 29.90, '2026-09-22'),
    ('tomate-verde', '65', 'Tomatillo  Kg', 'KG', 36.90, 49.90, 36.90, '2026-09-22'),
    ('toronja', '52', 'Toronja  Kg', '1 KG', 39.90, 59.90, 39.90, '2026-09-22'),
    ('uvas-rojas', '35', 'Uva Roja  Kg', '1 KG', 79.90, 139.90, 79.90, '2026-09-22'),
    ('uvas-verdes', '34', 'Uva blanca sin semilla  kg', '1 KG', 99.90, 149.90, 99.90, '2026-09-22'),
    ('zanahoria', '11', 'Zanahoria  Kg', '1 KG', 16.90, 29.90, 16.90, '2026-09-22'),
    ('chile-poblano', '91', 'Chile Poblano  Kg', 'KG', 49.90, 74.90, 49.90, '2026-09-22'),
    ('chile-serrano', '92', 'Chile Serrano  Kg', 'KG', 36.90, 99.90, 36.90, '2026-09-22'),
    ('chile-habanero', '800', 'CHILE HABANERO NARANJA     1 PIEZA', '1 PZ', 32.90, 32.90, NULL, '2026-09-22'),
    ('jengibre-fresco', '189', 'Jengibre  Kg', 'KG', 169.90, 169.90, 169.90, '2026-09-22'),
    ('limon-agrio', '3', 'Limón Agrio    Kg', '1 KG', 42.90, 69.90, 42.90, '2026-09-22'),
    ('kale-organico-1kg', '694', 'Kale Baby Orgánico  Earthbound Pza', '1 PZ', 119.90, 119.90, NULL, '2026-09-22'),
    ('frijol-negro-1kg', '313823', 'Frijol Negro Verde Valle 1 kg', '1 KG', 54.90, 61.90, 54.90, '2026-09-22'),
    ('arroz-blanco-1kg', '374296', 'Arroz Super Extra Verde Valle 2 kg', '2 KG', 74.90, 79.90, 37.45, '2026-09-22'),
    ('lenteja-1kg', '7126666', 'Lenteja  Verde Valle 500 g', '500 GR', 27.90, 32.90, 55.80, '2026-09-22'),
    ('quinoa-1kg', '397245', 'Quinoa  Pick-One 500 g', '500 GR', 99.90, 109.90, 199.80, '2026-09-22'),
    ('semilla-chia-1kg', '402199', 'Chia  Semilla Okko 300 g', '300 GR', 58.90, 64.90, 196.33, '2026-09-22'),
    ('consome-de-pollo-1kg', '465253', 'Consome de pollo en Caldo  Knorr 750 g', '750 GR', 119.90, 144.90, 159.87, '2026-09-22'),
    ('sal-de-mar-fina-1kg', '422481', 'Sal Natural De Mar en grano La Fina 1 kg', '1 KG', 22.90, 22.90, 22.90, '2026-09-22'),
    ('azucar-refinada-5kg', '404071', 'Azucar Refinada Zulka 1 kg', '1 KG', 39.90, 39.90, 39.90, '2026-09-22'),
    ('cocoa-polvo-1kg', '446931', 'Cocoa Natural   Molina 125 g', '125 GR', 55.90, 55.90, 447.20, '2026-09-22'),
    ('pimenton', '413529', 'Pimenton Dulce Frasco Paprika Terana 58 Gr', '58 GR', 46.90, 46.90, 808.62, '2026-09-22'),
    ('hoja-de-laurel', '362880', 'Hoja De Laurel Mimarca 20 Gr', '20 GR', 10.90, 10.90, 545.00, '2026-09-22'),
    ('comino-molido', '313721', 'Comino Molido Mimarca 70 Gr', '70 GR', 21.90, 21.90, 312.86, '2026-09-22'),
    ('oregano-molido-100g', '362884', 'Oregano Mimarca 40 Gr', '40 GR', 11.90, 11.90, 297.50, '2026-09-22'),
    ('canela-en-polvo', '509160', 'CANELA EN POLVO  BADIA  454 GRAMOS', '454 GR', 259.90, 259.90, 572.47, '2026-09-22'),
    ('pimienta-negra-molida', '365814', 'Pimienta Negra Molida Mccormick 64 g', '64 GR', 67.90, 77.90, 1060.94, '2026-09-22'),
    ('pasas', '362888', 'Uva Pasa Mimarca 250 Gr', '250 GR', 38.90, 38.90, 155.60, '2026-09-22'),
    ('almendras-500g', '504236', 'ALMENDRA ENTERA  800 GRAMOS', '800 GR', 319.90, 319.90, 399.87, '2026-09-22'),
    ('nuez-de-castilla', '437439', 'Nuez En Mitades Promanuez 200 Gr', '200 GR', 89.90, 89.90, 449.50, '2026-09-22'),
    ('achiote', '7810114', 'Achiote  La Anita 110 g', '110 GR', 13.90, 15.90, 126.36, '2026-09-22'),
    ('ajo', '414297', 'Ajo en malla con 4 Alsuper por pieza', '1 PZ', 56.90, 64.90, NULL, '2026-09-22'),
    ('apio', '67', 'Apio  Kg', '1 KG', 24.90, 39.90, 24.90, '2026-09-22'),
    ('brocoli', '71', 'Brócoli  Kg', 'KG', 49.90, 59.90, 49.90, '2026-09-22'),
    ('chayote', '79', 'Chayote  Kg', 'KG', 29.90, 59.90, 29.90, '2026-09-22'),
    ('cilantro', '105', 'Cilantro Alsuper Por Manojo', '1 MA', 11.90, 13.90, NULL, '2026-09-22'),
    ('col-blanca', '61', 'Repollo  Kg', '1 KG', 23.90, 34.90, 23.90, '2026-09-22'),
    ('coliflor', '70', 'Coliflor  Pza', '1 PZ', 49.90, 69.90, NULL, '2026-09-22'),
    ('elote', '73', 'Elote Blanco  3 Pzas', '1 PZ', 46.90, 46.90, NULL, '2026-09-22'),
    ('epazote', '178', 'Epazote Alsuper pza', '1 PZ', 14.90, 14.90, NULL, '2026-09-22'),
    ('espinaca', '678', 'Espinaca Baby Alsuper Pza', '1 PZ', 64.90, 77.90, NULL, '2026-09-22'),
    ('fresa', '99', 'Fresa   pza', '1 PZ', 39.90, 89.90, NULL, '2026-09-22'),
    ('hierbabuena-fresca', '183', 'Hierbabuena Alsuper Pza', '1 PZ', 14.90, 14.90, NULL, '2026-09-22'),
    ('lechuga-romana', '983', 'Lechuga Romana Orgánica Mr Lucky Pza', '1 PZ', 32.90, 32.90, NULL, '2026-09-22'),
    ('mango-ataulfo', '503609', 'MANGO DESHIDRATADO NATURAL ALSUPER 200 GRAMOS', '200 GR', 109.90, 119.90, NULL, '2026-09-22'),
    ('melon-chino', '20', 'Melón Chino  Kg', 'KG', 29.90, 39.90, 29.90, '2026-09-22'),
    ('papaya-maradol', '444', 'Papaya maradol  Kg', 'KG', 39.90, 69.90, 39.90, '2026-09-22'),
    ('perejil', '108', 'Perejil Liso  Manojo', '1 MA', 16.90, 16.90, NULL, '2026-09-22'),
    ('pina-miel', '881', 'Piña miel  Kg', 'KG', 39.90, 59.90, 39.90, '2026-09-22'),
    ('rabano', '113', 'Rábano  Manojo', '1 MA', 14.90, 14.90, NULL, '2026-09-22'),
    ('romero-fresco', '785', 'ROMERO GOURMET ALSUPER    1 PIEZA', '1 PZ', 42.90, 42.90, NULL, '2026-09-22'),
    ('tomillo-fresco', '788', 'TOMILLO GOURMET ALSUPER    1 PIEZA', '1 PZ', 42.90, 42.90, NULL, '2026-09-22'),
    ('zarzamora', '742', 'Zarzamora Alsuper 170 Gr', '1 PZ', 49.90, 89.90, NULL, '2026-09-22'),
    ('germinado-de-soya', '77', 'Germinado Soya  Kg', '1 KG', 49.90, 49.90, 49.90, '2026-09-22'),
    ('cebolla-cambray', '104', 'Cebollita Cambray  Manojo', '1 MA', 15.90, 22.90, NULL, '2026-09-22'),
    ('jitomate-cherry', '328', 'Tomate Cherry Glorys Naturesweet Pza', '1 PZ', 54.90, 54.90, NULL, '2026-09-22');

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, s.external_id, s.external_name,
         s.format, s.price, s.regular_price, s.unit_price, s.captured_at
  FROM _alsuper_seed s
  JOIN public.products p ON p.slug = s.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET product_id = EXCLUDED.product_id,
        external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 74 THEN
    RAISE WARNING
      '00197: se esperaban 74 precios de referencia y se escribieron %. Revisa que los slugs sigan existiendo.',
      v_filas;
  ELSE
    RAISE NOTICE '00197: % precios de referencia sembrados.', v_filas;
  END IF;
END $$;
