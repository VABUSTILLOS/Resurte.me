-- ============================================================
-- 00201 — Quitar la marca SuKarne que se colo con el seed de AB Foods
--
-- QUE CORRIGE
-- -----------
-- `00020_remove_rival_supermarket_refs.sql` fue explicito: ademas de las
-- cadenas de supermercados rivales, habia que quitar la marca **SuKarne** de
-- `products` (nombre, descripcion y brand). Esa migracion corrio, pero el
-- seed de AB Foods (`supabase/seed_ab_foods.sql`, commit `2d8ae2d6`) es
-- POSTERIOR y volvio a crear un producto con la marca:
--
--   `arrachera-premium-sukarne` -> name "Arrachera premium SuKarne",
--                                  brand "SuKarne"
--
-- El producto nacio OCULTO (`price = 0`, `is_visible = false`), asi que el
-- incumplimiento no se veia; `00191` lo publico el 22-sep-2026 y desde
-- entonces la marca esta en la tienda. Se detecto el 1-oct-2026 al verificar
-- los precios de los dos proveedores.
--
-- QUE HACE
-- --------
--  1. `brand`: SuKarne -> 'Local' (mismo criterio que `00020`).
--  2. `name`: quita el token SuKarne y normaliza los espacios. NO se usa el
--     `regexp_replace(..., 'Local')` de `00020` porque aqui daria
--     "Arrachera premium Local", que se lee mal: en un nombre la marca se
--     ELIMINA, no se sustituye.
--  3. `description` y `tags`: mismo barrido, por si otro producto lo trae.
--
-- POR QUE NO SE TOCA EL `slug`
-- ----------------------------
-- Cambiarlo romperia las URLs. La regla del panel de productos es explicita
-- ("el slug NUNCA se regenera al editar el nombre") y `00020` tampoco toco
-- slugs. `arrachera-premium-sukarne` se queda como identificador estable; lo
-- que ve el cliente es `name`.
--
-- Idempotente: re-ejecutarla no encuentra nada que cambiar.
-- ============================================================

DO $$
DECLARE
  v_brand int;
  v_name int;
  v_desc int;
  v_tags int;
  v_restantes int;
BEGIN
  -- 1) brand: la marca se sustituye por 'Local' (precedente de 00020).
  UPDATE public.products
  SET brand = 'Local',
      updated_at = now()
  WHERE brand ILIKE '%sukarne%';
  GET DIAGNOSTICS v_brand = ROW_COUNT;

  -- 2) name: se ELIMINA el token y se colapsan los espacios sobrantes.
  --    `\s+` -> ' ' y `trim()` porque quitar una palabra del medio deja dos
  --    espacios ("Arrachera premium  "), y el nombre se pinta tal cual.
  UPDATE public.products
  SET name = trim(regexp_replace(
        regexp_replace(name, '\s*sukarne\s*', ' ', 'gi'),
        '\s+', ' ', 'g'
      )),
      updated_at = now()
  WHERE name ILIKE '%sukarne%';
  GET DIAGNOSTICS v_name = ROW_COUNT;

  -- 3) description y tags: mismo barrido que 00020.
  UPDATE public.products
  SET description = trim(regexp_replace(
        regexp_replace(description, '\s*sukarne\s*', ' ', 'gi'),
        '\s+', ' ', 'g'
      )),
      updated_at = now()
  WHERE description ILIKE '%sukarne%';
  GET DIAGNOSTICS v_desc = ROW_COUNT;

  UPDATE public.products
  SET tags = COALESCE(
        (
          SELECT jsonb_agg(tag)
          FROM jsonb_array_elements_text(tags) AS t(tag)
          WHERE tag NOT ILIKE '%sukarne%'
        ),
        '[]'::jsonb
      ),
      updated_at = now()
  WHERE tags IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(tags) AS t(tag)
      WHERE tag ILIKE '%sukarne%'
    );
  GET DIAGNOSTICS v_tags = ROW_COUNT;

  -- Guarda en positivo: la migracion no puede "pasar" habiendo dejado marca.
  SELECT count(*) INTO v_restantes
  FROM public.products
  WHERE name ILIKE '%sukarne%'
     OR brand ILIKE '%sukarne%'
     OR COALESCE(description, '') ILIKE '%sukarne%'
     OR (tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(tags) AS t(tag)
          WHERE tag ILIKE '%sukarne%'
        ));

  IF v_restantes > 0 THEN
    RAISE EXCEPTION
      '00201: quedan % productos con la marca SuKarne en nombre, brand, descripcion o tags',
      v_restantes;
  END IF;

  RAISE NOTICE '00201: SuKarne fuera del catalogo (brand %, name %, description %, tags %).',
    v_brand, v_name, v_desc, v_tags;
END $$;
