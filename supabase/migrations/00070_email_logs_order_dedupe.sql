-- ============================================================
-- 00070: dedupe atómico de emails transaccionales por pedido
--
-- order-emails.ts verifica email_logs antes de enviar (check-then-send),
-- lo que admite una carrera: dos triggers concurrentes del mismo hito
-- (p.ej. doble webhook de status) podrían reenviar el correo.
--
-- Este índice único parcial garantiza a nivel DB que solo exista UN
-- registro 'sent' por (order_id, email_type); el insert duplicado falla
-- con 23505 y logEmail lo registra como warning en vez de duplicar.
-- No aplica a filas con order_id NULL (campañas de reactivación).
-- ============================================================

-- Limpieza defensiva: si ya hubiera duplicados 'sent' (por la carrera que
-- este índice previene), conserva el más antiguo para que el índice no falle.
DELETE FROM email_logs a
USING email_logs b
WHERE a.status = 'sent' AND b.status = 'sent'
  AND a.order_id IS NOT NULL
  AND a.order_id = b.order_id
  AND a.email_type = b.email_type
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_order_type_sent
  ON email_logs(order_id, email_type)
  WHERE status = 'sent' AND order_id IS NOT NULL;
