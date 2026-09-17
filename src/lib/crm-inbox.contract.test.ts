import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { phoneKey } from "./crm-pipeline"
import {
  INBOX_BUCKETS,
  INBOX_BUCKET_LABEL,
  WHATSAPP_WINDOW_HOURS,
  isInboxBucket,
  nextSequenceRun,
  phoneLookupVariants,
  quickReplyVariables,
  renderQuickReply,
} from "./crm-inbox"
import {
  CRM_SEQUENCE_AUTOMATION_TYPE,
  MAX_SEQUENCE_DELAY_HOURS,
  MAX_SEQUENCE_STEPS,
  type SequenceAdvance,
} from "./crm-sequences-engine"
import { CRM_TABS, INBOX_VIEWS } from "./crm-filters"
import { AUDIT_ACTIONS } from "./audit-log"

/**
 * Contrato entre la bandeja de conversaciones (`@/lib/crm-inbox`,
 * `@/lib/crm-sequences-engine`, `@/lib/crm-ai`) y el esquema que la sostiene
 * (`00140_leads_crm_inbox.sql`, más `00097` para el registro de envíos).
 *
 * La Ronda 6 abre una vista que hasta ahora no existía: leer los mensajes que
 * el webhook guarda desde 00041. Esa vista se apoya en decisiones de esquema
 * que el TypeScript **no puede** validar por sí solo, y cada una tiene un modo
 * de fallar silencioso:
 *
 *  1. `from_digits` es una columna GENERADA con la misma expresión que
 *     `phoneKey()`. Si alguien la cambia a mano (o la vuelve una columna
 *     normal), la bandeja deja de encontrar conversaciones: los mensajes
 *     existen pero nadie los une con el prospecto. Sin error, sin log.
 *  2. `phoneKey()` devuelve `null` —no cadena vacía— cuando no hay dígitos.
 *     La columna usa `NULLIF(..., '')` por eso: un `''` casaría con cualquier
 *     prospecto sin teléfono y mezclaría conversaciones ajenas.
 *  3. `tags` es NOT NULL con DEFAULT `'{}'`: `readTags()` asume arreglo, y un
 *     NULL ahí obliga a un `?? []` en cada lector que alguien va a olvidar.
 *  4. Las cuatro tablas nuevas llevan RLS habilitada **sin políticas**. Si
 *     alguien añade una política permisiva, la cartera de conversaciones
 *     (nombre, teléfono, contenido de mensajes) queda expuesta a `anon`.
 *  5. `crm_sequences.is_active` nace en `false`. Es el freno de mano: una
 *     secuencia no debe empezar a mandar WhatsApp por existir.
 *  6. El CHECK de `crm_sequence_enrollments.status` es el vocabulario que el
 *     motor escribe (`activa` / `completada`, más `pausada` / `cancelada`).
 *     Un valor del motor fuera del CHECK rompe el cron entero.
 *  7. El CHECK de `crm_sequence_steps` (plantilla **o** cuerpo) es el mismo
 *     criterio que aplica `normalizeSequenceSteps` al descartar pasos vacíos.
 *  8. Los envíos van a `whatsapp_automation_sends` con `automation_type`
 *     `'crm_sequence'`, que es TEXT en 00097 — así que el valor tiene que
 *     coincidir con la constante, no con un enum de la base.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")

const MIGRATION_00140 = "00140_leads_crm_inbox.sql"
const MIGRATION_00097 = "00097_whatsapp_automation_sends.sql"

const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8")

/** Comentarios fuera: un CHECK comentado no cuenta como contrato. */
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")

const migration = stripComments(readMigration(MIGRATION_00140))
const sendsMigration = stripComments(readMigration(MIGRATION_00097))

describe("contrato de la clave de teléfono (`from_digits`)", () => {
  it("la columna es GENERADA y almacenada, no un campo que se escribe a mano", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS from_digits TEXT[\s\S]{0,200}?GENERATED ALWAYS AS[\s\S]{0,300}?STORED/i
    )
  })

  it("la expresión del SQL es la misma que phoneKey(): últimos 10 dígitos", () => {
    const expression = migration.match(
      /GENERATED ALWAYS AS\s*\(\s*NULLIF\(\s*right\(\s*regexp_replace\(\s*from_number\s*,\s*'\\D'\s*,\s*''\s*,\s*'g'\s*\)\s*,\s*10\s*\)\s*,\s*''\s*\)\s*\)/i
    )
    expect(expression).not.toBeNull()
  })

  it("NULLIF deja NULL y no cadena vacía (evita cruzar prospectos sin teléfono)", () => {
    expect(migration).toMatch(/NULLIF\([\s\S]*?,\s*''\s*\)/)
    // El mismo criterio del lado TS.
    expect(phoneKey(null)).toBeNull()
    expect(phoneKey("")).toBeNull()
    expect(phoneKey("sin teléfono")).toBeNull()
  })

  it("el índice cubre la consulta real: igualdad + más recientes primero", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_digits\s+ON public\.whatsapp_messages \(from_digits, created_at DESC\)/i
    )
  })

  it("phoneLookupVariants produce variantes con la misma clave de 10 dígitos", () => {
    const variants = phoneLookupVariants("+52 614 123 4567")
    expect(variants).toContain("6141234567")
    expect(variants.every((v) => v.endsWith(phoneKey("+52 614 123 4567") ?? ""))).toBe(true)
    // Sin dígitos no hay variantes: la consulta se omite, no se hace con `''`.
    expect(phoneLookupVariants("N/A")).toEqual([])
    expect(phoneLookupVariants("system")).toEqual([])
  })
})

describe("contrato de etiquetas (`crm_prospects.tags`)", () => {
  it("es un arreglo NOT NULL con default vacío", () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.crm_prospects\s+ADD COLUMN IF NOT EXISTS tags TEXT\[\] NOT NULL DEFAULT '\{\}'/i
    )
  })

  it("tiene índice GIN, que es lo que hace usable el operador de contención", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_crm_prospects_tags\s+ON public\.crm_prospects USING GIN \(tags\)/i
    )
  })
})

describe("contrato de las secuencias de goteo", () => {
  it("una secuencia nace APAGADA: el DEFAULT de is_active es false", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.crm_sequences[\s\S]*?is_active\s+BOOLEAN NOT NULL DEFAULT false/i
    )
    // Regresión: un DEFAULT true convertiría cada secuencia nueva en un envío.
    expect(migration).not.toMatch(/crm_sequences[\s\S]{0,400}?is_active\s+BOOLEAN NOT NULL DEFAULT true/i)
  })

  it("el CHECK de status de la inscripción cubre lo que el motor escribe", () => {
    const check = migration.match(/status\s+TEXT NOT NULL DEFAULT 'activa'\s+CHECK \(status IN \(([^)]*)\)\)/i)
    expect(check).not.toBeNull()
    const values = [...(check?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
    expect(values).toEqual(["activa", "pausada", "completada", "cancelada"])

    // `SequenceAdvance` solo puede terminar en dos de esos valores.
    const advances: SequenceAdvance[] = [
      { current_step: 1, next_run_at: nextSequenceRun(new Date(), 24), status: "activa" },
      { current_step: 2, next_run_at: null, status: "completada" },
    ]
    for (const advance of advances) {
      expect(values).toContain(advance.status)
    }
    // El default de la inscripción es el estado del que parte el motor.
    expect(values[0]).toBe("activa")
  })

  it("los pasos van numerados desde 1 y sin huecos repetidos", () => {
    expect(migration).toMatch(/step_order\s+INTEGER NOT NULL CHECK \(step_order > 0\)/)
    expect(migration).toMatch(/CONSTRAINT crm_sequence_steps_order_unique UNIQUE \(sequence_id, step_order\)/)
    // El motor renumera desde 1, que es lo que el CHECK exige.
    expect(MAX_SEQUENCE_STEPS).toBeGreaterThan(0)
  })

  it("el CHECK del paso coincide con el criterio de normalizeSequenceSteps", () => {
    expect(migration).toMatch(
      /CONSTRAINT crm_sequence_steps_payload_check\s+CHECK \(template_name IS NOT NULL OR body IS NOT NULL\)/i
    )
    expect(migration).toMatch(/delay_hours\s+INTEGER NOT NULL DEFAULT 24 CHECK \(delay_hours >= 0\)/)
  })

  it("el tope de espera del motor no excede lo que la columna puede guardar", () => {
    expect(Number.isInteger(MAX_SEQUENCE_DELAY_HOURS)).toBe(true)
    expect(MAX_SEQUENCE_DELAY_HOURS).toBeGreaterThan(0)
    // `delay_hours` es INTEGER: 30 días entra de sobra, pero un tope absurdo
    // desbordaría o agendaría en el año 3000.
    expect(MAX_SEQUENCE_DELAY_HOURS).toBeLessThan(365 * 24)
  })

  it("un prospecto no se inscribe dos veces en la misma secuencia", () => {
    expect(migration).toMatch(
      /CONSTRAINT crm_sequence_enrollments_unique UNIQUE \(sequence_id, prospect_id\)/
    )
  })

  it("el cron solo busca lo vencido y activo: índice parcial", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_due\s+ON public\.crm_sequence_enrollments \(next_run_at\)\s+WHERE status = 'activa'/i
    )
    // Un índice completo no serviría al cron y costaría escrituras.
    expect(migration).toMatch(
      /idx_crm_sequence_enrollments_due[\s\S]{0,160}?WHERE status = 'activa'/i
    )
  })

  it("current_step arranca en 0 = inscrito, todavía sin enviar", () => {
    expect(migration).toMatch(/current_step\s+INTEGER NOT NULL DEFAULT 0 CHECK \(current_step >= 0\)/)
  })

  it("los envíos reutilizan whatsapp_automation_sends con un tipo de texto", () => {
    expect(sendsMigration).toMatch(/automation_type\s+TEXT NOT NULL/)
    expect(sendsMigration).toMatch(/dedupe_key\s+TEXT NOT NULL/)
    expect(sendsMigration).toMatch(/UNIQUE \(dedupe_key\)/)
    // El valor lo fija TS, no un enum de la base: tiene que ser el de la constante.
    expect(CRM_SEQUENCE_AUTOMATION_TYPE).toBe("crm_sequence")
    expect(sendsMigration).not.toMatch(/automation_type\s+.*CHECK/i)
  })
})

describe("contrato de las respuestas rápidas", () => {
  it("el título es único: es lo que permite mapear 23505 a un mensaje claro", () => {
    expect(migration).toMatch(/CONSTRAINT crm_quick_replies_title_unique UNIQUE \(title\)/)
  })

  it("solo se ofrecen las activas: el índice es parcial", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_crm_quick_replies_active\s+ON public\.crm_quick_replies \(sort_order, title\)\s+WHERE is_active/i
    )
    expect(migration).toMatch(/is_active\s+BOOLEAN NOT NULL DEFAULT true/)
  })

  it("las variables del cuerpo sobreviven el viaje por la base sin renderizar", () => {
    // El SQL guarda texto literal; el render es del TS. Una variable que el
    // motor no reconozca tiene que quedarse visible, no borrarse.
    expect(renderQuickReply("Hola {{nombre}}", { nombre: "Ana" })).toBe("Hola Ana")
    expect(renderQuickReply("Hola {{desconocida}}", {})).toBe("Hola {{desconocida}}")
    expect(quickReplyVariables("Hola {{nombre}} de {{restaurante}}")).toEqual([
      "nombre",
      "restaurante",
    ])
  })
})

describe("contrato de RLS: las tablas nuevas son solo del panel", () => {
  const NEW_TABLES = [
    "crm_quick_replies",
    "crm_sequences",
    "crm_sequence_steps",
    "crm_sequence_enrollments",
  ]

  for (const table of NEW_TABLES) {
    it(`${table} habilita RLS`, () => {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`, "i")
      )
    })

    it(`${table} NO define políticas permisivas`, () => {
      // Habilitar RLS sin políticas deja fuera a anon/authenticated. Una
      // política aquí expondría teléfonos y contenido de conversaciones.
      expect(migration).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${table}`, "i"))
    })
  }

  it("no se relaja la RLS de crm_prospects para exponer la cartera", () => {
    // `crm_prospects_owner_all` filtra por seller_id; añadir un OR para los
    // NULL abriría los prospectos sin asignar a cualquier vendedor.
    expect(migration).not.toMatch(/CREATE POLICY[^;]*ON public\.crm_prospects/i)
    expect(migration).not.toMatch(/ALTER TABLE public\.crm_prospects\s+DISABLE ROW LEVEL SECURITY/i)
  })

  it("no se toca la RLS de whatsapp_messages al añadir from_digits", () => {
    // La bandeja lee con service_role; si el cambio de esquema reescribiera las
    // políticas de mensajes, el webhook podría perder acceso.
    expect(migration).not.toMatch(/CREATE POLICY[^;]*ON public\.whatsapp_messages/i)
    expect(migration).not.toMatch(
      /ALTER TABLE public\.whatsapp_messages\s+(ENABLE|DISABLE) ROW LEVEL SECURITY/i
    )
  })
})

describe("contrato de la no-denormalización", () => {
  it("no se añaden columnas de 'último mensaje' a crm_prospects", () => {
    // La decisión declarada: la recencia se calcula en memoria desde los
    // mensajes. Una columna denormalizada se quedaría obsoleta y obligaría a
    // escribir en el webhook (ruta caliente, con HMAC).
    expect(migration).not.toMatch(/ADD COLUMN[^;]*last_inbound_at/i)
    expect(migration).not.toMatch(/ADD COLUMN[^;]*last_message_preview/i)
    expect(migration).not.toMatch(/ADD COLUMN[^;]*last_message_at/i)
  })
})

describe("contrato de la ventana de 24 h", () => {
  it("la constante del motor es la ventana real de WhatsApp", () => {
    expect(WHATSAPP_WINDOW_HOURS).toBe(24)
  })

  it("la migración documenta la regla y no la reimplementa en SQL", () => {
    // La compuerta es del servidor (TS), no un DEFAULT de columna: si viviera
    // en el esquema, cambiar la política exigiría una migración.
    expect(migration).toMatch(/ventana de 24 h/i)
    expect(migration).not.toMatch(/interval '24 hours'/i)
  })
})

describe("contrato del vocabulario de la bandeja", () => {
  it("los cubos del motor son un vocabulario cerrado y etiquetado", () => {
    for (const bucket of INBOX_BUCKETS) {
      expect(isInboxBucket(bucket)).toBe(true)
      expect(INBOX_BUCKET_LABEL[bucket].length).toBeGreaterThan(0)
    }
    expect(isInboxBucket("bandeja-inventada")).toBe(false)
    expect(isInboxBucket("")).toBe(false)
  })

  it("la cuarta pestaña y las vistas de la bandeja existen y son estables", () => {
    expect(CRM_TABS).toContain("bandeja")
    expect(INBOX_VIEWS.length).toBeGreaterThan(0)
    // Un renombre de la pestaña rompería los deep-links ya compartidos.
    expect(CRM_TABS[0]).toBe("leads")
  })
})

describe("contrato de auditoría de la bandeja", () => {
  const EXPECTED = [
    "crm_prospect_message",
    "crm_prospect_tags",
    "crm_prospect_bulk_assign",
    "crm_quick_reply_save",
    "crm_quick_reply_delete",
    "crm_sequence_enroll",
    "crm_sequence_save",
    "crm_sequence_toggle",
    "crm_sequence_cancel",
  ]

  for (const action of EXPECTED) {
    it(`la acción ${action} está declarada como literal`, () => {
      // `AUDIT_ACTIONS` es un `as const` de literales: un identificador sin
      // comillas compila como variable y revienta en runtime.
      expect(AUDIT_ACTIONS).toContain(action)
    })
  }
})
