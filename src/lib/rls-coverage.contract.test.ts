/**
 * Contrato de RLS — toda tabla de `public` nace con RLS, y ninguna política de
 * escritura es incondicional para un rol de cliente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * El fallo que este test existe para que no vuelva
 * ────────────────────────────────────────────────────────────────────────────
 *
 * El 18-sep-2026 el barrido de RLS sobre las 110 tablas de `public` encontró
 * tres agujeros, los tres vivos en producción:
 *
 *   1. `email_logs` nació **sin RLS** (00019) y con el `anon=arwdDxtm` que le
 *      puso el default ACL de la relación. Un anónimo podía leer los correos de
 *      los clientes y —peor— escribir en el ledger de deduplicación: insertar
 *      filas falsas para **suprimir** correos transaccionales o borrarlas para
 *      **provocar reenvíos**.
 *
 *   2. Tres políticas de WhatsApp se llamaban "… managed by service role" pero
 *      se escribieron **sin el `TO service_role`**. Sin `TO`, el alcance es
 *      `PUBLIC`, que incluye a `anon`; y con `USING (true)` y sin `WITH CHECK`,
 *      PostgreSQL usa `USING` como `WITH CHECK`. Resultado: `USING (true) WITH
 *      CHECK (true)` para todo el mundo. "RLS encendido" no es la garantía — la
 *      garantía es que las políticas **restrinjan**.
 *
 *   3. `bump_rules`, `bump_affinity`, `leads` y `order_upsells` tenían RLS en
 *      producción **pero ninguna migración lo enciende**. Producción no era
 *      reproducible: un `supabase db reset`, un staging nuevo o una
 *      restauración tras un desastre las recreaba expuestas.
 *
 * Cómo reintroducirlos (cualquiera de estos rompe este test):
 *
 *   1. Añadir un `CREATE TABLE` en `supabase/migrations/` sin el
 *      `ALTER TABLE … ENABLE ROW LEVEL SECURITY` correspondiente.
 *   2. Añadir un `CREATE POLICY` de escritura (`FOR ALL|INSERT|UPDATE|DELETE`,
 *      o sin cláusula `FOR`, que también significa `ALL`) con `USING (true)` o
 *      `WITH CHECK (true)` y sin `TO` (o con `TO public`/`TO anon`).
 *   3. Nombrar una política "… managed by service role" y olvidar el `TO`.
 *   4. Habilitar RLS a mano en el dashboard en vez de en una migración. Es
 *      justo lo que pasó con las cuatro tablas del punto 3: la BD estaba bien
 *      y el repositorio mentía.
 *   5. Añadir un `ALTER TABLE … DISABLE ROW LEVEL SECURITY`.
 *
 * El test es **estático a propósito**: no necesita base de datos, corre en el
 * mismo `npm test` que todo lo demás y falla en CI, no en el próximo `db reset`.
 * El proyecto no tiene `supabase/tests/` ni `supabase test db` en CI, así que
 * los ficheros pgTAP que sugiere la documentación de Supabase no tendrían quién
 * los ejecutara.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Límite conocido y aceptado
 * ────────────────────────────────────────────────────────────────────────────
 *
 * * `spatial_ref_sys` (PostGIS) sigue sin RLS y con escritura para `anon`. No se
 *   puede reparar desde una migración: su dueño y su grantor son
 *   `supabase_admin`, y el rol de las migraciones (`postgres`) no es
 *   superusuario ni miembro suyo — `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
 *   devuelve `42501`, `SET ROLE supabase_admin` devuelve `42501`, y el `REVOKE`
 *   es un **no-op silencioso** (sólo emite un WARNING que el cliente no ve). Es
 *   integridad, no confidencialidad: se podría corromper un `proj4text`. Queda
 *   registrado para pedirlo a soporte de Supabase.
 * * Las 109 tablas restantes conservan su `anon=arwdDxtm` heredado del default
 *   ACL. Es vestigial (el RLS es el gate real en todas ellas) y es
 *   **load-bearing**: `00160`/`00162` dependen del `GRANT` a nivel de tabla
 *   para que sus `REVOKE UPDATE (columna)` funcionen, y `anon` necesita
 *   escribir en los caminos de invitado. Revocarlo rompería el checkout de
 *   invitado. Por eso el invariante que se congela aquí es **RLS + políticas
 *   restrictivas**, no los grants.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Tablas que se excluyen de la exigencia de RLS, con su motivo. */
const RLS_EXEMPT: Record<string, string> = {
  spatial_ref_sys:
    "PostGIS. Dueño y grantor `supabase_admin`: ni `ENABLE ROW LEVEL SECURITY` (42501) ni `REVOKE` (no-op silencioso) son posibles desde el rol de las migraciones. Es integridad, no confidencialidad. Ver la cabecera.",
};

/** Los roles que un visitante o un usuario logueado puede tener. */
const CLIENT_ROLES = new Set(["anon", "authenticated", "public"]);

const WRITE_COMMANDS = new Set(["ALL", "INSERT", "UPDATE", "DELETE"]);

/**
 * Quita comentarios de línea y de bloque. Sin esto, una línea como
 * `-- Idempotente (estilo 00028): CREATE TABLE IF NOT EXISTS + seed` se
 * escanea como si fuera SQL y produce un falso positivo.
 */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

type Migration = { file: string; sql: string };

const MIGRATIONS: Migration[] = MIGRATION_FILES.map((file) => ({
  file,
  sql: stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8")),
}));

function readMigration(name: string): Migration {
  return {
    file: name,
    sql: stripComments(readFileSync(join(MIGRATIONS_DIR, name), "utf8")),
  };
}

/** `CREATE TABLE [IF NOT EXISTS] [public.]"x"` → nombre sin comillas. */
function createdTables(sql: string): string[] {
  const re =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*(?:\(|\bAS\b)/gi;
  const out: string[] = [];
  for (const m of sql.matchAll(re)) out.push(m[1] ?? m[2] ?? "");
  return out;
}

/** `ALTER TABLE [ONLY] [public.]"x" ENABLE ROW LEVEL SECURITY` → nombre. */
function rlsEnabledTables(sql: string): string[] {
  const re =
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const out: string[] = [];
  for (const m of sql.matchAll(re)) out.push(m[1] ?? m[2] ?? "");
  return out;
}

type Policy = {
  file: string;
  name: string;
  table: string;
  /** Cláusula `FOR`; `ALL` cuando se omite (el default de PostgreSQL). */
  command: string;
  /** Roles del `TO`; `["public"]` cuando se omite. */
  roles: string[];
  usingTrue: boolean;
  checkTrue: boolean;
  hasUsing: boolean;
  hasWithCheck: boolean;
};

function unquote(token: string): string {
  return token.trim().replace(/^"|"$/g, "").toLowerCase();
}

function parseRoles(body: string): string[] {
  const m = /\bTO\s+([\s\S]*?)(?=\s+(?:USING|WITH\s+CHECK)\b|$)/i.exec(body);
  if (!m || m[1] === undefined) return ["public"];
  return m[1]
    .split(",")
    .map(unquote)
    .filter((r) => r.length > 0);
}

function parsePolicy(file: string, name: string, table: string, body: string): Policy {
  const forMatch = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(body);
  return {
    file,
    name,
    table,
    command: (forMatch?.[1] ?? "ALL").toUpperCase(),
    roles: parseRoles(body),
    usingTrue: /\bUSING\s*\(\s*true\s*\)/i.test(body),
    checkTrue: /\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(body),
    hasUsing: /\bUSING\b/i.test(body),
    hasWithCheck: /\bWITH\s+CHECK\b/i.test(body),
  };
}

/** Todas las políticas `CREATE POLICY`, tal como están escritas. */
const CREATED_POLICIES: Policy[] = MIGRATIONS.flatMap(({ file, sql }) => {
  const re =
    /\bCREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ON\s+(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))([^;]*);/gi;
  const out: Policy[] = [];
  for (const m of sql.matchAll(re)) {
    out.push(parsePolicy(file, m[1] ?? m[2] ?? "", m[3] ?? m[4] ?? "", m[5] ?? ""));
  }
  return out;
});

/**
 * `ALTER POLICY <nombre> ON <tabla> TO <roles>` reescribe el alcance de una
 * política ya creada, sin tocar su expresión. Es la reparación que usa 00167
 * para las tres políticas de WhatsApp, y este mapa es lo que permite que el
 * detector de abajo no señale el `CREATE POLICY` histórico.
 */
const ALTERED_POLICY_ROLES = new Map<string, string[]>();
for (const { sql } of MIGRATIONS) {
  const re =
    /\bALTER\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ON\s+(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))([^;]*);/gi;
  for (const m of sql.matchAll(re)) {
    const key = `${m[3] ?? m[4] ?? ""}::${m[1] ?? m[2] ?? ""}`.toLowerCase();
    ALTERED_POLICY_ROLES.set(key, parseRoles(m[5] ?? ""));
  }
}

/** La política con el alcance efectivo, ya aplicados los `ALTER POLICY`. */
function effectiveRoles(p: Policy): string[] {
  const key = `${p.table}::${p.name}`.toLowerCase();
  return ALTERED_POLICY_ROLES.get(key) ?? p.roles;
}

function reachesClient(roles: string[]): boolean {
  return roles.some((r) => CLIENT_ROLES.has(r));
}

describe("RLS: toda tabla de public nace con RLS", () => {
  it("toda tabla creada por una migración habilita RLS en alguna migración", () => {
    const created = new Map<string, string>();
    for (const { file, sql } of MIGRATIONS) {
      for (const t of createdTables(sql)) {
        if (!created.has(t)) created.set(t, file);
      }
    }

    const enabled = new Set<string>();
    for (const { sql } of MIGRATIONS) {
      for (const t of rlsEnabledTables(sql)) enabled.add(t);
    }

    const missing = [...created.entries()]
      .filter(([t]) => !enabled.has(t) && !(t in RLS_EXEMPT))
      .map(([t, file]) => `${t} (creada en ${file})`)
      .sort();

    expect(
      missing,
      "Una tabla sin RLS en un esquema expuesto a PostgREST es legible y " +
        "escribible por cualquiera que tenga un grant sobre ella — y el default " +
        "ACL le pone `arwdDxtm` a `anon` al nacer. Añade el `ALTER TABLE … " +
        "ENABLE ROW LEVEL SECURITY` en la misma migración que la crea. Si la " +
        "tabla la crea una extensión y no puedes tocarla, añádela a RLS_EXEMPT " +
        "con su motivo.",
    ).toEqual([]);
  });

  it("ninguna migración apaga RLS", () => {
    const offenders = MIGRATIONS.filter(({ sql }) =>
      /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    ).map(({ file }) => file);

    expect(
      offenders,
      "Apagar RLS deja la tabla a merced de los grants de tabla, que están " +
        "concedidos. Si de verdad hay que apagarlo, hazlo en la base de datos " +
        "y documenta por qué; no en una migración que se replica a todos los " +
        "entornos.",
    ).toEqual([]);
  });

  it("canario: el escaneo cubre todo el esquema", () => {
    const created = new Set<string>();
    for (const { sql } of MIGRATIONS) {
      for (const t of createdTables(sql)) created.add(t);
    }

    // 110 tablas en `public` a 18-sep-2026. Si esto baja, el escaneo dejó de
    // encontrar `CREATE TABLE` (un cambio de formato, un fichero que no se
    // lee) y el "0 hallazgos" de arriba sería un falso negativo.
    expect(created.size).toBeGreaterThanOrEqual(100);
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(150);
  });
});

describe("RLS: ninguna política de escritura es incondicional para un cliente", () => {
  it("no hay políticas de escritura con USING/CHECK (true) y alcance de cliente", () => {
    const offenders = CREATED_POLICIES.filter((p) => {
      if (!WRITE_COMMANDS.has(p.command)) return false;
      if (!reachesClient(effectiveRoles(p))) return false;
      // `USING (true)` y `WITH CHECK (true)` son equivalentes aquí: PostgreSQL
      // usa `USING` como `WITH CHECK` cuando no se declara el segundo.
      return p.usingTrue || p.checkTrue;
    }).map((p) => `${p.table} (${p.name}) en ${p.file} → TO ${effectiveRoles(p).join(", ")}`);

    expect(
      offenders,
      "Una política de escritura con `USING (true)` (o `WITH CHECK (true)`) y " +
        "alcance de cliente es `USING (true) WITH CHECK (true)` para `anon`: " +
        "equivale a no tener RLS, aunque `relrowsecurity` esté encendido. " +
        "Acota la política con `TO service_role` o con una expresión real " +
        "(`auth.uid() = user_id`). Ojo: **omitir el `TO` significa `TO public`**.",
    ).toEqual([]);
  });

  it("no hay políticas de escritura de cliente sin ninguna condición", () => {
    const offenders = CREATED_POLICIES.filter((p) => {
      if (!WRITE_COMMANDS.has(p.command)) return false;
      if (!reachesClient(effectiveRoles(p))) return false;
      // Sin `USING` ni `WITH CHECK` no hay condición alguna que evaluar.
      return !p.hasUsing && !p.hasWithCheck;
    }).map((p) => `${p.table} (${p.name}) en ${p.file}`);

    expect(
      offenders,
      "Una política de escritura sin `USING` ni `WITH CHECK` no tiene ninguna " +
        "condición: deja pasar todo. Declara la expresión de propiedad.",
    ).toEqual([]);
  });

  it("toda política con «service role» en el nombre está acotada a service_role", () => {
    const offenders = CREATED_POLICIES.filter((p) =>
      /service\s*role/i.test(p.name),
    )
      .filter((p) => {
        const roles = effectiveRoles(p);
        return !(roles.length === 1 && roles[0] === "service_role");
      })
      .map((p) => `${p.table} (${p.name}) en ${p.file} → TO ${effectiveRoles(p).join(", ")}`);

    expect(
      offenders,
      "Una política que dice «managed by service role» y no declara " +
        "`TO service_role` aplica a `PUBLIC` — es decir, a `anon`. Es " +
        "exactamente el fallo del 18-sep-2026: el nombre prometía una cosa y " +
        "el alcance hacía otra. Escribe el `TO`.",
    ).toEqual([]);
  });

  it("canario: el escaneo de políticas ve el corpus real", () => {
    // 163 políticas a 18-sep-2026. Un desplome aquí significa que el regex dejó
    // de casar y los tests de arriba estarían aprobando por vacío.
    expect(CREATED_POLICIES.length).toBeGreaterThanOrEqual(140);
    expect(
      CREATED_POLICIES.filter((p) => WRITE_COMMANDS.has(p.command)).length,
    ).toBeGreaterThanOrEqual(50);
  });
});

describe("00167: las reparaciones concretas del 18-sep-2026", () => {
  const FIX = "00167_rls_email_logs_y_politicas_incondicionales.sql";

  it("existe y enciende el RLS de email_logs", () => {
    expect(MIGRATION_FILES).toContain(FIX);
    const sql = readMigration(FIX).sql;
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.email_logs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("revoca los privilegios de cliente sobre las cuatro tablas reparadas", () => {
    const sql = readMigration(FIX).sql;
    for (const table of [
      "email_logs",
      "whatsapp_messages",
      "whatsapp_automations",
      "whatsapp_templates",
    ]) {
      expect(
        sql,
        `${table} volvió a quedar accesible para los roles de cliente.`,
      ).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+anon,\\s*authenticated`,
          "i",
        ),
      );
    }
  });

  it("acota las tres políticas de WhatsApp a service_role", () => {
    const sql = readMigration(FIX).sql;
    for (const [table, policy] of [
      ["whatsapp_messages", "Messages managed by service role"],
      ["whatsapp_automations", "Automations managed by service role"],
      ["whatsapp_templates", "Templates managed by service role"],
    ]) {
      expect(
        sql,
        `La política "${policy}" de ${table} volvió a tener alcance de cliente.`,
      ).toMatch(
        new RegExp(
          `ALTER\\s+POLICY\\s+"${policy}"\\s+ON\\s+public\\.${table}\\s+TO\\s+service_role`,
          "i",
        ),
      );
    }
  });

  it("recupera al control de versiones las cuatro tablas con RLS sólo en producción", () => {
    const sql = readMigration(FIX).sql;
    for (const table of ["bump_rules", "bump_affinity", "leads", "order_upsells"]) {
      expect(
        sql,
        `${table} tiene RLS en producción pero no en las migraciones: un ` +
          "`supabase db reset` la recrearía expuesta.",
      ).toMatch(
        new RegExp(
          `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          "i",
        ),
      );
    }
  });

  it("no vuelve a conceder nada a los roles de cliente", () => {
    const sql = readMigration(FIX).sql;
    const grants = sql.match(/\bGRANT\b[^;]*\bTO\b[^;]*;/gi) ?? [];
    const toClients = grants.filter((g) => /\b(?:anon|authenticated|PUBLIC)\b/i.test(g));
    expect(
      toClients,
      "00167 no debe conceder nada a `anon` ni a `authenticated`: los quince " +
        "puntos de uso de las cuatro tablas pasan por `createServiceClient()`. " +
        "Si algún día hace falta que un usuario lea lo suyo, añade la política " +
        "**y** el grant en la misma migración, con su contract test.",
    ).toEqual([]);
  });
});
