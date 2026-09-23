-- ============================================================
-- 00199 — competitor_prices: varios productos nuestros pueden apuntar
--         al MISMO producto del rival
--
-- QUE CORRIGE
-- -----------
-- `00197` se aplico en produccion con `UNIQUE (supplier_slug, branch_id,
-- external_id)`, es decir uno-a-uno: un producto del rival solo podia topar el
-- precio de UN producto nuestro. La realidad de la lista de FRUGASA lo rompe:
--
--   * `ciruelo-rojo` y `ciruelo-negro`  -> "Ciruela de temporada  Kg"
--   * `arandano-fresco` y `blue-berry`  -> "Arandano Alsuper 170 Gr"
--
-- FRUGASA cotiza esas variedades como articulos distintos (R0066 tiene dos
-- opciones, R0129 y R0145 son dos renglones), pero el rival vende una sola
-- presentacion generica. Con la restriccion vieja, sembrar el tope de los
-- dos reventaba con `21000 ON CONFLICT DO UPDATE command cannot affect row
-- a second time`, y quedarse con uno solo dejaria al otro SIN tope: el
-- Ciruelo Negro se iria a $138 contra los $39.90 del rival.
--
-- La identidad correcta de una fila es la PAREJA (nuestro producto,
-- producto del rival), no el producto del rival solo.
--
-- ESTA MIGRACION YA NO ES NECESARIA EN UNA BASE NUEVA
-- ---------------------------------------------------
-- `00197` ya crea la restriccion correcta, asi que aqui las dos sentencias
-- son no-ops. Se conserva porque **en produccion ya corrio y es la que hizo
-- el cambio**: borrarla dejaria el ledger y el esquema contando historias
-- distintas. Re-ejecutarla es seguro (`DROP ... IF EXISTS` + guarda por
-- `pg_constraint`).
--
-- Lo que NO se hizo fue editar `00197` en su momento: cuando esta migracion
-- se escribio, `00197` ya estaba aplicada, y cambiarle el `ON CONFLICT` a la
-- restriccion nueva habria roto las instalaciones nuevas (donde esa
-- restriccion todavia no existe en ese punto del historial). El arreglo
-- llego despues, cuando se verifico que `00197` era la unica de las cinco
-- que no se podia re-ejecutar.
--
-- `product_id` es NULLABLE (la tabla admite guardar el catalogo del rival
-- antes de decidir a que producto nuestro corresponde). Con `NULL` en una
-- UNIQUE las filas no colisionan entre si, que es justo lo que se quiere
-- para esas filas de catalogo sin asignar.
--
-- Idempotente: `DROP ... IF EXISTS` + guarda por `pg_constraint`.
-- ============================================================

ALTER TABLE public.competitor_prices
  DROP CONSTRAINT IF EXISTS competitor_prices_supplier_slug_branch_id_external_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competitor_prices_producto_rival_key'
      AND conrelid = 'public.competitor_prices'::regclass
  ) THEN
    ALTER TABLE public.competitor_prices
      ADD CONSTRAINT competitor_prices_producto_rival_key
      UNIQUE (product_id, supplier_slug, branch_id, external_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT competitor_prices_producto_rival_key ON public.competitor_prices IS
  'Un producto del rival puede topar el precio de varios productos nuestros '
  '(p. ej. ciruelo rojo y negro comparten "Ciruela de temporada"). La identidad '
  'es la pareja (nuestro producto, producto del rival).';
