-- ============================================================
-- 00185 — CRM: tareas por prospecto
--
-- Ronda 16 del panel /admin/leads. El CRM tenía seguimiento (`next_follow_up_at`,
-- una fecha suelta) pero no trabajo: "llamar a Juan el jueves" no cabía en una
-- columna de fecha, así que el vendedor lo apuntaba fuera del CRM y el admin no
-- podía repartirlo ni verlo.
--
-- Una tarea SIEMPRE cuelga de un prospecto (`prospect_id NOT NULL`). No es una
-- lista de tareas general ni un gestor de proyectos: es el siguiente paso de un
-- trato. Por eso `ON DELETE CASCADE` — si el prospecto desaparece, su trabajo
-- pendiente no tiene sujeto y no debe quedar huérfano.
--
-- `seller_id` es el responsable y es **nullable a propósito**: una tarea puede
-- nacer en un prospecto todavía sin asignar (el pozo), igual que el prospecto.
-- `created_by` separa "quién la pidió" de "quién la hace", que es la diferencia
-- entre un admin repartiendo carga y un vendedor organizándose.
--
-- `priority` y `status` son vocabularios cerrados. La coherencia entre `status`
-- y `completed_at` es un `CHECK` bicondicional: una tarea completada **tiene**
-- fecha de cierre y una pendiente **no puede** tenerla. Sin eso, `completed_at`
-- acaba siendo una columna que a veces se escribe y a veces no, y cualquier
-- métrica de cumplimiento construida sobre ella miente.
--
-- Índices: por prospecto (la ficha pide las suyas), por vendedor+fecha (la
-- agenda) y uno parcial por vencimiento sobre las pendientes, que es la consulta
-- "qué se me pasó".
--
-- RLS: la tabla es de uso exclusivo del panel y del vendedor, ambos con
-- `service_role`, que ignora RLS. Se enciende RLS **sin ninguna política**, igual
-- que `crm_sequences` y sus hermanas en 00140: una política "para el vendedor"
-- aquí sería una segunda barrera que no puede ver el `scope` de código
-- (`CrmScope`), y dos barreras que dicen cosas distintas es peor que una. El
-- alcance se aplica en `applyCrmScope()` sobre la consulta, no aquí.
--
-- Idempotente: todo con `IF NOT EXISTS` / `DROP … IF EXISTS`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id           BIGSERIAL PRIMARY KEY,
  prospect_id  BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  seller_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  due_at       TIMESTAMPTZ,
  priority     TEXT NOT NULL DEFAULT 'media'
    CONSTRAINT crm_tasks_priority_check CHECK (priority IN ('alta', 'media', 'baja')),
  status       TEXT NOT NULL DEFAULT 'pendiente'
    CONSTRAINT crm_tasks_status_check CHECK (status IN ('pendiente', 'completada')),
  completed_at TIMESTAMPTZ,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_tasks_completed_at_check
    CHECK ((status = 'completada') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_prospect
  ON public.crm_tasks (prospect_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_seller
  ON public.crm_tasks (seller_id, due_at);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_pending_due
  ON public.crm_tasks (due_at)
  WHERE status = 'pendiente';

DROP TRIGGER IF EXISTS trg_crm_tasks_updated_at ON public.crm_tasks;

CREATE TRIGGER trg_crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_updated_at();

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.crm_tasks IS
  'Siguiente paso de un prospecto. Siempre ligada a un prospecto (ON DELETE CASCADE). RLS encendida sin políticas: la lee y la escribe el panel con service_role, y el alcance se aplica con CrmScope en código.';

COMMENT ON COLUMN public.crm_tasks.seller_id IS
  'Responsable. NULL = nace en el pozo, igual que el prospecto sin asignar.';

COMMENT ON COLUMN public.crm_tasks.completed_at IS
  'Solo puede estar presente si status = ''completada'' (CHECK bicondicional).';
