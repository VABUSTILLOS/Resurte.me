import { chromium } from "@playwright/test"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 320, height: 780 } })
await page.goto("http://localhost:3000/cdmx", { waitUntil: "domcontentloaded" })
await page.waitForTimeout(2500)

const out = await page.evaluate(() => {
  const header = document.querySelector("header")
  const row = header.querySelector(".max-w-7xl").firstElementChild
  const logo = row.firstElementChild
  const spans = logo.querySelectorAll("span")
  const right = row.lastElementChild
  const font = getComputedStyle(spans[0]).fontFamily

  const measure = (size) => {
    spans.forEach((s) => (s.style.fontSize = size + "px"))
    return Math.round(logo.getBoundingClientRect().width)
  }
  const widths = {}
  for (const s of [11, 12, 13, 14, 15, 16, 18]) widths[s] = measure(s)
  spans.forEach((s) => (s.style.fontSize = ""))

  // ancho de cada boton del bloque derecho
  const buttons = Array.from(right.children).map((el) => {
    const cs = getComputedStyle(el)
    return {
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20),
      display: cs.display,
      minW: cs.minWidth,
      gap: cs.gap,
      w: Math.round(el.getBoundingClientRect().width),
    }
  })
  return {
    font,
    logoWidthByFontSize: widths,
    logoPadding: getComputedStyle(logo).padding + " / ml:" + getComputedStyle(logo).marginLeft,
    rowGap: getComputedStyle(row).gap,
    rightGap: getComputedStyle(right).gap,
    containerPadding: getComputedStyle(header.querySelector(".max-w-7xl")).paddingLeft,
    buttons,
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
