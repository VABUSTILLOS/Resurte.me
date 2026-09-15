import { describe, expect, it } from "vitest"
import {
  AI_ENGINES,
  buildAiReferralScript,
  classifyAiReferrer,
  isAiHost,
  normalizeHost,
} from "./ai-referrers"

describe("normalizeHost", () => {
  it("quita www y normaliza mayúsculas", () => {
    expect(normalizeHost("WWW.ChatGPT.com")).toBe("chatgpt.com")
  })

  it("devuelve cadena vacía para entradas vacías", () => {
    expect(normalizeHost("   ")).toBe("")
  })
})

describe("classifyAiReferrer", () => {
  it("reconoce los motores principales desde una URL completa", () => {
    expect(classifyAiReferrer("https://chatgpt.com/c/abc")?.engineId).toBe("chatgpt")
    expect(classifyAiReferrer("https://www.perplexity.ai/search?q=x")?.engineId).toBe("perplexity")
    expect(classifyAiReferrer("https://gemini.google.com/app")?.engineId).toBe("gemini")
    expect(classifyAiReferrer("https://copilot.microsoft.com/chats")?.engineId).toBe("copilot")
    expect(classifyAiReferrer("https://claude.ai/chat/1")?.engineId).toBe("claude")
  })

  it("acepta un host suelto sin esquema", () => {
    expect(classifyAiReferrer("chatgpt.com")?.engineId).toBe("chatgpt")
  })

  it("devuelve la etiqueta legible del motor", () => {
    expect(classifyAiReferrer("https://chatgpt.com/")?.engineLabel).toBe("ChatGPT")
    expect(classifyAiReferrer("https://copilot.microsoft.com/")?.engineLabel).toBe(
      "Microsoft Copilot"
    )
  })

  it("devuelve el host normalizado sin www", () => {
    expect(classifyAiReferrer("https://www.perplexity.ai/")?.host).toBe("perplexity.ai")
  })

  it("ignora el tráfico interno del propio sitio", () => {
    expect(
      classifyAiReferrer("https://resurte.me/blog/x", ["resurte.me", "www.resurte.me"])
    ).toBeNull()
  })

  it("devuelve null para buscadores normales y redes sociales", () => {
    expect(classifyAiReferrer("https://www.google.com/search?q=x")).toBeNull()
    expect(classifyAiReferrer("https://bing.com/search?q=x")).toBeNull()
    expect(classifyAiReferrer("https://t.co/abc")).toBeNull()
    expect(classifyAiReferrer("https://facebook.com/")).toBeNull()
  })

  it("devuelve null sin referrer", () => {
    expect(classifyAiReferrer(null)).toBeNull()
    expect(classifyAiReferrer(undefined)).toBeNull()
    expect(classifyAiReferrer("")).toBeNull()
    expect(classifyAiReferrer("   ")).toBeNull()
  })

  it("devuelve null ante un referrer malformado sin lanzar", () => {
    expect(classifyAiReferrer("no es una url")).toBeNull()
    expect(classifyAiReferrer("http://")).toBeNull()
  })

  it("no confunde un subdominio parecido con el motor real", () => {
    // chatgpt.com.evil.example no es chatgpt.com
    expect(classifyAiReferrer("https://chatgpt.com.evil.example/")).toBeNull()
  })

  it("cubre todos los motores declarados en AI_ENGINES", () => {
    for (const engine of AI_ENGINES) {
      const host = engine.hosts[0]
      expect(host, `${engine.id} sin hosts`).toBeDefined()
      expect(classifyAiReferrer(`https://${host}/`)?.engineId, engine.id).toBe(engine.id)
    }
  })

  it("no tiene hosts duplicados entre motores", () => {
    const todos = AI_ENGINES.flatMap((e) => e.hosts)
    expect(todos.length).toBe(new Set(todos).size)
  })
})

describe("isAiHost", () => {
  it("detecta hosts de motores", () => {
    expect(isAiHost("chatgpt.com")).toBe(true)
    expect(isAiHost("www.claude.ai")).toBe(true)
  })

  it("rechaza hosts ajenos", () => {
    expect(isAiHost("google.com")).toBe(false)
    expect(isAiHost("resurte.me")).toBe(false)
  })
})

describe("buildAiReferralScript", () => {
  const script = buildAiReferralScript("G-TEST123", ["resurte.me", "www.resurte.me"])

  it("incluye el id de GA4 y el nombre del evento", () => {
    expect(script).toContain("G-TEST123")
    expect(script).toContain("ai_referral")
  })

  it("serializa la lista de motores desde AI_ENGINES", () => {
    expect(script).toContain('"chatgpt"')
    expect(script).toContain('"perplexity"')
  })

  it("normaliza los hosts propios para descartar tráfico interno", () => {
    expect(script).toContain('"selfHosts":["resurte.me","resurte.me"]')
  })

  it("es un script autocontenido, sin imports ni referencias externas", () => {
    expect(script.startsWith("(function(){")).toBe(true)
    expect(script.trimEnd().endsWith("})();")).toBe(true)
    expect(script).not.toContain("import ")
    expect(script).not.toContain("require(")
  })

  it("no rompe el HTML: sin etiquetas script ni cierres prematuros", () => {
    expect(script).not.toContain("</script")
    expect(script).not.toContain("<script")
  })
})
