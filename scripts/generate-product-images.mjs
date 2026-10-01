#!/usr/bin/env node
// Genera imágenes de catálogo con Kie.ai (GPT-4o Image) para los productos de
// scripts/product-images/targets.json y las guarda en
// public/images/products/ai/<slug>.webp + manifest.json (slug → ruta).
//
// Por qué existe: ~83 productos publicados usan imágenes genéricas,
// reutilizadas entre SKUs o equivocadas (el aguacate muestra ajos). Este
// script produce fotos de catálogo consistentes sin atribuciones.
//
// La API key se lee SOLO de .env.local (server-side); nunca va al navegador.
//
// Uso:
//   node scripts/generate-product-images.mjs              # todos los targets
//   node scripts/generate-product-images.mjs --only=ajo,aguacate-chunky-caja-7264kg
//   node scripts/generate-product-images.mjs --force      # regenera aunque ya exista
//
// Es reanudable: los slugs que ya están en manifest.json con archivo en disco
// se saltan (salvo --force).

import { createRequire } from "node:module"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TARGETS_PATH = join(ROOT, "scripts/product-images/targets.json")
const MANIFEST_PATH = join(ROOT, "scripts/product-images/manifest.json")
const OUT_DIR = join(ROOT, "public/images/products/ai")
const PUBLIC_PREFIX = "/images/products/ai"

const KIE_BASE = "https://api.kie.ai"
const CONCURRENCY = 4
const POLL_INTERVAL_MS = 4_000
const POLL_TIMEOUT_MS = 240_000
const MAX_ATTEMPTS = 3

// ─── env ───────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    if (!/^[A-Z_]+=/.test(line)) continue
    const i = line.indexOf("=")
    env[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "")
  }
  return env
}

const API_KEY = loadEnv().KIE_AI_API_KEY
if (!API_KEY) {
  console.error("KIE_AI_API_KEY no está en .env.local")
  process.exit(1)
}

// ─── Kie.ai (mismo contrato que src/lib/ai/kie-ai.ts) ─────────────────────

async function kieFetch(path, init) {
  const res = await fetch(`${KIE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }
  if (!res.ok) {
    const msg = (json && typeof json === "object" && json.message) || `Kie.ai ${res.status}`
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg))
  }
  return json
}

async function createImageTask(prompt) {
  const data = await kieFetch("/api/v1/gpt4o-image/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, size: "1:1" }),
  })
  const taskId = data.taskId ?? data.data?.taskId
  if (!taskId) throw new Error("Kie.ai no devolvió taskId: " + JSON.stringify(data).slice(0, 200))
  return taskId
}

async function pollTask(taskId) {
  const start = Date.now()
  for (;;) {
    const data = await kieFetch(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`)
    const record = data.data ?? data
    if (["success", "completed"].includes(record.state)) return record
    if (["fail", "failed"].includes(record.state)) {
      throw new Error(`Tarea ${taskId} falló: ${record.failMsg || "sin detalle"}`)
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) throw new Error(`Timeout esperando tarea ${taskId}`)
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

function extractResultUrl(record) {
  const urls = []
  if (Array.isArray(record.resultUrls)) urls.push(...record.resultUrls)
  if (typeof record.resultJson === "string") {
    try {
      const parsed = JSON.parse(record.resultJson)
      if (Array.isArray(parsed.resultUrls)) urls.push(...parsed.resultUrls)
      if (typeof parsed.url === "string") urls.push(parsed.url)
    } catch { /* ignore */ }
  }
  const url = urls.find((u) => typeof u === "string" && /^https?:\/\//.test(u))
  if (!url) throw new Error("La tarea terminó sin URL de resultado: " + JSON.stringify(record).slice(0, 300))
  return url
}

// ─── prompt ────────────────────────────────────────────────────────────────

function buildPrompt(target, overrides) {
  if (overrides[target.slug]) return overrides[target.slug]
  const desc = (target.description || "").replace(/\s+/g, " ").trim()
  const hint = desc ? ` (${desc.slice(0, 140)})` : ""
  return [
    `Professional e-commerce catalog photograph of ${target.name}${hint}.`,
    "Mexican wholesale grocery product, shown as the product itself without branded packaging:",
    "no text, no labels, no logos, no barcodes, no watermarks.",
    "Loose or plainly presented on a clean, light neutral background, soft diffused studio lighting,",
    "appetizing, true-to-life colors, sharp focus, high detail. Square 1:1 composition, product centered",
    "with generous margins. Fresh produce shown as a small natural pile; dry goods in a simple heap or",
    "plain unbranded clear container; meats and frozen items presented plainly without packaging.",
  ].join(" ")
}

// ─── pipeline por producto ─────────────────────────────────────────────────

async function generateOne(target, overrides) {
  const outFile = join(OUT_DIR, `${target.slug}.webp`)
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const taskId = await createImageTask(buildPrompt(target, overrides))
      const record = await pollTask(taskId)
      const url = extractResultUrl(record)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Descarga ${res.status} de ${url.slice(0, 80)}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await sharp(buf)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outFile)
      return `${PUBLIC_PREFIX}/${target.slug}.webp`
    } catch (err) {
      lastError = err
      console.warn(`  ⚠ ${target.slug} intento ${attempt}/${MAX_ATTEMPTS}: ${err.message}`)
    }
  }
  throw lastError
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean)
  const force = args.includes("--force")

  const targets = JSON.parse(readFileSync(TARGETS_PATH, "utf8"))
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : {}
  // Prompts personalizados por slug (variantes donde la preparación importa:
  // ala ADOBADA debe verse marinada, boneless BUFFALO con salsa, etc.).
  const OVERRIDES_PATH = join(ROOT, "scripts/product-images/prompt-overrides.json")
  const overrides = existsSync(OVERRIDES_PATH)
    ? JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"))
    : {}
  mkdirSync(OUT_DIR, { recursive: true })

  const pending = targets.filter((t) => {
    if (only && !only.includes(t.slug)) return false
    if (!force && manifest[t.slug] && existsSync(join(ROOT, "public", manifest[t.slug]))) return false
    return true
  })

  console.log(`Targets: ${targets.length} · pendientes: ${pending.length}${only ? ` · --only=${only.join(",")}` : ""}${force ? " · --force" : ""}`)

  let done = 0
  const failures = []
  const queue = [...pending]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const target = queue.shift()
      try {
        const publicPath = await generateOne(target, overrides)
        manifest[target.slug] = publicPath
        writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
        done++
        console.log(`✓ [${done}/${pending.length}] ${target.slug} → ${publicPath}`)
      } catch (err) {
        failures.push({ slug: target.slug, error: err.message })
        console.error(`✗ ${target.slug}: ${err.message}`)
      }
    }
  })
  await Promise.all(workers)

  console.log(`\nListo: ${done} generadas, ${failures.length} fallidas`)
  if (failures.length) {
    console.log("Fallidas:", failures.map((f) => f.slug).join(", "))
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
